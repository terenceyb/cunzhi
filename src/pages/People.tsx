import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownUp,
  Check,
  ChevronDown,
  Columns3,
  Download,
  Filter,
  LayoutGrid,
  List,
  Network,
  Plus,
  Rows3,
  Search,
  Tag,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import type { FieldDefinition, Person } from '../types'
import { buildCtx, useStore } from '../store'
import { useUI } from '../ui'
import { GIcon } from '../components/glass/GIcon'
import { Avatar, Empty, Menu, Segmented, useBreakpoint } from '../components/ui'
import { PersonCard } from '../components/PersonCard'
import { WalletStackView } from '../components/WalletCard'
import { PersonDetail } from '../components/PersonDetail'
import { createElasticPanelResize } from '../components/elastic/ElasticPanelResizeEngine'
import { ActiveFilterChips, FilterTrigger } from '../components/FilterPanel'
import { NetworkView } from './Network'
import { buildPersonMeta, displayValue, personName } from '../lib/derive'
import { applyFilter } from '../lib/filter'
import { computeReminders } from '../lib/reminders'
import { pinyinOf } from '../lib/search'
import { channelLabel, normalizeChannels } from '../lib/channels'
import { cn, relativeTime } from '../lib/utils'

type SortKey = 'lastInteraction' | 'namePinyin' | 'createdAt' | 'urgency'

