/**
 * motion-runtime.ts —— 框架无关的运动核心
 *
 * 五个标量（opening / selection / compression / press / content）全部走同一个
 * 半隐式欧拉弹簧：每帧 dt 切成 3 个子步，v 先更新、p 后更新。
 * 这样在 30fps 的弱机上也不会爆，且中途反向时位置与速度都连续。
 *
 * 这里的函数没有状态、没有 DOM 依赖，Vue/Svelte/Solid/Preact/Vanilla 都能直接用。
 */

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/** 指数趋近：与帧率无关的插值，用于不需要弹簧的位置量 */
export const expApproach = (cur: number, target: number, rate: number, dt: number): number =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt))

export interface Spring {
  /** 当前位置 */
  p: number
  /** 当前速度 */
  v: number
  /** 目标位置 */
  t: number
  /** 刚度 */
  k: number
  /** 阻尼 */
  d: number
}

export const spring = (k: number, d: number, p = 0): Spring => ({ p, v: 0, t: 0, k, d })

/** 一帧推进：dt 切成 SUBSTEPS 个子步，保证大 dt 下也稳定 */
export const SUBSTEPS = 3

export function stepSpring(s: Spring, dt: number): void {
  const h = dt / SUBSTEPS
  for (let i = 0; i < SUBSTEPS; i++) {
    s.v += ((s.t - s.p) * s.k - s.v * s.d) * h
    s.p += s.v * h
  }
}

/** 误差与速度都足够小：可以吸附并停掉 RAF */
export const springSettled = (s: Spring): boolean =>
  Math.abs(s.t - s.p) < 1e-4 && Math.abs(s.v) < 1e-3

export function snapSpring(s: Spring): void {
  s.p = s.t
  s.v = 0
}

/** 给速度一个冲量，带上限（负方向同样限幅） */
export function impulse(s: Spring, amount: number, cap: number): void {
  s.v = clamp(s.v + amount, -cap, cap)
}

export function setTarget(s: Spring, target: number, keepVelocity = true): void {
  s.t = target
  if (!keepVelocity) s.v = 0
}

/**
 * 单 RAF 循环：所有实例各持一个，闲置即停。
 * fn 返回 true 表示「这一帧还有变化」，返回 false 就停表。
 */
export interface Loop {
  start(): void
  stop(): void
  readonly running: boolean
}

export function createLoop(fn: (dt: number) => boolean): Loop {
  let raf = 0
  let last = 0
  let running = false

  const tick = (now: number) => {
    if (!running) return
    const elapsed = last ? (now - last) / 1000 : 1 / 60
    last = now
    // 掉帧时不要一次性补太多，最多按 32ms 算
    const dt = Math.min(0.032, Math.max(0.001, elapsed))
    const more = fn(dt)
    if (more && running) {
      raf = requestAnimationFrame(tick)
    } else {
      running = false
      raf = 0
      last = 0
    }
  }

  return {
    start() {
      if (running) return
      running = true
      last = 0
      raf = requestAnimationFrame(tick)
    },
    stop() {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      last = 0
    },
    get running() {
      return running
    },
  }
}

/** 线性插值，给阴影 / 透明度这类需要按比例过渡的量用 */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** 把 0..1 映射到 [a,b] 之间的字符串，避免每帧手拼模板 */
export const rgba = (r: number, g: number, b: number, a: number): string =>
  `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`
