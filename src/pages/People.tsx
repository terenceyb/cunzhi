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
import { Avatar, Empty, Menu, MenuSeparator, Segmented, useBreakpoint } from '../components/ui'
import { PersonCard } from '../components/PersonCard'
import { FieldInput } from '../components/FieldInput'
import { WalletStackView } from '../components/WalletCard'
import { PersonDetail } from '../components/PersonDetail'
import { ActiveFilterChips, FilterTrigger } from '../components/FilterPanel'
import { NetworkView } from './Network'
import { buildPersonMeta, buildMetaMap, displayValue, personName } from '../lib/derive'
import { applyFilter } from '../lib/filter'
import { computeReminders } from '../lib/reminders'
import { pinyinOf } from '../lib/search'
import { channelId, channelLabel, normalizeChannels } from '../lib/channels'
import { cn, dayDiff, relativeTime } from '../lib/utils'

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
                <button className="btn icon sm" onClick={open} aria-label="排序">
                  <ArrowDownUp size={15} />
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
                      { value: 'cards' as const, label: '', icon: <Rows3 size={15} /> },
                      { value: 'grid' as const, label: '', icon: <LayoutGrid size={15} /> },
                      { value: 'network' as const, label: '', icon: <Network size={15} /> },
                    ]
                  : [
                      { value: 'cards' as const, label: '', icon: <Rows3 size={15} /> },
                      { value: 'grid' as const, label: '', icon: <LayoutGrid size={15} /> },
                      { value: 'table' as const, label: '', icon: <List size={15} /> },
                      { value: 'network' as const, label: '', icon: <Network size={15} /> },
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
          <ResizeHandle />
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

function ResizeHandle() {
  const setPrefs = useStore((s) => s.setPrefs)
  const width = useStore((s) => s.prefs.detailPanelWidth)
  const dragging = useRef(false)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      /* 右侧最多缩到 400：再窄「记录互动 + 更多」就会换行往下掉 */
      const next = Math.min(640, Math.max(400, window.innerWidth - e.clientX))
      setPrefs({ detailPanelWidth: next })
    }
    const onUp = () => (dragging.current = false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [setPrefs])
  if (window.innerWidth < 1200) return null
  return (
    <div
      className="detail-resizer"
      onMouseDown={() => (dragging.current = true)}
      title={`拖动调整宽度（当前 ${width}px）`}
      role="separator"
      aria-label="调整详情面板宽度"
    />
  )
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
        <span className="field-hint">· 点击表头排序，点击任意单元格即可直接编辑</span>
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
                  <span className={cn('check', on && 'on')}>{on && <Check size={11} strokeWidth={3} />}</span>
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(600)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  // roving tabindex：整个表格只留一个 Tab 落点，行内用 ↑↓ 走
  const [focusIdx, setFocusIdx] = useState(0)
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

  const nameDef = useMemo(() => ctx.fieldDefinitions.find((d) => d.key === 'name'), [ctx.fieldDefinitions])

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
    <div className="table-wrap" ref={scrollRef} onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}>
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 36, paddingLeft: 12 }}>
              <button className={cn('check', allSelected && 'on')} onClick={onToggleAll} aria-label="全选">
                {allSelected && <Check size={14} strokeWidth={3} />}
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
            return (
              <tr
                key={p.id}
                data-idx={idx}
                tabIndex={idx === focusIdx ? 0 : -1}
                className={cn(selected && 'selected', activeId === p.id && 'active')}
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
                    {selected && <Check size={14} strokeWidth={3} />}
                  </button>
                </td>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(c.key === 'name' && 'cell-name', c.def?.type === 'phone' && 'cell-multi')}
                  >
                    {c.key === 'lastInteraction' ? (
                      <span className="muted">{relativeTime(meta.lastInteractionAt)}</span>
                    ) : c.key === 'name' ? (
                      <span className="row cell-name-row" style={{ gap: 7 }}>
                        <Avatar name={meta.name} src={meta.avatar?.thumbnail} size={22} color={meta.groupColor} />
                        {nameDef ? <EditableCell def={nameDef} person={p} ctx={ctx} /> : meta.name}
                      </span>
                    ) : c.def ? (
                      <EditableCell def={c.def} person={p} ctx={ctx} />
                    ) : null}
                  </td>
                ))}
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
    </div>
  )
}