export function People() {
  const store = useStore()
  const ctx = useMemo(
    () => buildCtx(store),
    [store.persons, store.fieldDefinitions, store.groups, store.tags, store.timelineEvents, store.attachments],
  )
  const ui = useUI()
  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'
  const filter = ui.filter
  const rawView = ui.peopleView
  const view = rawView
  const setView = ui.setPeopleView
  const selectedId = ui.selectedId
  const detailOpen = ui.detailOpen
  const [sortKey, setSortKey] = useState<SortKey>(store.prefs.sortMode as SortKey)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [lastClicked, setLastClicked] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const toast = ui.toast
  const askConfirm = ui.askConfirm
  const askPrompt = ui.askPrompt

  /* 详情浮层的顶边：从工具栏下沿再让 8px，筛选行与右侧视图切换、新建按钮都不会被盖住 */
  const toolbarRef = useRef<HTMLDivElement>(null)
  const layoutRef = useRef<HTMLDivElement>(null)
  const [detailTop, setDetailTop] = useState(10)
  useEffect(() => {
    const el = toolbarRef.current
    const layout = el?.closest('.people-layout') as HTMLElement | null
    if (!el || !layout) return
    const measure = () => {
      const lr = layout.getBoundingClientRect()
      const tr = el.getBoundingClientRect()
      setDetailTop(Math.max(10, Math.round(tr.bottom - lr.top + 8)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  /* 详情面板左边缘：弹性把手（ElasticPanelResize 引擎）接管拖动，
     位置与弯曲都由引擎逐帧计算，这里只负责把宽度落进 prefs。
     1199px 以下面板宽度由样式表锁定（460px），引擎直接销毁，把手随之消失。 */
  const setPrefs = store.setPrefs
  const panelWidthRef = useRef(store.prefs.detailPanelWidth)
  useEffect(() => {
    if (!detailOpen) return
    let engine: ReturnType<typeof createElasticPanelResize> | null = null

    const setup = () => {
      const host = layoutRef.current
      const panel = host?.querySelector<HTMLElement>('.detail-panel')
      if (!host || !panel) return
      if (window.innerWidth < 1200) {
        engine?.destroy()
        engine = null
        return
      }
      if (engine) return
      engine = createElasticPanelResize({
        host,
        panel,
        minWidth: 400,
        maxWidth: 640,
        initialWidth: Math.min(640, Math.max(400, panelWidthRef.current)),
        rightGap: 10,
        ariaLabel: '调整详情面板宽度',
        onChange: (m) => host.style.setProperty('--detail-w', `${Math.round(m.width)}px`),
        onCommit: (m) => {
          panelWidthRef.current = Math.round(m.width)
          setPrefs({ detailPanelWidth: Math.round(m.width) })
        },
      })
    }

    setup()
    window.addEventListener('resize', setup)
    return () => {
      window.removeEventListener('resize', setup)
      engine?.destroy()
      engine = null
      layoutRef.current?.style.removeProperty('--detail-w')
    }
  }, [detailOpen, setPrefs])

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
  const urgencyMap = useMemo(() => new Map(reminders.map((r) => [r.person.id, r.overdueDays])), [reminders])

  const filtered = useMemo(() => applyFilter(store.persons, filter, ctx), [store.persons, filter, ctx])

  const rows = useMemo(() => {
    let list = filtered
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((p) => {
        const name = personName(p)
        const py = pinyinOf(name)
        return (
          name.toLowerCase().includes(q) ||
          py.full.includes(q) ||
          py.initials.includes(q) ||
          String(p.fields.company ?? '').toLowerCase().includes(q)
        )
      })
    }
    const arr = [...list]
    switch (sortKey) {
      case 'namePinyin':
        arr.sort((a, b) => pinyinOf(personName(a)).full.localeCompare(pinyinOf(personName(b)).full))
        break
      case 'createdAt':
        arr.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        break
      case 'urgency':
        arr.sort((a, b) => (urgencyMap.get(b.id) ?? -1) - (urgencyMap.get(a.id) ?? -1))
        break
      default:
        arr.sort((a, b) => {
          const la = buildPersonMeta(a, ctx).lastInteractionAt
          const lb = buildPersonMeta(b, ctx).lastInteractionAt
          if (!la && !lb) return +new Date(b.createdAt) - +new Date(a.createdAt)
          if (!la) return 1
          if (!lb) return -1
          return +new Date(lb) - +new Date(la)
        })
    }
    return arr
  }, [filtered, sortKey, urgencyMap, ctx, query])

  const selectedPerson = selectedId ? store.persons.find((p) => p.id === selectedId) : undefined

  const toggleSelect = (id: string, index: number, shift: boolean) => {
    if (shift && lastClicked !== null) {
      const [a, b] = [Math.min(lastClicked, index), Math.max(lastClicked, index)]
      const range = rows.slice(a, b + 1).map((p) => p.id)
      setSelectedIds((prev) => [...new Set([...prev, ...range])])
      return
    }
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    setLastClicked(index)
  }

  const allSelected = rows.length > 0 && selectedIds.length === rows.length

  return (
    <div
      ref={layoutRef}
      className={cn('people-layout', detailOpen && 'detail-open')}
      style={{
        ['--detail-w' as string]: `${Math.max(400, store.prefs.detailPanelWidth)}px`,
        ['--detail-top' as string]: `${detailTop}px`,
      }}
    >
      <div className="people-list-col">
        <div className="people-toolbar" ref={toolbarRef}>
          <div className="pt-main">
            <div className="search-box pt-search">
              <Search size={15} />
              <input
                className="input sm"
                placeholder="在结果中搜索…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {isMobile && <SmartViewMenu ctx={ctx} />}
            {isMobile ? <FilterTrigger /> : <ActiveFilterChips ctx={ctx} />}
          </div>
          <div className="pt-tools">
            <span className="field-hint pt-count">{rows.length} 人</span>
            <Menu
              trigger={(open) => (
                <button className="btn icon sm glass-icon" onClick={open} aria-label="排序">
                  <GIcon name="sort" size={17} />
                </button>
              )}
              items={[
                { label: '最近互动', onClick: () => setSortKey('lastInteraction') },
                { label: '姓名拼音', onClick: () => setSortKey('namePinyin') },
                { label: '添加时间', onClick: () => setSortKey('createdAt') },
                { label: '走动紧迫度', onClick: () => setSortKey('urgency') },
              ]}
            />
            <Segmented
              value={view}
              onChange={(v) => setView(v)}
              ariaLabel="视图切换"
              options={
                isMobile
                  ? [
                      { value: 'cards' as const, label: '', icon: <GIcon name="list" size={17} /> },
                      { value: 'grid' as const, label: '', icon: <GIcon name="grid" size={17} /> },
                      { value: 'network' as const, label: '', icon: <GIcon name="network" size={17} /> },
                    ]
                  : [
                      { value: 'cards' as const, label: '', icon: <GIcon name="list" size={17} /> },
                      { value: 'grid' as const, label: '', icon: <GIcon name="grid" size={17} /> },
                      { value: 'table' as const, label: '', icon: <GIcon name="table" size={17} /> },
                      { value: 'network' as const, label: '', icon: <GIcon name="network" size={17} /> },
                    ]
              }
            />
            <button className="btn sm primary" onClick={() => useUI.getState().openPersonForm()}>
              <Plus size={14} />
              <span className="hide-mobile">新建</span>
            </button>
          </div>
        </div>

        {isMobile && <ActiveFilterChips ctx={ctx} hideButton />}

        {view === 'table' && <TableToolbar ctx={ctx} />}

        <div className={cn('people-scroll', view === 'table' && 'tight')}>
          {rows.length === 0 ? (
            <Empty
              icon={<Users size={20} />}
              title={store.persons.length === 0 ? '还没有人脉' : '没有符合条件的人脉'}
              desc={
                store.persons.length === 0
                  ? store.groups.length === 0
                    ? '从添加第一个人开始。也可以先建一个群组（如：同事、客户），之后按群组分类与配色。'
                    : '从添加第一个人开始。也可以先导入一场活动收到的名片 CSV。'
                  : '尝试减少筛选条件，或清空筛选查看全部。'
              }
              action={
                store.persons.length === 0 ? (
                  <div className="row" style={{ gap: 6, marginTop: 4 }}>
                    <button className="btn sm primary" onClick={() => useUI.getState().openPersonForm()}>
                      新建人脉
                    </button>
                    <button className="btn sm" onClick={() => useUI.setState({ importOpen: true })}>
                      导入 CSV
                    </button>
                    <button
                      className="btn sm ghost"
                      onClick={() => {
                        store.loadDemo()
                        toast('已载入示例数据，可随时在设置里清空', 'success')
                      }}
                    >
                      载入示例
                    </button>
                  </div>
                ) : (
                  <button className="btn sm" onClick={ui.clearFilter}>
                    清空筛选
                  </button>
                )
              }
            />
          ) : view === 'cards' ? (
            <WalletStackView rows={rows} ctx={ctx} />
          ) : view === 'grid' ? (
            <div className="card-grid">
              {rows.map((p) => {
                const meta = buildPersonMeta(p, ctx)
                return (
                  <PersonCard
                    key={p.id}
                    meta={meta}
                    ctx={ctx}
                    selected={selectedId === p.id}
                    view="grid"
                    onOpen={() => ui.openPerson(p.id)}
                  />
                )
              })}
            </div>
          ) : view === 'table' ? (
            <VirtualTable
              rows={rows}
              ctx={ctx}
              selectedIds={selectedIds}
              activeId={selectedId}
              onToggle={(id, idx, shift) => toggleSelect(id, idx, shift)}
              onDelete={(id) => {
                const person = store.persons.find((x) => x.id === id)
                if (!person) return
                askConfirm({
                  title: `删除「${personName(person)}」？`,
                  message: '其互动记录、待办与纪念日将一并删除，可用 ⌘/Ctrl+Z 撤销。',
                  confirmText: '删除',
                  danger: true,
                  onConfirm: () => {
                    store.deletePerson(id, 'snapshot')
                    toast('已删除联系人', 'success')
                  },
                })
              }}
              onOpen={(id) => ui.openPerson(id)}
              allSelected={allSelected}
              onToggleAll={() => setSelectedIds(allSelected ? [] : rows.map((p) => p.id))}
            />
          ) : (
            <NetworkView rows={rows} ctx={ctx} />
          )}

          {view === 'table' && selectedIds.length > 0 && (
            <div className="bulk-bar">
              <span>已选 {selectedIds.length} 人</span>
              <button
                className="btn"
                onClick={() =>
                  askPrompt({
                    title: '批量打标签',
                    message: '输入标签名，多个用逗号分隔；不存在会自动创建。',
                    placeholder: '例如：活动、重点客户',
                    onSubmit: (v) => {
                      const names = v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
                      if (!names.length) return
                      const tagsNow = useStore.getState().tags
                      const reused = names.filter((n) => tagsNow.some((t) => t.name === n))
                      const ids = names.map((n) => {
                        const exist = tagsNow.find((t) => t.name === n)
                        return exist ? exist.id : useStore.getState().addTag(n)
                      })
                      store.bulkPatch(selectedIds, {})
                      const persons = useStore.getState().persons.map((p) => {
                        if (!selectedIds.includes(p.id)) return p
                        const cur = (p.fields.tags as string[]) ?? []
                        return { ...p, fields: { ...p.fields, tags: [...new Set([...cur, ...ids])] } }
                      })
                      useStore.setState({ persons })
                      toast(
                        reused.length
                          ? `已为 ${selectedIds.length} 人添加标签，${reused.length} 个标签已存在，已直接复用`
                          : `已为 ${selectedIds.length} 人添加标签`,
                        'success',
                      )
                      setSelectedIds([])
                    },
                  })
                }
              >
                <Tag size={13} /> 打标签
              </button>
              <Menu
                trigger={(open) => (
                  <button className="btn" onClick={open}>
                    改群组
                  </button>
                )}
                items={ctx.groups.map((g) => ({
                  label: g.name,
                  onClick: () => {
                    store.bulkPatch(selectedIds, { groups: g.id })
                    toast(`已改为「${g.name}」`, 'success')
                    setSelectedIds([])
                  },
                }))}
              />
              <Menu
                trigger={(open) => (
                  <button className="btn" onClick={open}>
                    设频率
                  </button>
                )}
                items={[
                  { label: '每周', onClick: () => setFreq(7) },
                  { label: '每两周', onClick: () => setFreq(14) },
                  { label: '每月', onClick: () => setFreq(30) },
                  { label: '每季度', onClick: () => setFreq(90) },
                  { label: '跟随全局', onClick: () => setFreq(null) },
                ]}
              />
              <button className="btn" onClick={() => store.exportVCardFile(selectedIds)}>
                <Download size={13} /> 导出
              </button>
              <button
                className="btn danger"
                onClick={() =>
                  askConfirm({
                    title: `删除 ${selectedIds.length} 位联系人？`,
                    message: '其互动记录、待办与纪念日将一并删除，可用 ⌘/Ctrl+Z 撤销。',
                    confirmText: '删除',
                    danger: true,
                    onConfirm: () => {
                      store.deleteMany(selectedIds)
                      setSelectedIds([])
                      toast('已删除所选联系人', 'success')
                    },
                  })
                }
              >
                <Trash2 size={13} /> 删除
              </button>
              <button className="btn" onClick={() => setSelectedIds([])} aria-label="取消选择">
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {detailOpen && selectedPerson && (
        <div className="detail-panel">
          <PersonDetail personId={selectedPerson.id} ctx={ctx} onClose={() => ui.closePerson()} embedded={false} />
        </div>
      )}
    </div>
  )

  function setFreq(days: number | null) {
    const persons = useStore.getState().persons.map((p) =>
      selectedIds.includes(p.id) ? { ...p, reminderFrequencyDays: days } : p,
    )
    useStore.setState({ persons })
    toast(`已为 ${selectedIds.length} 人设置联系频率`, 'success')
    setSelectedIds([])
  }
}

function TableToolbar({ ctx }: { ctx: ReturnType<typeof buildCtx> }) {
  const prefs = useStore((s) => s.prefs)
  const setPrefs = useStore((s) => s.setPrefs)
  const defs = ctx.fieldDefinitions.filter((d) => d.type !== 'timeline')
  const columns = [
    { key: 'name', label: '姓名', locked: true },
    ...defs.filter((d) => d.key !== 'name' && d.key !== 'avatar').map((d) => ({ key: d.key, label: d.label, locked: false })),
    { key: 'lastInteraction', label: '上次互动', locked: false },
  ]
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(prefs.columnConfig)
  const openPanel = () => {
    setDraft(prefs.columnConfig)
    setOpen(true)
  }
  const selectable = columns.filter((c) => !c.locked)
  const toggle = (key: string) =>
    setDraft((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  return (
    <>
      <div className="filter-bar">
        <span className="field-hint">列：</span>
        <button className={cn('btn sm', open && 'accent')} onClick={() => (open ? setOpen(false) : openPanel())} aria-expanded={open}>
          <Columns3 size={13} /> 配置列
        </button>
        <span className="field-hint">· 点表头排序，点单元格改字，改完点右下角「保存」统一写入</span>
      </div>
      {open && (
        <div className="col-config">
          <div className="col-config-head">
            <strong>显示哪些列</strong>
            <span className="field-hint">勾选后点保存，表格才会按新配置刷新</span>
            <button
              className="btn sm ghost col-all"
              onClick={() =>
                setDraft(
                  selectable.every((c) => draft.includes(c.key))
                    ? columns.filter((c) => c.locked).map((c) => c.key)
                    : columns.map((c) => c.key),
                )
              }
            >
              {selectable.every((c) => draft.includes(c.key)) ? '全不选' : '全选'}
            </button>
          </div>
          <div className="col-config-grid">
            {columns.map((c) => {
              const on = draft.includes(c.key)
              return (
                <button
                  key={c.key}
                  className={cn('col-check', on && 'on')}
                  role="checkbox"
                  aria-checked={on}
                  disabled={c.locked}
                  onClick={() => toggle(c.key)}
                >
                  <span className={cn('check', on && 'on')}>{on && <Check size={13} strokeWidth={3} />}</span>
                  <span className="ellipsis">{c.label}</span>
                </button>
              )
            })}
          </div>
          <div className="col-config-foot">
            <button
              className="btn sm ghost"
              onClick={() => setDraft(['name', 'phones', 'company', 'groups', 'tags', 'city', 'lastInteraction'])}
            >
              恢复默认
            </button>
            <div className="row" style={{ gap: 6, marginLeft: 'auto' }}>
              <button className="btn sm" onClick={() => setOpen(false)}>
                取消
              </button>
              <button
                className="btn sm primary"
                onClick={() => {
                  setPrefs({ columnConfig: draft.length ? draft : ['name'] })
                  setOpen(false)
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function VirtualTable({
  rows,
  ctx,
  selectedIds,
  activeId,
  onToggle,
  onOpen,
  allSelected,
  onToggleAll,
  onDelete,
}: {
  rows: Person[]
  ctx: ReturnType<typeof buildCtx>
  selectedIds: string[]
  activeId: string | null
  onToggle: (id: string, index: number, shift: boolean) => void
  onOpen: (id: string) => void
  allSelected: boolean
  onToggleAll: () => void
  onDelete: (id: string) => void
}) {
  const prefs = useStore((s) => s.prefs)
  const updatePerson = useStore((s) => s.updatePerson)
  const toast = useUI((s) => s.toast)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(600)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  // roving tabindex：整个表格只留一个 Tab 落点，行内用 ↑↓ 走
  const [focusIdx, setFocusIdx] = useState(0)
  /* 行级草稿：{ 人脉 id: { 字段 key: 新值 } }。改完的格子先落在这里，点保存才写入 */
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({})
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null)
  const rowH = 54

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    setHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const columns = useMemo(() => {
    const list = prefs.columnConfig.map((key) => {
      if (key === 'lastInteraction') return { key, label: '上次互动', def: undefined as FieldDefinition | undefined }
      const def = ctx.fieldDefinitions.find((d) => d.key === key)
      return def ? { key, label: def.label, def } : null
    })
    return list.filter(Boolean) as { key: string; label: string; def?: FieldDefinition }[]
  }, [prefs.columnConfig, ctx.fieldDefinitions])

  const sorted = useMemo(() => {
    const arr = [...rows]
    const def = ctx.fieldDefinitions.find((d) => d.key === sort.key)
    arr.sort((a, b) => {
      if (sort.key === 'name') return personName(a).localeCompare(personName(b), 'zh-Hans-CN') * sort.dir
      if (sort.key === 'lastInteraction') {
        const la = buildPersonMeta(a, ctx).lastInteractionAt ?? ''
        const lb = buildPersonMeta(b, ctx).lastInteractionAt ?? ''
        return la.localeCompare(lb) * sort.dir
      }
      const va = displayValue(def, a.fields[sort.key], ctx)
      const vb = displayValue(def, b.fields[sort.key], ctx)
      return va.localeCompare(vb, 'zh-Hans-CN') * sort.dir
    })
    return arr
  }, [rows, sort, ctx])

  const start = Math.max(0, Math.floor(scrollTop / rowH) - 8)
  const visible = sorted.slice(start, start + Math.ceil(height / rowH) + 16)
  const padTop = start * rowH
  const padBottom = Math.max(0, (sorted.length - start - visible.length) * rowH)

  /* ---------------- 行级草稿 ---------------- */
  const dirtyIds = Object.keys(drafts)
  const dirtyCount = dirtyIds.reduce((n, id) => n + Object.keys(drafts[id]).length, 0)
  const setCell = (id: string, key: string, value: unknown) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [key]: value } }))
  const dropRow = (id: string) =>
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  const saveRow = (id: string) => {
    const patch = drafts[id]
    if (!patch) return
    updatePerson(id, patch)
    dropRow(id)
  }
  const saveAll = () => {
    if (!dirtyIds.length) return
    dirtyIds.forEach((id) => saveRow(id))
    setEditing(null)
    toast(dirtyIds.length === 1 ? '已保存这行的修改' : `已保存 ${dirtyIds.length} 行的修改`, 'success')
  }
  const nameOf = (id: string) => {
    const p = rows.find((x) => x.id === id)
    return p ? personName(p) : '这一行'
  }
  const revertAll = () => {
    setDrafts({})
    setEditing(null)
    toast('已撤销未保存的修改')
  }

  const onRowKey = (e: React.KeyboardEvent<HTMLTableRowElement>, p: Person, idx: number) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = idx + (e.key === 'ArrowDown' ? 1 : -1)
      if (next < 0 || next >= sorted.length) return
      setFocusIdx(next)
      const wrap = scrollRef.current
      if (wrap) {
        const top = next * rowH
        if (top < wrap.scrollTop) wrap.scrollTop = top
        else if (top + rowH > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = top + rowH - wrap.clientHeight
      }
      requestAnimationFrame(() => wrap?.querySelector<HTMLElement>(`tr[data-idx="${next}"]`)?.focus())
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      onOpen(p.id)
      return
    }
    // 列表项用 ⌘/Ctrl + Backspace 删除（与 macOS 列表的习惯一致）
    if ((e.metaKey || e.ctrlKey) && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault()
      onDelete(p.id)
    }
  }

  return (
    <div
      className={cn('table-wrap', selectedIds.length > 0 && 'has-bulk')}
      ref={scrollRef}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
    >
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 38, paddingLeft: 12 }}>
              <button className={cn('check', allSelected && 'on')} onClick={onToggleAll} aria-label="全选">
                {allSelected && <Check size={16} strokeWidth={2.6} />}
              </button>
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                className="sortable"
                onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === 1 ? -1 : 1 }))}
              >
                {c.label}
                {sort.key === c.key && <span className="sort-ind">{sort.dir === 1 ? '↑' : '↓'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {padTop > 0 && (
            <tr aria-hidden>
              <td colSpan={columns.length + 1} style={{ height: padTop, padding: 0, border: 'none' }} />
            </tr>
          )}
          {visible.map((p) => {
            const idx = sorted.indexOf(p)
            const meta = buildPersonMeta(p, ctx)
            const selected = selectedIds.includes(p.id)
            const rowDraft = drafts[p.id]
            const rowDirty = !!rowDraft && Object.keys(rowDraft).length > 0
            return (
              <tr
                key={p.id}
                data-idx={idx}
                tabIndex={idx === focusIdx ? 0 : -1}
                className={cn(selected && 'selected', activeId === p.id && 'active', rowDirty && 'has-draft')}
                onClick={() => onOpen(p.id)}
                onFocus={() => setFocusIdx(idx)}
                onKeyDown={(e) => onRowKey(e, p, idx)}
              >
                <td style={{ paddingLeft: 12 }} onClick={(e) => e.stopPropagation()}>
                  <button
                    className={cn('check', selected && 'on')}
                    onClick={(e) => onToggle(p.id, idx, e.shiftKey)}
                    aria-label={`选择 ${meta.name}`}
                  >
                    {selected && <Check size={16} strokeWidth={2.6} />}
                  </button>
                </td>
                {columns.map((c) => {
                  const dirty = rowDraft ? Object.prototype.hasOwnProperty.call(rowDraft, c.key) : false
                  const isEditing = editing?.id === p.id && editing.key === c.key
                  /* 姓名与「上次互动」不参与就地编辑：点行（含头像与姓名）直接开详情 */
                  if (c.key === 'name') {
                    return (
                      <td key={c.key} className="cell-name">
                        <span className="row cell-name-row" style={{ gap: 7 }}>
                          <Avatar name={meta.name} src={meta.avatar?.thumbnail} size={22} color={meta.groupColor} />
                          <span className="cell-text">{meta.name}</span>
                        </span>
                      </td>
                    )
                  }
                  if (c.key === 'lastInteraction') {
                    return (
                      <td key={c.key}>
                        <span className="muted">{relativeTime(meta.lastInteractionAt)}</span>
                      </td>
                    )
                  }
                  if (!c.def) return <td key={c.key} />
                  const def = c.def
                  const value = dirty ? rowDraft[c.key] : p.fields[def.key]
                  const simple = isSimpleField(def)
                  return (
                    <td
                      key={c.key}
                      className={cn(def.type === 'phone' && 'cell-multi', dirty && 'is-dirty')}
                      data-field={def.key}
                    >
                      {isEditing ? (
                        <CellEditor
                          def={def}
                          value={p.fields[def.key]}
                          onCommit={(next) => {
                            /* 值没变就不留草稿，避免「点一下就算改过」 */
                            const same = JSON.stringify(next ?? null) === JSON.stringify(p.fields[def.key] ?? null)
                            if (!same) setCell(p.id, def.key, next)
                            setEditing(null)
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      ) : simple ? (
                        <button
                          type="button"
                          className={cn('cell-view', dirty && 'dirty')}
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditing({ id: p.id, key: def.key })
                          }}
                          title="点击编辑"
                        >
                          <span className="cell-text">{cellText(def, value, ctx) || <span className="muted">—</span>}</span>
                        </button>
                      ) : (
                        <span className="cell-static" title="这一列在详情页里编辑">
                          {def.type === 'phone' ? (
                            <PhoneLines person={{ ...p, fields: { ...p.fields, phones: dirty ? value : p.fields.phones } }} />
                          ) : (
                            <span className="cell-text">
                              {cellText(def, value, ctx) || <span className="muted">—</span>}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {padBottom > 0 && (
            <tr aria-hidden>
              <td colSpan={columns.length + 1} style={{ height: padBottom, padding: 0, border: 'none' }} />
            </tr>
          )}
        </tbody>
      </table>

      {/* 行级保存条：改完多个格子只需要点一次「保存」 */}
      {dirtyCount > 0 && (
        <div className="save-bar" role="status">
          <span className="save-bar-text">
            {dirtyIds.length === 1 ? `「${nameOf(dirtyIds[0])}」改了 ${dirtyCount} 项` : `${dirtyIds.length} 行共 ${dirtyCount} 项修改`}
            <span className="save-bar-hint">未写入，点保存才生效</span>
          </span>
          <button className="btn sm primary" onClick={saveAll}>
            保存
          </button>
          <button className="btn sm ghost" onClick={revertAll}>
            撤销
          </button>
        </div>
      )}
    </div>
  )
}

/* 表格里只做「基础编辑」的字段类型：文本 / 数字 / 日期 / 单选。
   多值、附件、地址、关系、名片码这些结构复杂的，点行进详情页改。 */
const SIMPLE_TYPES = ['text', 'longtext', 'number', 'date', 'select'] as const
function isSimpleField(def: FieldDefinition) {
  return (SIMPLE_TYPES as readonly string[]).includes(def.type)
}

/** 单元格纯文本：日期、单选这些都要按字段配置转出可读值 */
function cellText(def: FieldDefinition, value: unknown, ctx: ReturnType<typeof buildCtx>) {
  if (def.type === 'date') {
    const dv = value as { value?: string } | string | undefined
    const iso = typeof dv === 'string' ? dv : dv?.value
    if (!iso) return ''
    return iso.slice(0, 10)
  }
  return displayValue(def, value, ctx)
}

/* 就地编辑器：高度、字号、内边距与原单元格一致，不放大、不遮住相邻单元格 */
function CellEditor({
  def,
  value,
  onCommit,
  onCancel,
}: {
  def: FieldDefinition
  value: unknown
  onCommit: (next: unknown) => void
  onCancel: () => void
}) {
  const initial = useMemo(() => {
    if (def.type === 'date') {
      const dv = value as { value?: string } | string | undefined
      return (typeof dv === 'string' ? dv : dv?.value)?.slice(0, 10) ?? ''
    }
    if (value == null) return ''
    return String(value)
  }, [def.type, value])
  const [draft, setDraft] = useState(initial)
  const done = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    if (!save) {
      onCancel()
      return
    }
    if (def.type === 'number') {
      const t = draft.trim()
      onCommit(t === '' ? '' : Number.isNaN(Number(t)) ? t : Number(t))
      return
    }
    if (def.type === 'date') {
      const dv = value as { value?: string; hasTime?: boolean } | undefined
      const hasTime = dv?.hasTime ?? def.config.hasTime ?? false
      const time = hasTime ? (dv?.value?.slice(11, 16) ?? '00:00') : ''
      onCommit(draft ? { value: hasTime ? `${draft}T${time}` : draft, hasTime } : null)
      return
    }
    onCommit(draft.trim() === '' ? null : draft)
  }

  useEffect(() => {
    const el = boxRef.current?.querySelector<HTMLElement>('input, select, textarea')
    el?.focus()
    if (el instanceof HTMLInputElement) el.select()
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      finish(true)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      finish(false)
    }
  }

  return (
    <div
      ref={boxRef}
      className="cell-editor"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        /* 焦点离开整个编辑器（不是内部换到 select）才算提交 */
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        finish(true)
      }}
    >
      {def.type === 'select' ? (
        <select
          className="cell-input"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            done.current = true
            onCommit(e.target.value || null)
          }}
        >
          <option value="">—</option>
          {(def.config.options ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="cell-input"
          type={def.type === 'date' ? 'date' : 'text'}
          inputMode={def.type === 'number' ? 'decimal' : undefined}
          value={draft}
          placeholder={def.label}
          onChange={(e) => setDraft(e.target.value)}
        />
      )}
    </div>
  )
}

/* 联系方式在表格里按通道分行显示，不再用「/」一路排到右边 */
function PhoneLines({ person }: { person: Person }) {
  const channels = useStore((s) => normalizeChannels(s.settings.contactChannels))
  const arr = ((person.fields.phones as { label: string; number: string }[]) ?? []).filter((p) => (p.number ?? '').trim())
  if (arr.length === 0) return <span className="muted">—</span>
  const shown = arr.slice(0, 2)
  const rest = arr.length - shown.length
  return (
    <span className="cell-lines">
      {shown.map((p, i) => (
        <span className="cell-line" key={`${p.label}-${i}`}>
          <span className="cell-line-label">{channelLabel(p.label, channels)}</span>
          <span className="cell-line-value">{p.number}</span>
        </span>
      ))}
      {rest > 0 && (
        <span
          className="cell-line-more"
          title={arr.slice(2).map((p) => `${channelLabel(p.label, channels)} ${p.number}`).join('\n')}
        >
          +{rest}
        </span>
      )}
    </span>
  )
}

/* 移动端：智能视图收进一个下拉，放在「筛选」左边，工具栏只用两行 */
function SmartViewMenu({ ctx }: { ctx: ReturnType<typeof buildCtx> }) {
  const views = useStore((s) => s.settings.smartViews)
  const persons = useStore((s) => s.persons)
  const activeId = useUI((s) => s.activeSmartViewId)
  const applySmartView = useUI((s) => s.applySmartView)
  const counts = useMemo(
    () => Object.fromEntries(views.map((v) => [v.id, applyFilter(persons, v.filter, ctx).length])),
    [views, persons, ctx],
  )
  const current = views.find((v) => v.id === activeId)
  return (
    <Menu
      align="left"
      trigger={(open, isOpen) => (
        <button
          className={cn('btn sm pt-view', isOpen && 'on')}
          onClick={open}
          aria-label={`智能视图：${current?.name ?? '全部人脉'}`}
        >
          <span className="vc-dot" style={{ background: current?.color ?? 'var(--text-3)' }} />
          <span className="ellipsis pt-view-name">{current?.name ?? '全部人脉'}</span>
          <ChevronDown size={13} className="pt-view-caret" />
        </button>
      )}
      items={views.map((v) => ({
        label: `${v.name} · ${counts[v.id] ?? 0}`,
        icon: (
          <span
            className="vc-dot"
            style={{ background: v.color ?? '#5B6573', opacity: activeId === v.id ? 1 : 0.55 }}
          />
        ),
        onClick: () => applySmartView(v),
      }))}
    />
  )
}
