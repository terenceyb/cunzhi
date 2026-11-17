/* ============================================================================
   动效运行时：只放「算数」，不碰 DOM。
   ----------------------------------------------------------------------------
   这里是 InlineTextMorph 的弹簧积分、缓动常量与 RAF 循环。抽出来是为了让
   引擎（InlineTextMorphEngine.js）只关心结构与测量，动画曲线换起来不影响逻辑。
   ========================================================================== */

export const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v)

/** 文字变形的标准曲线：起步快、收尾极缓，和 Apple 的转场手感接近 */
export const EASE_TEXT = 'cubic-bezier(0.19, 1, 0.22, 1)'
export const TEXT_MS = 200
export const ICON_IN_MS = 300
export const ICON_OUT_MS = 140

export type Scalar = { p: number; v: number }

export const scalar = (p = 0, v = 0): Scalar => ({ p, v })

/** 弹簧参数：刚度、阻尼、质量 */
export type SpringSpec = { stiffness: number; damping: number; mass: number }

export const SPRING_WIDTH: SpringSpec = { stiffness: 600, damping: 34, mass: 1 }

const MAX_DT = 1 / 30
const SUB_STEPS = 4

/**
 * 一帧的弹簧积分。dt 上限 1/30 秒，内部拆 4 个子步，
 * 掉帧时不会因为步长过大把弹簧算爆。
 * 返回 true 表示已经贴住目标值、可以停积分了。
 */
export function stepSpring(state: Scalar, target: number, spec: SpringSpec, dt: number): boolean {
  const step = clamp(dt, 0, MAX_DT) / SUB_STEPS
  for (let i = 0; i < SUB_STEPS; i++) {
    const force = (target - state.p) * spec.stiffness - state.v * spec.damping
    state.v += (force / spec.mass) * step
    state.p += state.v * step
  }
  if (Math.abs(target - state.p) < 0.02 && Math.abs(state.v) < 0.05) {
    state.p = target
    state.v = 0
    return true
  }
  return false
}

/** 过冲用的缓出曲线（图标层进场 1.1 → 1 的回落） */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5)
}

/** 弹簧近似的过冲：0 → 1.1 → 1 */
export function overshootCurve(t: number, peak = 0.1): number {
  const t1 = clamp(t, 0, 1)
  return 1 - (1 - t1) * (1 - t1) * (1 - t1) * (1 - t1) - peak * Math.sin(Math.PI * t1) * (1 - t1)
}

type Frame = (dt: number, now: number) => boolean

/** 单例 RAF 循环：多个实例共用一根时间轴，省掉一堆独立 requestAnimationFrame */
export class Ticker {
  private frames = new Set<Frame>()
  private raf = 0
  private last = 0

  add(fn: Frame) {
    this.frames.add(fn)
    this.start()
  }

  remove(fn: Frame) {
    this.frames.delete(fn)
    if (this.frames.size === 0) this.stop()
  }

  private start() {
    if (this.raf) return
    this.last = performance.now()
    const loop = (now: number) => {
      const dt = (now - this.last) / 1000
      this.last = now
      for (const fn of [...this.frames]) {
        if (fn(dt, now)) this.frames.delete(fn)
      }
      if (this.frames.size === 0) {
        this.raf = 0
        return
      }
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  private stop() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  clear() {
    this.frames.clear()
    this.stop()
  }
}

export const ticker = new Ticker()
