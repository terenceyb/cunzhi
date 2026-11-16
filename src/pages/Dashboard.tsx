import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Cake,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Dice5,
  ListChecks,
  Plus,
  RotateCcw,
  Users,
} from 'lucide-react'
import { DEFAULT_PREFS, buildCtx, useStore } from '../store'
import { useUI } from '../ui'
import { Avatar, Empty, Modal, PageHead, useBreakpoint } from '../components/ui'
import { IconSwap, TNumber } from '../components/motion'
import { InteractionDialog } from '../components/InteractionDialog'
import { TodoDialog } from '../components/PersonDetail'
import { TodoCenter } from '../components/TodoCenter'
import { buildPersonMeta, personName } from '../lib/derive'
import {
  bucketTodos,
  computeReminders,
  upcomingAnniversaries,
  weeklyStats,
} from '../lib/reminders'
import { cn, dayDiff, formatAnniversary, formatDate, relativeTime } from '../lib/utils'

const MODULE_META: Record<string, { title: string; icon: React.ReactNode }> = {
  reminders: { title: '走动提醒', icon: <Clock size={19} /> },
  todos: { title: '待办事项', icon: <ListChecks size={19} /> },
  anniversaries: { title: '纪念日', icon: <Cake size={19} /> },
}

type Cell = { x: number; y: number; w: number; h: number }

const GAP = 14
const ROW_H = 210
const EPS = 0.01

/** 列数：桌面 4 列、平板 2 列、手机 1 列（宫格越简单越好拖） */
function columnsFor(width: number): number {
  if (width >= 1080) return 4
  if (width >= 760) return 2
  return 1
}

function overlap(a: Cell, b: Cell): boolean {
  return (
    a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS
  )
}

/** 找第一个放得下的空位（先上后左） */
function freeSpot(taken: Cell[], w: number, h: number, cols: number): Cell {
  for (let y = 0; ; y += 0.5) {
    for (let x = 0; x + w <= cols + EPS; x += 1) {
      const cand = { x, y, w, h }
      if (!taken.some((t) => overlap(t, cand))) return cand
    }
  }
}

/** 把存储的网格坐标解算成实际摆放：放不下或被占位时按「先上后左」找空位，永不重叠 */
function resolveCells(keys: string[], cells: Record<string, Cell>, cols: number): Record<string, Cell> {
  const out: Record<string, Cell> = {}
  const taken: Cell[] = []
  const sorted = [...keys].sort((a, b) => (cells[a]?.y ?? 0) - (cells[b]?.y ?? 0) || (cells[a]?.x ?? 0) - (cells[b]?.x ?? 0))
  for (const key of sorted) {
    const c = cells[key]
    if (c && c.x >= 0 && c.x + c.w <= cols + EPS && !taken.some((t) => overlap(t, c))) {
      out[key] = c
      taken.push(c)
      continue
    }
    const w = Math.min(cols, Math.max(1, c?.w ?? 1))
    const h = Math.max(1, c?.h ?? 1)
    let y = 0
    let placed: Cell | null = null
    while (!placed) {
      for (let x = 0; x + w <= cols + EPS; x += 1) {
        const cand = { x, y, w, h }
        if (!taken.some((t) => overlap(t, cand))) {
          placed = cand
          break
        }
      }
      if (!placed) y += 0.5
    }
    out[key] = placed
    taken.push(placed)
  }
  return out
}

