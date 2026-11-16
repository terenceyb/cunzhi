import { useEffect, useRef } from 'react'

/**
 * 悬浮滚动条：自绘一条亚克力 thumb 浮在页面最上层，
 * 原生滚动条宽度归零，因此内容不再被挤压、也不会遮挡任何内容。
 */
export function OverlayScrollbar() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bar = ref.current
    if (!bar) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

    let target: HTMLElement | null = null
    let hideTimer: number | undefined
    let dragging = false

    const pick = (): HTMLElement | null => {
      const list = Array.from(
        document.querySelectorAll<HTMLElement>('.content, .people-scroll, .detail-body, .modal-body')
      )
      let best: HTMLElement | null = null
      let bestOver = 0
      for (const el of list) {
        const over = el.scrollHeight - el.clientHeight
        if (over > 8 && over > bestOver) {
          best = el
          bestOver = over
        }
      }
      return best
    }

    const paint = () => {
      if (!target) {
        bar.classList.remove('is-on')
        return
      }
      const over = target.scrollHeight - target.clientHeight
      if (over <= 8) {
        bar.classList.remove('is-on')
        return
      }
      const rect = target.getBoundingClientRect()
      const track = rect.height - 12
      const h = Math.max(36, Math.round((rect.height / target.scrollHeight) * track))
      const max = over
      const ratio = Math.min(1, Math.max(0, target.scrollTop / max))
      const top = rect.top + 6 + Math.round((track - h) * ratio)
      bar.style.height = `${h}px`
      bar.style.transform = `translateY(${top}px)`
      bar.style.right = `${Math.max(3, window.innerWidth - rect.right + 3)}px`
    }

    const flash = () => {
      if (!target) return
      bar.classList.add('is-on')
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => {
        if (!dragging) bar.classList.remove('is-on')
      }, 1100)
    }

    const onScroll = (e: Event) => {
      const el = (e.target as HTMLElement) || null
      if (el && el !== target && el.nodeType === 1) {
        const over = el.scrollHeight - el.clientHeight
        if (el.matches?.('.content, .people-scroll, .detail-body, .modal-body') && over > 8) target = el
      }
      paint()
      flash()
    }

    const refresh = () => {
      const next = pick()
      if (next !== target) target = next
      paint()
    }

    // 拖动 thumb
    const onDown = (e: PointerEvent) => {
      if (!target) return
      dragging = true
      bar.classList.add('is-drag')
      bar.setPointerCapture(e.pointerId)
      e.preventDefault()
      const rect = target.getBoundingClientRect()
      const startY = e.clientY
      const startTop = target.scrollTop
      const track = rect.height - 12
      const thumbH = bar.getBoundingClientRect().height
      const perPx = (target.scrollHeight - target.clientHeight) / Math.max(1, track - thumbH)
      const move = (ev: PointerEvent) => {
        if (!target) return
        target.scrollTop = startTop + (ev.clientY - startY) * perPx
        paint()
      }
      const up = () => {
        dragging = false
        bar.classList.remove('is-drag')
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        flash()
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }

    refresh()
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', refresh)
    const ro = new ResizeObserver(refresh)
    ro.observe(document.body)
    bar.addEventListener('pointerdown', onDown)
    if (!reduce) bar.style.transition = 'opacity 240ms ease'

    return () => {
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', refresh)
      ro.disconnect()
      bar.removeEventListener('pointerdown', onDown)
      window.clearTimeout(hideTimer)
    }
  }, [])

  return <div ref={ref} className="cz-scrollbar" aria-hidden="true" />
}
