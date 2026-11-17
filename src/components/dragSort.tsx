import React, { useCallback, useEffect, useRef, useState } from 'react'

/* 拖动排序：只用 pointer 事件 + transform，不依赖 HTML5 draggable。
   · 只有按住「柄」才开始拖，行里的输入框、开关照常可用；
   · 拖动中这一行跟手走，其余行按目标位置实时让位（160ms ease-out）；
   · 目标位置由「指针落在第几行」算出，落点即所见，松手才写入顺序。 */
export function useDragSort({
  keys,
  onReorder,
}: {
  keys: string[]
  onReorder: (from: number, to: number) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [target, setTarget] = useState<number | null>(null)
  const stateRef = useRef<{ from: number; to: number; step: number; startY: number } | null>(null)

  const clearMotion = useCallback(() => {
    const root = containerRef.current
    if (!root) return
    root.classList.remove('is-sorting')
    root.querySelectorAll<HTMLElement>('[data-sort-key]').forEach((el) => {
      el.style.transform = ''
      el.style.zIndex = ''
      el.classList.remove('is-dragging')
    })
  }, [])

  useEffect(() => () => clearMotion(), [clearMotion])

  const start = (key: string, e: React.PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return
    const root = containerRef.current
    const from = keys.indexOf(key)
    if (!root || from < 0) return
    const rows = [...root.querySelectorAll<HTMLElement>('[data-sort-key]')]
    const row = rows[from]
    if (!row) return
    const rect = row.getBoundingClientRect()
    const next = rows[from + 1]
    const step = next ? Math.max(24, next.getBoundingClientRect().top - rect.top) : rect.height
    const startY = e.clientY
    stateRef.current = { from, to: from, step, startY }
    setActiveKey(key)
    setTarget(from)
    root.classList.add('is-sorting')
    row.classList.add('is-dragging')
    row.style.zIndex = '3'

    const move = (ev: PointerEvent) => {
      const st = stateRef.current
      if (!st) return
      const dy = ev.clientY - st.startY
      row.style.transform = `translateY(${dy}px)`
      const to = Math.min(keys.length - 1, Math.max(0, st.from + Math.round(dy / st.step)))
      if (to !== st.to) {
        st.to = to
        setTarget(to)
        // 其余行：被跨过的整段让位一格，方向随拖动方向
        rows.forEach((el, j) => {
          if (j === st.from) return
          let offset = 0
          if (st.from < to && j > st.from && j <= to) offset = -st.step
          else if (st.from > to && j >= to && j < st.from) offset = st.step
          el.style.transform = offset ? `translateY(${offset}px)` : ''
        })
      }
    }

    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      const st = stateRef.current
      stateRef.current = null
      clearMotion()
      setActiveKey(null)
      setTarget(null)
      if (st && st.to !== st.from) onReorder(st.from, st.to)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  /** 挂在拖动柄上：只有这里按下才进入拖动态 */
  const gripProps = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => start(key, e),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    'aria-label': '按住拖动调整顺序',
    tabIndex: -1 as const,
  })

  return { containerRef, activeKey, target, gripProps }
}