/* 表格单元格：点一下就地编辑，任何字段都能改（姓名与「上次互动」除外） */
function EditableCell({
  def,
  person,
  ctx,
}: {
  def: FieldDefinition
  person: Person
  ctx: ReturnType<typeof buildCtx>
}) {
  const updatePerson = useStore((s) => s.updatePerson)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<unknown>(person.fields[def.key])

  const boxRef = useRef<HTMLDivElement>(null)
  const open = () => {
    setDraft(person.fields[def.key])
    setEditing(true)
  }
  /* 进入编辑就把光标放进输入框，键盘直接能打字；选择型字段不抢焦点（面板自带搜索） */
  useEffect(() => {
    if (!editing) return
    if (def.type === 'select' || def.type === 'multiselect') {
      // 选择型字段：直接展开面板，少一次点击
      const t = window.setTimeout(() => boxRef.current?.querySelector<HTMLElement>('.pk-trigger')?.click(), 30)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => {
      const el = boxRef.current?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea')
      el?.focus()
      if (el instanceof HTMLInputElement) el.select()
    }, 20)
    return () => window.clearTimeout(t)
  }, [editing, def.type])
  const commit = (next?: unknown) => {
    updatePerson(person.id, { [def.key]: next === undefined ? draft : next })
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="cell-view"
        onClick={(e) => {
          e.stopPropagation()
          open()
        }}
        title="点击编辑"
      >
        {def.type === 'phone' ? (
          <PhoneLines person={person} />
        ) : (
          <span className="cell-text">
            {displayValue(def, person.fields[def.key], ctx) || <span className="muted">—</span>}
          </span>
        )}
      </button>
    )
  }

  if (def.type === 'phone') {
    return <PhoneCellEditor person={person} onDone={() => setEditing(false)} />
  }

  const choice = def.type === 'select' || def.type === 'multiselect'
  return (
    <div
      ref={boxRef}
      className={cn('cell-editing', choice && 'is-choice')}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        /* 表格行本身用 Enter 打开详情、↑↓ 换行：编辑期间键盘要留在单元格里 */
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setEditing(false)
        }
      }}
    >
      <FieldInput
        def={def}
        value={draft}
        personId={person.id}
        onChange={(v) => {
          setDraft(v)
          /* 单选一点即生效，和详情页的行为一致 */
          if (def.type === 'select') {
            updatePerson(person.id, { [def.key]: v })
            setEditing(false)
          }
        }}
      />
      {def.type !== 'select' && (
        <span className="cell-ops">
          <button type="button" className="btn icon sm" aria-label="保存" onClick={() => commit()}>
            <Check size={13} />
          </button>
          <button type="button" className="btn icon sm" aria-label="取消" onClick={() => setEditing(false)}>
            <X size={13} />
          </button>
        </span>
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
        <span className="cell-line-more" title={arr.slice(2).map((p) => `${channelLabel(p.label, channels)} ${p.number}`).join('\n')}>
          +{rest}
        </span>
      )}
    </span>
  )
}

/* 表格里的联系方式编辑：一行一个通道，改完点保存，不弹二级面板 */
function PhoneCellEditor({ person, onDone }: { person: Person; onDone: () => void }) {
  const channels = useStore((s) => normalizeChannels(s.settings.contactChannels))
  const updatePerson = useStore((s) => s.updatePerson)
  const [rows, setRows] = useState(() => {
    const arr = (person.fields.phones as { label: string; number: string }[]) ?? []
    return arr.length ? arr.map((p) => ({ label: channelId(p.label, channels), number: p.number })) : [{ label: channels[0]?.id ?? 'mobile', number: '' }]
  })

  const save = () => {
    const order = channels.map((c) => c.id)
    const list = rows
      .filter((r) => (r.number ?? '').trim())
      .map((r) => ({ label: r.label, number: r.number.trim() }))
    list.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
    updatePerson(person.id, { phones: list })
    onDone()
  }

  return (
    <div
      className="cell-editing cell-editing--phone"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          save()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onDone()
        }
      }}
    >
      <div className="cell-phone-rows">
        {rows.map((r, i) => (
          <div className="cell-phone-row" key={`${r.label}-${i}`}>
            <select
              className="cell-phone-ch"
              value={r.label}
              aria-label="联系方式通道"
              onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              className="cell-phone-input"
              autoFocus={i === 0}
              inputMode={channels.find((c) => c.id === r.label)?.kind === 'tel' ? 'tel' : 'text'}
              value={r.number}
              placeholder="填写号码"
              onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))}
            />
            <button
              type="button"
              className="cell-phone-del"
              aria-label="删除这一行"
              onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev.map((x) => ({ ...x, number: '' }))))}
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="cell-phone-add"
          onClick={() => {
            const used = new Set(rows.map((r) => r.label))
            const free = channels.find((c) => !used.has(c.id))
            if (free) setRows((prev) => [...prev, { label: free.id, number: '' }])
          }}
        >
          <Plus size={11} /> 再加一个通道
        </button>
      </div>
      <span className="cell-ops">
        <button type="button" className="btn icon sm" aria-label="保存" onClick={save}>
          <Check size={13} />
        </button>
        <button type="button" className="btn icon sm" aria-label="取消" onClick={onDone}>
          <X size={13} />
        </button>
      </span>
    </div>
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
