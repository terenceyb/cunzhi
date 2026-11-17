/**
 * motion-runtime.ts
 * ---------------------------------------------------------------------------
 * ElasticPanelResize 的运动运行时：只做三件事
 *   1. 弹簧积分（半隐式欧拉，参数由调用方给定）
 *   2. 指数插值（用于描边粗细、长度、透明度这类「不需要回弹」的量）
 *   3. rAF 循环（dt 封顶 1/30，避免切回标签页时一步跳飞）
 *
 * 不依赖任何框架、不碰 DOM，可在主线程任意实例间共享。
 */

export interface Spring {
  /** 当前值 */
  value: number
  /** 目标值 */
  target: number
  /** 速度（单位/秒） */
  velocity: number
  /** 刚度 */
  k: number
  /** 阻尼 */
  c: number
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function spring(k: number, c: number, value = 0, target = value): Spring {
  return { value, target, velocity: 0, k, c }
}

/**
 * 半隐式欧拉：先积速度再积位置，比显式欧拉稳定得多。
 * h 为子步长（秒），调用方负责把一帧拆成若干子步。
 */
export function stepSpring(s: Spring, h: number): void {
  s.velocity += ((s.target - s.value) * s.k - s.velocity * s.c) * h
  s.value += s.velocity * h
}

/** 弹簧是否已经可以吸附：位置差与速度都足够小 */
export function springSettled(s: Spring, epsValue: number, epsVelocity: number): boolean {
  return Math.abs(s.target - s.value) < epsValue && Math.abs(s.velocity) < epsVelocity
}

/** 把弹簧直接钉在目标上，速度清零 */
export function settleSpring(s: Spring): void {
  s.value = s.target
  s.velocity = 0
}

/**
 * 指数插值：current += (target - current) * (1 - e^(-rate * dt))
 * 与帧率无关，rate 越大越快，适合做「跟随但不回弹」的形变。
 */
export function expApproach(current: number, target: number, dt: number, rate: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

export interface MotionLoop {
  start(): void
  stop(): void
  isRunning(): boolean
}

/**
 * 单实例的 rAF 循环。
 * frame(dt) 返回 true 表示继续，返回 false 表示本轮自动停止。
 * dt 单位为秒，最大 1/30。
 */
export function createLoop(frame: (dt: number) => boolean): MotionLoop {
  let handle = 0
  let last = 0
  let running = false

  const tick = (now: number) => {
    if (!running) return
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60
    last = now
    if (frame(dt)) handle = requestAnimationFrame(tick)
    else running = false
  }

  return {
    start() {
      if (running) return
      running = true
      last = 0
      handle = requestAnimationFrame(tick)
    },
    stop() {
      running = false
      last = 0
      if (handle) cancelAnimationFrame(handle)
      handle = 0
    },
    isRunning() {
      return running
    },
  }
}
