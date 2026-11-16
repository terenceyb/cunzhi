import { useEffect, useRef, useState } from 'react'

/* ---------------------------------------------------------------------------
   transitions.dev 状态机（原生 DOM，无动画库）
   状态只有两种：open / closed。切换 = 改 data-state 属性。
   关闭不是瞬间卸载：先把 data-state 置 closed，等 --*-close-dur 走完再清理。
--------------------------------------------------------------------------- */

export type TState = 'open' | 'closed'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 读取 CSS 变量里的时长（支持 250ms / 0.25s），并叠加 reduced-motion 归零 */
export function tokenMs(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  if (prefersReducedMotion()) return 0
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n)) return fallback
  return raw.endsWith('ms') ? n : raw.endsWith('s') ? n * 1000 : n
}

/** 命令式切换：给任意元素写上 data-state */
export function setTState(el: Element | null | undefined, state: TState) {
  if (el instanceof HTMLElement) el.dataset.state = state
}

/**
 * 挂载 + 状态：给 React 弹层用。
 * open=true  → mounted=true，下一帧才置 open（保证 closed 首帧被渲染，动画才跑得起来）
 * open=false → 先置 closed，等 closeToken 走完再 unmount
 */
export function usePresence(
  open: boolean,
  closeToken = '--modal-close-dur',
  closeFallback = 150,
): { mounted: boolean; state: TState } {
  const [mounted, setMounted] = useState(open)
  const [state, setState] = useState<TState>('closed')

  useEffect(() => {
    if (open) {
      setMounted(true)
      const raf = requestAnimationFrame(() => setState('open'))
      return () => cancelAnimationFrame(raf)
    }
    setState('closed')
    const ms = tokenMs(closeToken, closeFallback)
    const timer = window.setTimeout(() => setMounted(false), ms)
    return () => window.clearTimeout(timer)
  }, [open, closeToken, closeFallback])

  return { mounted, state }
}

/** 重播 error shake：先清干净再置 shaking，否则同一元素第二次不触发 */
export function replayShake(el: HTMLElement | null | undefined) {
  if (!el) return
  el.dataset.state = 'closed'
  void el.offsetWidth // 强制回流，把动画基线拉回起点
  el.dataset.state = 'shaking'
  const ms = tokenMs('--shake-dur-a', 80) * 2 + tokenMs('--shake-dur-b', 60) * 2
  window.setTimeout(() => {
    if (el.dataset.state === 'shaking') el.dataset.state = 'closed'
  }, ms + 20)
}

/** 面板入场：挂载后下一帧置 open */
export function useRevealState(delay = 1): TState {
  const [state, setState] = useState<TState>('closed')
  useEffect(() => {
    let raf = 0
    let raf2 = 0
    raf = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setState('open'))
    })
    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(raf2)
    }
  }, [delay])
  return state
}

/* ---------------------------------------------------------------------------
   card tilt：指针在外层平面积上移动，把角度/光点写进内层卡片的 CSS 变量
   规范原文参数：MAX = 14deg（边缘峰值），光标位置归一化到 0~1 后换算：
     rotateY = (px - 0.5) * MAX     → 左右两边向指针方向转
     rotateX = (0.5 - py) * MAX     → 上下两边向指针方向转
   本项目按 pointerType 限定鼠标：触摸端保持原生滚动与点击（见 transitions.css 注释 b）
--------------------------------------------------------------------------- */
export function attachTilt(tilt: HTMLElement, card: HTMLElement, maxDeg = 14): () => void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
  let frame = 0
  let point: { x: number; y: number } | null = null

  const reset = () => {
    tilt.dataset.state = 'closed'
    card.dataset.state = 'closed'
    card.style.setProperty('--tilt-rx', '0deg')
    card.style.setProperty('--tilt-ry', '0deg')
  }

  // 一帧只读一次 rect、写一次变量：避免 pointermove 高频触发时的读写穿插（layout thrash）
  const apply = () => {
    frame = 0
    if (!point) return
    const r = tilt.getBoundingClientRect()
    if (!r.width || !r.height) return
    const px = Math.min(1, Math.max(0, (point.x - r.left) / r.width))
    const py = Math.min(1, Math.max(0, (point.y - r.top) / r.height))
    card.style.setProperty('--tilt-ry', ((px - 0.5) * maxDeg).toFixed(2) + 'deg')
    card.style.setProperty('--tilt-rx', ((0.5 - py) * maxDeg).toFixed(2) + 'deg')
    card.style.setProperty('--tilt-gx', (px * 100).toFixed(1) + '%')
    card.style.setProperty('--tilt-gy', (py * 100).toFixed(1) + '%')
  }

  const track = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || reduce.matches) return
    point = { x: e.clientX, y: e.clientY }
    tilt.dataset.state = 'open'
    card.dataset.state = 'open'
    if (!frame) frame = requestAnimationFrame(apply)
  }

  const leave = (e: PointerEvent) => {
    // 触摸的 pointerleave 不代表手势结束（滚动中也会触发），交给原生滚动处理
    if (e.pointerType !== 'mouse') return
    point = null
    if (frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }
    reset()
  }

  tilt.addEventListener('pointermove', track)
  tilt.addEventListener('pointerleave', leave)
  tilt.addEventListener('pointercancel', leave)

  return () => {
    if (frame) cancelAnimationFrame(frame)
    tilt.removeEventListener('pointermove', track)
    tilt.removeEventListener('pointerleave', leave)
    tilt.removeEventListener('pointercancel', leave)
    reset()
  }
}

/* ---------------------------------------------------------------------------
   number pop-in：把数字串拆成「未变的高位 + 变化的槽位」
--------------------------------------------------------------------------- */

export type DigitPart =
  | { same: true; ch: string }
  | { same: false; ch: string; old: string | null; stagger: number }

export function buildDigitParts(from: string, to: string): DigitPart[] {
  let same = 0
  while (same < from.length && same < to.length && from[same] === to[same]) same++
  return [...to].map((ch, i) => {
    if (i < same || !/\d/.test(ch)) return { same: true as const, ch }
    const fromEnd = to.length - 1 - i
    const oldCh = from[from.length - (to.length - i)]
    return {
      same: false as const,
      ch,
      old: oldCh && /\d/.test(oldCh) ? oldCh : null,
      stagger: fromEnd === 1 ? 1 : fromEnd === 0 ? 2 : 0,
    }
  })
}

/** 数字变化时给一个「动画播完就回 closed」的脉冲状态 */
export function useDigitPulse(value: string): { state: TState; from: string; seq: number } {
  const prev = useRef(value)
  const [from, setFrom] = useState(value)
  const [seq, setSeq] = useState(0)
  const [state, setState] = useState<TState>('closed')

  useEffect(() => {
    if (prev.current === value) return
    setFrom(prev.current)
    prev.current = value
    setSeq((n) => n + 1)
  }, [value])

  useEffect(() => {
    if (!seq) return
    setState('closed')
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setState('open'))
    })
    const ms =
      tokenMs('--digit-dur', 600) + tokenMs('--digit-stagger', 40) * 2 + tokenMs('--digit-enter-delay', 50) + 40
    const timer = window.setTimeout(() => setState('closed'), ms)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      window.clearTimeout(timer)
    }
  }, [seq])

  return { state, from, seq }
}
