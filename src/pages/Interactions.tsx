import React, { useMemo, useState } from 'react'
import {
  Cake,
  CheckCircle2,
  Gift,
  History,
  MessageSquarePlus,
  PenLine,
  Phone,
  Pin,
  Search,
  SquarePen,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import type { TimelineEvent } from '../types'
import { buildCtx, useStore } from '../store'
import { useUI } from '../ui'
import { Avatar, Empty, PageHead, useBreakpoint } from '../components/ui'
import { buildPersonMeta, personName } from '../lib/derive'
import { cn, formatDate, formatDateTime, relativeTime } from '../lib/utils'

/* 互动类别：和详情页时间线同一套语义，这里多配一份图标以便独立成页 */
const KIND: Record<TimelineEvent['type'], { label: string; icon: React.ReactNode }> = {
  note: { label: '备注', icon: <PenLine size={12} /> },
  reach_out: { label: '联系', icon: <Phone size={12} /> },
  gift: { label: '礼物', icon: <Gift size={12} /> },
  todo_completed: { label: '待办', icon: <CheckCircle2 size={12} /> },
  anniversary: { label: '纪念日', icon: <Cake size={12} /> },
  import: { label: '导入', icon: <Upload size={12} /> },
  field_change: { label: '字段变更', icon: <SquarePen size={12} /> },
}

const RANGES = [
  { key: '7', label: '近 7 天', days: 7 },
  { key: '30', label: '近 30 天', days: 30 },
  { key: '90', label: '近 90 天', days: 90 },
  { key: 'all', label: '全部', days: 0 },
] as const

const FILTERS = ['all', 'reach_out', 'note', 'gift', 'todo_completed', 'anniversary'] as const

const DAY = 86400000

/** 同一自然日的记录归到一组，标题用「今天 / 昨天 / 具体日期」 */
function dayKey(iso: string): number {
  const d = new Date(iso)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** 日期拆成主副两段：主段给「今天 / 11月7日」，副段给星期，两段各自对齐才好排 */
function dayLabel(ts: number): { main: string; sub: string } {
  const today = dayKey(new Date().toISOString())
  const d = new Date(ts)
  const week = `周${'日一二三四五六'[d.getDay()]}`
  if (ts === today) return { main: '今天', sub: week }
  if (ts === today - DAY) return { main: '昨天', sub: week }
  if (ts === today - DAY * 2) return { main: '前天', sub: week }
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return {
    main: `${sameYear ? '' : `${d.getFullYear()}年`}${d.getMonth() + 1}月${d.getDate()}日`,
    sub: week,
  }
}

export function Interactions() {
  const store = useStore()
  const ctx = useMemo(
    () => buildCtx(store),
    [store.persons, store.fieldDefinitions, store.groups, store.tags, store.timelineEvents, store.attachments],
  )
  const isMobile = useBreakpoint() === 'mobile'
  const [q, setQ] = useState('')
  const [type, setType] = useState<(typeof FILTERS)[number]>('all')
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('30')
  const openPerson = useUI((s) => s.openPerson)
  const toast = useUI((s) => s.toast)
  const askConfirm = useUI((s) => s.askConfirm)
  const deleteTimeline = useStore((s) => s.deleteTimeline)
  const pinTimeline = useStore((s) => s.pinTimeline)

  const personById = useMemo(() => new Map(store.persons.map((p) => [p.id, p])), [store.persons])

  const all = useMemo(
    () => [...store.timelineEvents].sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt)),
    [store.timelineEvents],
  )

  const rows = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? 0
    const since = days ? Date.now() - days * DAY : 0
    const keyword = q.trim().toLowerCase()
    return all.filter((e) => {
      if (type !== 'all' && e.type !== type) return false
      if (since && +new Date(e.occurredAt) < since) return false
      if (!keyword) return true
      const name = personById.get(e.personId)
      return (
        e.content.toLowerCase().includes(keyword) ||
        (name ? personName(name).toLowerCase().includes(keyword) : false) ||
        (e.channel ?? '').toLowerCase().includes(keyword)
      )
    })
  }, [all, type, range, q, personById])

  const groups = useMemo(() => {
    const map = new Map<number, TimelineEvent[]>()
    for (const e of rows) {
      const k = dayKey(e.occurredAt)
      const list = map.get(k)
      if (list) list.push(e)
      else map.set(k, [e])
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0])
  }, [rows])

  const stats = useMemo(() => {
    const week = all.filter((e) => +new Date(e.occurredAt) >= Date.now() - 7 * DAY)
    const people = new Set(week.map((e) => e.personId))
    const month = all.filter((e) => +new Date(e.occurredAt) >= Date.now() - 30 * DAY)
    return { week: week.length, people: people.size, month: month.length }
  }, [all])

  const remove = (e: TimelineEvent) => {
    const p = personById.get(e.personId)
    askConfirm({
      title: '删除这条互动记录？',
      message: `${p ? personName(p) : '该联系人'} · ${formatDate(e.occurredAt, 'YYYY年M月D日')}｜${e.content.slice(0, 40)}${
        e.content.length > 40 ? '…' : ''
      }`,
      confirmText: '删除',
      danger: true,
      onConfirm: () => {
        deleteTimeline([e.id])
        toast('已删除这条互动记录', 'success')
      },
    })
  }

  return (
    <div className="page wide ix-page">
      {/* 桌面端：内容区大标题是唯一的页面标题（顶栏不再重复写一遍） */}
      {!isMobile && (
        <PageHead
          title="互动记录"
          desc={
            all.length
              ? `近 7 天 ${stats.week} 次互动，覆盖 ${stats.people} 位人脉 · 近 30 天 ${stats.month} 次`
              : '还没有互动记录。记录一次见面、一通电话，关系就有了时间轴。'
          }
        />
      )}

      <div className="ix-toolbar">
        <div className="search-box ix-search">
          <Search size={15} />
          <input
            className="input sm"
            placeholder="搜索内容、联系人或渠道…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="ix-tool-group">
          <div className="ix-filters" role="tablist" aria-label="互动类别">
            {FILTERS.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={type === t}
                className={cn('chip tl-filter-chip', type === t && 'accent')}
                onClick={() => setType(t)}
              >
                {t === 'all' ? '全部' : KIND[t].label}
              </button>
            ))}
          </div>
        </div>
        <div className="ix-tool-group ix-tool-group-end">
          {/* 手机上顶栏已经写着「互动记录」，页内不再叠一个大标题：
              统计压成一行小字，和时间范围并排放，工具栏只占两行 */}
          {isMobile && (
            <p className="ix-summary">
              {all.length ? `7 天 ${stats.week} 次 · 30 天 ${stats.month} 次` : '还没有记录'}
            </p>
          )}
          <div className="ix-ranges">
            {RANGES.map((r) => (
              <button
                key={r.key}
                className={cn('ix-range', range === r.key && 'on')}
                aria-pressed={range === r.key}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card pad">
          <Empty
            icon={<History size={20} />}
            title={all.length ? '这段时间没有符合条件的互动' : '还没有互动记录'}
            desc={
              all.length
                ? '换个时间范围或类别再看看，也可以清空搜索词。'
                : '在人脉详情页点「记录互动」，或在走动提醒里点「已联系」，都会写进这里。'
            }
            action={
              all.length ? (
                <button
                  className="btn sm"
                  onClick={() => {
                    setQ('')
                    setType('all')
                    setRange('all')
                  }}
                >
                  查看全部互动
                </button>
              ) : (
                <button className="btn sm" onClick={() => useUI.getState().navigate('people')}>
                  <Users size={14} /> 去人脉页
                </button>
              )
            }
          />
        </div>
      ) : (
        <div className="ix-stream">
          {groups.map(([ts, list]) => (
            <section key={ts} className="ix-group" style={{ ['--ix-rows' as string]: list.length }}>
              <header className="ix-day">
                <span className="ix-day-main">{dayLabel(ts).main}</span>
                <span className="ix-day-sub">
                  {dayLabel(ts).sub}
                  <span className="ix-day-dot">·</span>
                  {list.length} 条
                </span>
              </header>
              {list.map((e) => {
                const person = personById.get(e.personId)
                const meta = person ? buildPersonMeta(person, ctx) : null
                const name = person ? personName(person) : '已删除联系人'
                const pinned = person?.pinnedTimelineId === e.id
                return (
                  <article className={cn('ix-row', !person && 'is-orphan')} key={e.id}>
                    <button
                      className="ix-avatar"
                      onClick={() => person && openPerson(person.id)}
                      aria-label={`打开 ${name}`}
                      disabled={!person}
                    >
                      <Avatar name={name} src={meta?.avatar?.thumbnail} size={isMobile ? 38 : 42} color={meta?.groupColor} />
                    </button>
                    <div className="ix-body">
                      <div className="ix-top">
                        <button className="ix-name" onClick={() => person && openPerson(person.id)} disabled={!person}>
                          {name}
                        </button>
                        {meta?.group && (
                          <span
                            className="chip sm ix-group-chip"
                            style={{ background: `${meta.groupColor}18`, color: meta.groupColor }}
                          >
                            {meta.group.name}
                          </span>
                        )}
                        {pinned && (
                          <span className="ix-pin-flag">
                            <Pin size={10} /> 置顶
                          </span>
                        )}
                        {/* 时间移到姓名行右端：正文与标签独占下方的整行宽度，
                            卡片里的信息因此变成「谁 / 多久前 → 说了什么 → 什么类型」三层 */}
                        <span className="ix-time" title={formatDateTime(e.occurredAt)}>
                          {relativeTime(e.occurredAt)}
                        </span>
                      </div>
                      <p className="ix-content">{e.content}</p>
                      <div className="ix-foot">
                        <div className="ix-meta">
                          <span className={cn('chip tl-type')}>
                            {KIND[e.type]?.icon}
                            {KIND[e.type]?.label}
                          </span>
                          {e.channel && e.channel !== '普通备注' && <span className="ix-channel">{e.channel}</span>}
                        </div>
                        <div className="ix-ops">
                          <button
                            className={cn('btn icon sm', pinned && 'accent')}
                            title={pinned ? '取消置顶' : '置顶到该联系人详情页'}
                            aria-label={pinned ? '取消置顶' : '置顶'}
                            onClick={() => {
                              if (!person) return
                              pinTimeline(person.id, pinned ? null : e.id)
                              toast(pinned ? '已取消置顶' : '已置顶到该联系人详情', 'success')
                            }}
                          >
                            <Pin size={13} />
                          </button>
                          <button
                            className="btn icon sm ix-del"
                            title="删除这条记录"
                            aria-label="删除这条记录"
                            onClick={() => remove(e)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </section>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <p className="ix-foot">
          <MessageSquarePlus size={12} /> 共 {rows.length} 条记录 · 记录入口在每个人脉详情页的右上角
        </p>
      )}
    </div>
  )
}
