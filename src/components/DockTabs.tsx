import { useEffect, useRef, useState } from 'react'
import { ListTodo, Sparkles, SquarePen, UserPlus } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * 移动端底部 dock —— 只跑在 767px 以下。
 *
 * 三条硬约束写在这里，后续改动别破坏：
 * 1. 每个 tab 的图标元素不变（原生 lucide 图标 + 徽标），只换光效与动效；
 * 2. 指示块是「无极」的：--pos 是浮点，拖动时直接跟手，不是跳到某个整数;
 * 3. 最右侧那颗是速记入口（沿用原 Sparkles 图标），点开弹出新建人脉 / 速记 / 新建待办。
 */

export type DockItem = { key: string; label: string; icon: React.ReactNode; badge: number }

export function DockMenu({
  open,
  onClose,
  onNewPerson,
  onNote,
  onNewTodo,
}: {
  open: boolean
  onClose: () => void
  onNewPerson: () => void
  onNote: () => void
  onNewTodo: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  /* 打开时把焦点收进菜单，Esc 直接收起，点空白处也收起 */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest('.dock-menu, .dock-fab')) return
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open, onClose])

  if (!open) return null

  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }

  const rows = [
    { icon: <UserPlus size={16} />, title: '新建人脉', desc: '录入一位新联系人', fn: onNewPerson },
    { icon: <SquarePen size={16} />, title: '速记', desc: '随手记一条，稍后归到人身上', fn: onNote },
    { icon: <ListTodo size={16} />, title: '新建待办', desc: '加一件要跟的事', fn: onNewTodo },
  ]

  return (
    <div ref={ref} className="dock-menu" role="menu" aria-label="速记与新建">
      {rows.map((r, i) => (
        <button
          key={r.title}
          className="dock-menu-item"
          role="menuitem"
          style={{ ['--mi' as string]: i }}
          onClick={run(r.fn)}
        >
          <span className="mi-ico" aria-hidden>
            {r.icon}
          </span>
          <span className="mi-text">
            <span className="mi-title">{r.title}</span>
            <span className="mi-desc">{r.desc}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

export function DockTabs({
  items,
  activeIdx,
  isOn,
  onPick,
  renderBadge,
  onFab,
  menuOpen,
  setMenuOpen,
  onNewPerson,
  onNote,
  onNewTodo,
}: {
  items: readonly DockItem[]
  activeIdx: number
  isOn: (key: string) => boolean
  onPick: (key: string) => void
  renderBadge: (item: DockItem) => React.ReactNode
  onFab: () => void
  menuOpen: boolean
  setMenuOpen: (v: boolean) => void
  onNewPerson: () => void
  onNote: () => void
  onNewTodo: () => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  /** 拖动中的浮点位置：0.37 这种值直接喂给指示块，所以是「无极」的 */
  const [dragPos, setDragPos] = useState<number | null>(null)
  const [lens, setLens] = useState<{ x: number; k: number } | null>(null)
  const drag = useRef({ active: false, startX: 0, moved: false, pointerId: -1 })
  const lensTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (lensTimer.current) window.clearTimeout(lensTimer.current)
    },
    [],
  )

  /** 指针 x → 「第几格」的浮点值 */
  const posAt = (clientX: number) => {
    const el = trackRef.current
    if (!el) return activeIdx
    const r = el.getBoundingClientRect()
    const w = r.width / items.length
    if (!w) return activeIdx
    const raw = (clientX - r.left) / w - 0.5
    return Math.min(items.length - 1, Math.max(0, raw))
  }

  /** 按下去那一下的折射光斑 */
  const fireRefract = (clientX: number) => {
    const nav = trackRef.current?.closest('.bottom-tabs') as HTMLElement | null
    const r = nav?.getBoundingClientRect()
    if (!r) return
    setLens({ x: clientX - r.left, k: Date.now() })
    if (lensTimer.current) window.clearTimeout(lensTimer.current)
    lensTimer.current = window.setTimeout(() => setLens(null), 640)
  }

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock-fab, .dock-menu, .dock-scrim')) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { active: true, startX: e.clientX, moved: false, pointerId: e.pointerId }
    trackRef.current?.setPointerCapture?.(e.pointerId)
    setDragPos(posAt(e.clientX))
    fireRefract(e.clientX)
  }

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return
    if (Math.abs(e.clientX - drag.current.startX) > 4) drag.current.moved = true
    setDragPos(posAt(e.clientX))
  }

  const onUp = (e: React.PointerEvent) => {
    if (!drag.current.active) return
    const target = posAt(e.clientX)
    drag.current.active = false
    trackRef.current?.releasePointerCapture?.(drag.current.pointerId)
    setDragPos(null)
    const next = items[Math.round(target)]
    if (next) onPick(next.key)
  }

  const pos = dragPos ?? activeIdx

  return (
    <nav
      className="bottom-tabs"
      aria-label="底部导航"
      data-drag={dragPos !== null ? 'true' : 'false'}
      data-menu={menuOpen ? 'true' : 'false'}
      style={{ ['--c' as string]: items.length }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {/* 玻璃膜：一层高光 + 一层随指针走的折射透镜（都裁在玻璃边缘内） */}
      <span className="tab-glass" aria-hidden>
        <span className="tab-glass-shine" />
        {lens && <span key={lens.k} className="tab-lens" style={{ ['--lx' as string]: `${lens.x}px` }} />}
      </span>

      {menuOpen && (
        <>
          <span className="dock-scrim" aria-hidden />
          <DockMenu
            open
            onClose={() => setMenuOpen(false)}
            onNewPerson={onNewPerson}
            onNote={onNote}
            onNewTodo={onNewTodo}
          />
        </>
      )}

      <div className="tabs-track" ref={trackRef}>
        <span className="tab-pill" aria-hidden style={{ ['--pos' as string]: `${pos}` }} />
        {items.map((item, i) => {
          const on = isOn(item.key)
          /** 到指针的「格数距离」：0 = 正踩在上面，1 = 相邻 */
          const d = Math.abs(pos - i)
          return (
            <button
              key={item.key}
              className={cn('tab', on && 'active')}
              aria-current={on ? 'page' : undefined}
              onClick={() => {
                // 拖完松手时浏览器还会补一个 click，落在起点那个 tab 上，这里吞掉
                if (drag.current.moved) {
                  drag.current.moved = false
                  return
                }
                onPick(item.key)
              }}
              data-on={on ? 'true' : 'false'}
              style={{ ['--ti' as string]: i, ['--d' as string]: `${d}` }}
            >
              <span className="tab-ico">
                <span className="tab-ico-base">{item.icon}</span>
                <span className="tab-ico-on" aria-hidden>
                  {item.icon}
                </span>
                {renderBadge(item)}
              </span>
              <span className="tab-label">{item.label}</span>
            </button>
          )
        })}
      </div>

      <button
        className="dock-fab"
        aria-label="速记与新建"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onPointerDown={(e) => fireRefract(e.clientX)}
        onClick={() => {
          setMenuOpen(!menuOpen)
          onFab()
        }}
      >
        <Sparkles size={19} />
      </button>
    </nav>
  )
}