export function Dashboard() {
  const store = useStore()
  const ctx = useMemo(() => buildCtx(store), [store.persons, store.fieldDefinitions, store.groups, store.tags, store.timelineEvents, store.attachments])
  const prefs = store.prefs
  const setPrefs = store.setPrefs
  const layout = prefs.dashboardLayout
  const openPerson = useUI((s) => s.openPerson)
  const toast = useUI((s) => s.toast)
  const isMobile = useBreakpoint() === 'mobile'

  const reminders = useMemo(
    () =>
      computeReminders({
        persons: store.persons,
        policy: store.settings.reminderPolicy,
        smartViews: store.settings.smartViews,
        timelineEvents: store.timelineEvents,
        ctx,
      }),
    [store.persons, store.settings.reminderPolicy, store.settings.smartViews, store.timelineEvents, ctx],
  )
  const anns = useMemo(
    () => upcomingAnniversaries(store.anniversaries, store.persons, 7),
    [store.anniversaries, store.persons],
  )
  const todos = useMemo(() => bucketTodos(store.todos), [store.todos])
  const stats = useMemo(
    () => weeklyStats(store.persons, store.timelineEvents, store.todos),
    [store.persons, store.timelineEvents, store.todos],
  )

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [lastIndex, setLastIndex] = useState<number | null>(null)
  const [todoOpen, setTodoOpen] = useState(false)
  const [todoCenterOpen, setTodoCenterOpen] = useState(false)
  const [collapsedTodo, setCollapsedTodo] = useState<Record<string, boolean>>({})
  const [ixPerson, setIxPerson] = useState<string | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [live, setLive] = useState<Record<string, Cell>>({})
  const liveRef = useRef<Record<string, Cell>>({})
  const [vw, setVw] = useState(typeof window === 'undefined' ? 1440 : window.innerWidth)
  const boardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const cols = columnsFor(vw)
  // 桌面顺序由拖拽决定，移动端顺序在设置里调（默认 待办 → 走动提醒 → 纪念日）
  const rawOrder = isMobile ? prefs.dashMobileOrder : layout.order
  const order = rawOrder.filter((k) => MODULE_META[k])
  const base = useMemo(
    () => resolveCells(order, layout.cells ?? DEFAULT_PREFS.dashboardLayout.cells, cols),
    [order.join(','), layout.cells, cols],
  )
  const cells = { ...base, ...live }
  const rows = Math.max(2, Math.ceil(Math.max(...order.map((k) => cells[k].y + cells[k].h))))

  const commit = (next: Record<string, Cell>) => {
    liveRef.current = {}
    setLive({})
    setPrefs({ dashboardLayout: { ...layout, cells: { ...(layout.cells ?? {}), ...next } } })
  }

  const toggleCollapse = (key: string) => {
    const isCollapsed = layout.collapsed.includes(key)
    setPrefs({
      dashboardLayout: {
        ...layout,
        collapsed: isCollapsed ? layout.collapsed.filter((k) => k !== key) : [...layout.collapsed, key],
      },
    })
  }

  /** 几何换算：列宽 = (板宽 - 间隙) / 列数 */
  const metrics = () => {
    const rect = boardRef.current?.getBoundingClientRect()
    const width = rect?.width ?? 0
    return { rect, colW: (width - GAP * (cols - 1)) / cols, rowH: ROW_H + GAP }
  }

  /** 把「被挤到的人」排到最近空位，返回整盘新坐标 */
  const reflow = (key: string, target: Cell, from: Record<string, Cell>) => {
    const next: Record<string, Cell> = { ...from, [key]: target }
    const placed: Cell[] = [target]
    for (const k of order) {
      if (k === key) continue
      const other = next[k]
      if (placed.some((t) => overlap(t, other))) {
        const spot = freeSpot(placed, other.w, other.h, cols)
        next[k] = spot
        placed.push(spot)
      } else {
        placed.push(other)
      }
    }
    return next
  }

  /* 拖动卡片标题：跟手移动，途经的卡片实时让位，松手落在最近的格 */
  const startDrag = (key: string, e: React.PointerEvent) => {
    if (isMobile) return
    if ((e.target as HTMLElement).closest('button')) return
    const el = (e.currentTarget as HTMLElement).closest('.dash-module') as HTMLElement | null
    const { colW, rowH } = metrics()
    if (!el || !colW) return
    const c = cells[key]
    const ox = e.clientX
    const oy = e.clientY
    let moved = false
    let target: Cell = c
    setDragging(key)
    el.setAttribute('data-dragging', 'true')
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - ox
      const dy = ev.clientY - oy
      if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return
      moved = true
      el.style.translate = `${dx}px ${dy}px`
      const nx = Math.min(cols - Math.min(c.w, cols), Math.max(0, Math.round((c.x * (colW + GAP) + dx) / (colW + GAP))))
      const ny = Math.max(0, Math.round((c.y * rowH + dy) / rowH))
      if (nx !== target.x || ny !== target.y) {
        target = { ...c, x: nx, y: ny }
        const prev = liveRef.current
        const board = reflow(key, target, cells)
        // 只把「别人」的变化放进实时状态，被拖的那张继续跟手
        const next: Record<string, Cell> = {}
        for (const k of order) if (k !== key && (!prev[k] || prev[k].x !== board[k].x || prev[k].y !== board[k].y)) next[k] = board[k]
        liveRef.current = { ...prev, ...next }
        setLive(liveRef.current)
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      el.style.translate = ''
      el.removeAttribute('data-dragging')
      setDragging(null)
      if (!moved) return
      commit(reflow(key, target, cells))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const restoreLayout = () => {
    setPrefs({ dashboardLayout: DEFAULT_PREFS.dashboardLayout })
    toast('已恢复默认宫格布局', 'success')
  }

  const markSelected = () => {
    if (!selected.length) return
    setBatchOpen(true)
  }

  /** 卡片变高就多露几条，变矮就少露几条——内容跟着尺寸走 */
  const limitOf = (key: string) => (isMobile ? 99 : Math.max(2, Math.round((cells[key]?.h ?? 2) * 3)))

  const shuffle = () => {
    if (store.persons.length === 0) return
    const p = store.persons[Math.floor(Math.random() * store.persons.length)]
    openPerson(p.id)
  }

  return (
    <div className="page wide dash-page" data-accent={prefs.dashAccent ?? 'slate'}>
      <PageHead
        title={greeting()}
        desc={
          reminders.length > 0
            ? `今天有 ${reminders.length} 位人脉值得主动联系，先从最久没联系的那位开始。`
            : `共 ${stats.total} 位人脉 · 本周已联系 ${stats.contactedThisWeek} 人 · 关系维护得不错。`
        }
        actions={
          isMobile ? undefined : (
            <button className="btn sm ghost" onClick={restoreLayout} title="恢复默认位置与顺序">
              <RotateCcw size={13} /> 恢复默认布局
            </button>
          )
        }
      />

      <div
        className={isMobile ? 'dash-flow' : 'dash-board'}
        ref={boardRef}
        data-dragging={dragging ? 'true' : 'false'}
        style={
          isMobile
            ? undefined
            : {
                ['--cols' as string]: cols,
                ['--gap' as string]: `${GAP}px`,
                ['--rowh' as string]: `${ROW_H}px`,
                ['--rows' as string]: rows,
              }
        }
      >
        {order.map((key) => {
          const meta = MODULE_META[key]
          const collapsed = layout.collapsed.includes(key)
          const c = cells[key]
          const density = c.h >= 2.4 ? 'l' : c.h >= 1.4 ? 'm' : 's'
          return (
            <section
              key={key}
              className={cn('dash-module', collapsed && 'collapsed')}
              data-density={density}
              data-wide={c.w >= 1.9 ? 'true' : 'false'}
              data-collapsed={collapsed ? 'true' : 'false'}
              style={
                isMobile
                  ? undefined
                  : {
                      ['--x' as string]: c.x,
                      ['--y' as string]: c.y,
                      ['--w' as string]: c.w,
                      ['--h' as string]: c.h,
                    }
              }
            >
              <div className="dash-module-head" onPointerDown={(e) => startDrag(key, e)}>
                <span className="muted">{meta.icon}</span>
                {key === 'todos' ? (
                  <button className="dash-title-btn" onClick={() => setTodoCenterOpen(true)} title="打开待办中心">
                    <h2>{meta.title}</h2>
                    <ChevronRight size={14} />
                  </button>
                ) : (
                  <h2>{meta.title}</h2>
                )}
                {key === 'reminders' && reminders.length > 0 && (
                  <span className="badge">
                    <TNumber value={reminders.length} />
                  </span>
                )}
                {key === 'todos' && todos.today.length + todos.overdue.length > 0 && (
                  <span className="badge">
                    <TNumber value={todos.today.length + todos.overdue.length} />
                  </span>
                )}
                {key === 'anniversaries' && anns.length > 0 && (
                  <span className="badge soft">
                    <TNumber value={anns.length} />
                  </span>
                )}
                <div className="actions" onClick={(e) => e.stopPropagation()}>
                  {key === 'reminders' && reminders.length > 0 && (
                    <button
                      className={cn('btn sm ghost', selectMode && 'accent')}
                      onClick={() => {
                        setSelectMode((v) => !v)
                        setSelected([])
                      }}
                    >
                      {selectMode ? '取消' : '多选'}
                    </button>
                  )}
                  {key === 'todos' && (
                    <button className="btn icon sm" onClick={() => setTodoOpen(true)} aria-label="新建待办">
                      <Plus size={14} />
                    </button>
                  )}
                  {key === 'anniversaries' && (
                    <button className="btn icon sm" onClick={() => importBirthdays()} aria-label="从生日导入" title="从生日字段一键创建">
                      <Cake size={14} />
                    </button>
                  )}
                  <button
                    className="btn icon sm"
                    onClick={() => toggleCollapse(key)}
                    aria-label={collapsed ? '展开' : '折叠'}
                  >
                    <IconSwap open={!collapsed} a={<ChevronDown size={15} />} b={<ChevronRight size={15} />} />
                  </button>
                </div>
              </div>

              <div className="dash-module-body">
                {key === 'reminders' && (
                  <>
                    {reminders.length === 0 ? (
                      <Empty
                        icon={<Users size={20} />}
                        title="今天没有需要主动联系的人"
                        desc={`共 ${stats.total} 位人脉，本周已联系 ${stats.contactedThisWeek} 人。`}
                        action={
                          <button className="btn sm" onClick={shuffle}>
                            <Dice5 size={14} /> 随机翻一张名片
                          </button>
                        }
                      />
                    ) : (
                      <>
                        {reminders.slice(0, limitOf('reminders')).map((item, idx) => {
                          const meta = buildPersonMeta(item.person, ctx)
                          const on = selected.includes(item.person.id)
                          return (
                            <div
                              key={item.person.id}
                              className={cn('reminder-row', on && 'selected', selectMode && 'selecting')}
                              onClick={(e) => {
                                if (!selectMode) {
                                  openPerson(item.person.id)
                                  return
                                }
                                const id = item.person.id
                                if (e.shiftKey && lastIndex !== null) {
                                  const [a, b] = [Math.min(lastIndex, idx), Math.max(lastIndex, idx)]
                                  const range = reminders.slice(a, b + 1).map((r) => r.person.id)
                                  setSelected((prev) => [...new Set([...prev, ...range])])
                                } else {
                                  setSelected((prev) => (on ? prev.filter((x) => x !== id) : [...prev, id]))
                                  setLastIndex(idx)
                                }
                              }}
                            >
                              <span className="rr-person">
                                <Avatar
                                  name={meta.name}
                                  src={meta.avatar?.thumbnail}
                                  size={34}
                                  color={meta.groupColor}
                                />
                                {/* 复选框浮在头像上：多选时不挤动任何内容 */}
                                {selectMode && <span className={cn('rr-check', on && 'on')}>{on && <Check size={12} strokeWidth={3} />}</span>}
                              </span>
                              <div className="rr-main">
                                <div className="rr-name ellipsis">{meta.name}</div>
                                <div className="rr-sub">
                                  {meta.group && <span className="chip sm">{meta.group.name}</span>}
                                  <span className="rr-time">上次互动 {relativeTime(item.lastInteractionAt)}</span>
                                </div>
                                {item.suggestion && <div className="rr-suggest">{item.suggestion}</div>}
                              </div>
                              <span className={cn('overdue', item.overdueDays > 30 && 'cold')}>
                                逾期 {item.overdueDays} 天
                              </span>
                              {!selectMode && (
                                <div className="reminder-actions" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    className="btn sm"
                                    onClick={() => setIxPerson(item.person.id)}
                                  >
                                    已联系
                                  </button>
                                  <button
                                    className="btn icon sm"
                                    onClick={() => setIxPerson(item.person.id)}
                                    aria-label="记录互动"
                                    title="记录互动"
                                  >
                                    <Clock size={13} />
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                        {reminders.length > limitOf('reminders') && !selectMode && (
                          <div className="dash-more-hint">还有 {reminders.length - limitOf('reminders')} 位，放大卡片或去人脉页处理</div>
                        )}
                        {selectMode && (
                          <div className="bulk-bar" style={{ margin: '8px auto 4px' }}>
                            <span>已选 {selected.length} 人</span>
                            <button className="btn primary" onClick={markSelected} disabled={!selected.length}>
                              批量记录互动
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {key === 'todos' && (
                  <>
                    {(['overdue', 'today', 'week'] as const).map((bucket) => {
                      const list = todos[bucket].slice(0, Math.max(2, Math.ceil(limitOf('todos') / 2)))
                      if (list.length === 0) return null
                      const label = bucket === 'overdue' ? '逾期' : bucket === 'today' ? '今天' : '本周'
                      const isCollapsed = collapsedTodo[bucket]
                      return (
                        <div key={bucket}>
                          <button
                            className="todo-group-label"
                            onClick={() => setCollapsedTodo((c) => ({ ...c, [bucket]: !c[bucket] }))}
                          >
                            {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                            {label}
                            <span style={{ marginLeft: 2 }}>{list.length}</span>
                          </button>
                          {!isCollapsed &&
                            list.map((t) => {
                              const person = store.persons.find((p) => p.id === t.personId)
                              return (
                                <div key={t.id} className="todo-item">
                                  <button
                                    className="check"
                                    onClick={() => {
                                      if (t.personId) {
                                        useUI.getState().askConfirm({
                                          title: '完成待办',
                                          message: `是否同时记录为一次与「${personName(person)}」的互动？这会重置走动提醒计时。`,
                                          confirmText: '完成并记录互动',
                                          onConfirm: () => store.toggleTodo(t.id, true),
                                          secondaryText: '仅完成',
                                          onSecondary: () => store.toggleTodo(t.id, false),
                                        })
                                      } else {
                                        store.toggleTodo(t.id, false)
                                      }
                                    }}
                                    aria-label="完成待办"
                                  />
                                  <div className="grow">
                                    <div className="title">
                                      {t.priority === 'important' && <span className="important">● </span>}
                                      {t.title}
                                    </div>
                                    <div className="sub">
                                      {person && <span>{personName(person)}</span>}
                                      <span>截止 {formatDate(t.dueDate)}</span>
                                      {dayDiff(new Date(t.dueDate)) > 0 && (
                                        <span style={{ color: 'var(--danger)' }}>逾期 {dayDiff(new Date(t.dueDate))} 天</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                        </div>
                      )
                    })}
                    {todos.overdue.length + todos.today.length + todos.week.length === 0 && (
                      <Empty icon={<ListChecks size={20} />} title="没有待办" desc="从人脉详情页创建待办，会自动回流到这里。" />
                    )}
                  </>
                )}

                {key === 'anniversaries' && (
                  <>
                    {anns.length === 0 ? (
                      <Empty
                        icon={<Cake size={20} />}
                        title="未来 7 天没有纪念日"
                        desc="生日、合作周年都会在这里提醒，当天以高亮卡片呈现。"
                        action={
                          <button className="btn sm" onClick={importBirthdays}>
                            从生日字段导入
                          </button>
                        }
                      />
                    ) : (
                      anns.slice(0, limitOf('anniversaries')).map(({ anniversary, person, daysLeft }) => {
                        const meta = buildPersonMeta(person, ctx)
                        return (
                          <div key={anniversary.id} className={cn('anniv-item', daysLeft === 0 && 'today')}>
                            <div className="anniv-date">
                              <div className="d">{daysLeft === 0 ? '今天' : daysLeft}</div>
                              <div className="m">{daysLeft === 0 ? '当天' : '天后'}</div>
                            </div>
                            <Avatar name={meta.name} src={meta.avatar?.thumbnail} size={30} color={meta.groupColor} />
                            <div className="grow" style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.name}</div>
                              <div className="field-hint">
                                {anniversary.label}
                                {anniversary.label === '生日' && ` · ${formatAnniversary(anniversary.date)}`}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </>
                )}
              </div>

            </section>
          )
        })}
      </div>

      <div className="dash-foot">
        <span>提示：拖动卡片标题可调整位置，撞到的卡片会自动让位</span>
        <span>· 折叠状态与位置会保存在本设备</span>
        <span>· ⌘/Ctrl + Shift + N 随时速记</span>
      </div>

      <TodoDialog open={todoOpen} onClose={() => setTodoOpen(false)} />
      <TodoCenter open={todoCenterOpen} onClose={() => setTodoCenterOpen(false)} onNew={() => setTodoOpen(true)} />
      <InteractionDialog
        open={!!ixPerson}
        onClose={() => setIxPerson(null)}
        person={store.persons.find((p) => p.id === ixPerson) ?? null}
      />
      <BatchInteractionDialog
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        ids={selected}
        onDone={() => {
          setSelected([])
          setSelectMode(false)
        }}
      />
    </div>
  )

  function importBirthdays() {
    const existing = new Set(store.anniversaries.filter((a) => a.type === 'birthday').map((a) => a.personId))
    let count = 0
    for (const p of store.persons) {
      const b = p.fields.birthday as { value: string } | undefined
      if (!b?.value || existing.has(p.id)) continue
      store.addAnniversary({
        personId: p.id,
        type: 'birthday',
        label: '生日',
        date: b.value.slice(5),
        advanceDays: store.settings.reminderPolicy.anniversaryAdvanceDays,
      })
      count++
    }
    toast(count ? `已从生日字段创建 ${count} 个纪念日` : '所有生日都已存在纪念日', count ? 'success' : 'info')
  }
}

/* 批量记录互动：一次把同一条联系记录写入多人的时间线 */
function BatchInteractionDialog({
  open,
  onClose,
  ids,
  onDone,
}: {
  open: boolean
  onClose: () => void
  ids: string[]
  onDone: () => void
}) {
  const channels = useStore((s) => s.prefs.channels)
  const addTimeline = useStore((s) => s.addTimeline)
  const patchPerson = useStore((s) => s.patchPerson)
  const toast = useUI((s) => s.toast)
  const [channel, setChannel] = useState(channels[0] ?? '电话')
  const [text, setText] = useState('')

  useEffect(() => {
    if (!open) return
    setText('')
    setChannel(channels[0] ?? '电话')
  }, [open])

  const save = () => {
    const note = text.trim() || '已联系'
    for (const id of ids) {
      addTimeline(id, 'reach_out', `${channel}：${note}`, undefined, channel)
      patchPerson(id, { snoozeUntil: null, ignoredReminders: 0 })
    }
    toast(`已为 ${ids.length} 人记录互动`, 'success')
    onDone()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      narrow
      title={`批量记录互动（${ids.length} 人）`}
      formId="batch-ix-form"
      onSubmit={save}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="submit" form="batch-ix-form">
            保存到时间线
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="field">
          <span className="field-label">互动方式</span>
          <div className="chip-row">
            {channels.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={channel === c}
                className={cn('chip', channel === c && 'accent')}
                onClick={() => setChannel(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">这次聊了什么（会写入每个人脉的时间线）</span>
          <textarea
            className="textarea"
            rows={3}
            value={text}
            placeholder="例如：活动上打了招呼，回头发资料"
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}
