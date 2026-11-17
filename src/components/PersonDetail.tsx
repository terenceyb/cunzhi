import React, { useMemo, useState } from 'react'
import {
  BellRing,
  Cake,
  CalendarPlus,
  Gift,
  Check,
  CheckCircle2,
  ChevronLeft,
  History,
  LayoutList,
  ListChecks,
  MessageSquarePlus,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  PenLine,
  Phone,
  Pin,
  Plus,
  SquarePen,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import type { Anniversary, FieldDefinition, Person, TimelineEvent, Todo } from '../types'
import { useStore } from '../store'
import { useUI } from '../ui'
import { Avatar, CopyButton, Menu, MenuSeparator, Modal } from './ui'
import { FieldBlock } from './PersonForm'
import { InteractionDialog } from './InteractionDialog'
import { FieldValue } from './FieldValue'
import { channelId, normalizeChannels } from '../lib/channels'
import { FieldIcon, iconNameForField } from './FieldIcon'
import { DateField, PersonSelect } from './inputs'
import { defByKey, isEmptyValue, personEvents, personName, buildPersonMeta } from '../lib/derive'
import type { DeriveCtx } from '../lib/derive'
import { cn, formatAnniversary, formatDate, formatDateTime, relativeTime, dayDiff } from '../lib/utils'
import { FREQUENCY_OPTIONS } from '../defaults'
import { ANNIVERSARY_TYPES } from '../defaults'


const TL_META: Record<TimelineEvent['type'], { label: string; icon: React.ReactNode }> = {
  note: { label: '备注', icon: <PenLine size={11} /> },
  reach_out: { label: '联系', icon: <Phone size={11} /> },
  gift: { label: '礼物', icon: <Gift size={11} /> },
  todo_completed: { label: '待办', icon: <CheckCircle2 size={11} /> },
  anniversary: { label: '纪念日', icon: <Cake size={11} /> },
  import: { label: '导入', icon: <Upload size={11} /> },
  field_change: { label: '字段变更', icon: <SquarePen size={11} /> },
}

export function PersonDetail({
  personId,
  ctx,
  onClose,
  embedded,
}: {
  personId: string
  ctx: DeriveCtx
  onClose: () => void
  embedded?: boolean
}) {
  const person = useStore((s) => s.persons.find((p) => p.id === personId))
  const todos = useStore((s) => s.todos)
  const anniversaries = useStore((s) => s.anniversaries)
  const policy = useStore((s) => s.settings.reminderPolicy)
  const showEmptyFields = useStore((s) => s.prefs.showEmptyFields)
  const setPrefs = useStore((s) => s.setPrefs)
  const deleteTimeline = useStore((s) => s.deleteTimeline)
  const pinTimeline = useStore((s) => s.pinTimeline)
  const setFrequency = useStore((s) => s.setFrequency)
  const deletePerson = useStore((s) => s.deletePerson)
  const addAnniversary = useStore((s) => s.addAnniversary)
  const deleteTodo = useStore((s) => s.deleteTodo)
  const toggleTodo = useStore((s) => s.toggleTodo)
  const [timelineFilter, setTimelineFilter] = useState<'all' | TimelineEvent['type']>('all')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const addField = useStore((s) => s.addField)
  const [ixOpen, setIxOpen] = useState(false)
  const [memoEditing, setMemoEditing] = useState(false)
  const [autoEditKey, setAutoEditKey] = useState<string | null>(null)
  const [pinnedKeys, setPinnedKeys] = useState<string[]>([])
  const [annOpen, setAnnOpen] = useState(false)
  const [todoOpen, setTodoOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const toast = useUI((s) => s.toast)
  const askConfirm = useUI((s) => s.askConfirm)
  const openPerson = useUI((s) => s.openPerson)
  const askPrompt = useUI((s) => s.askPrompt)
  const navigate = useUI((s) => s.navigate)

  if (!person) {
    return (
      <div className="empty" style={{ height: '100%' }}>
        <p>联系人不存在或已删除</p>
      </div>
    )
  }

  const meta = buildPersonMeta(person, ctx)
  const events = personEvents(person.id, ctx.timelineEvents)
  const filteredEvents = timelineFilter === 'all' ? events : events.filter((e) => e.type === timelineFilter)
  const personTodos = todos.filter((t) => t.personId === person.id && !t.deletedAt)
  const personAnns = anniversaries.filter((a) => a.personId === person.id)
  const freq = person.reminderFrequencyDays
  const pinned = person.pinnedTimelineId ? events.find((e) => e.id === person.pinnedTimelineId) : null

  /* 顺序完全跟随「设置 → 字段管理」里的排序，不再按分组二次切分 */
  const orderedFields = ctx.fieldDefinitions
    .filter((d) => d.visible && !d.disabled && d.type !== 'timeline' && d.key !== 'avatar' && d.key !== 'name')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    // 联系方式总是显示：它是空的时候也要能点进去填
    .filter(
      (d) =>
        showEmptyFields ||
        d.key === 'phones' ||
        /* 名片码由本人资料生成，永远有内容 */
        (d.type === 'barcode' && d.config?.source === 'personCard') ||
        pinnedKeys.includes(d.key) ||
        !isEmptyValue(person.fields[d.key], d),
    )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="detail-head dhead">
        {!embedded && (
          <button className="btn icon sm dhead-back" onClick={onClose} aria-label="返回">
            <ChevronLeft size={18} />
          </button>
        )}
        <Avatar
          name={meta.name}
          src={meta.avatar?.thumbnail || meta.avatar?.data}
          size={48}
          color={meta.groupColor}
          className="dhead-avatar"
        />
        {/* 头像右侧三行：姓名 / 单位·职务·城市 / 上次互动·记录数 */}
        <div className="dhead-main">
          <div className="dhead-r1">
            <span className="detail-name ellipsis">{meta.name}</span>
            {meta.group && (
              <span
                className="chip sm dhead-group"
                style={{ background: `${meta.groupColor}18`, color: meta.groupColor }}
              >
                {meta.group.name}
              </span>
            )}
          </div>
          <div className="dhead-r2">
            <span className="ellipsis">
              {[person.fields.company, person.fields.custom_role, person.fields.city]
                .map((x) => String(x ?? '').trim())
                .filter(Boolean)
                .join(' · ') || '未填写单位'}
            </span>
          </div>
          <div className="dhead-r3">
            <span>上次互动 {relativeTime(meta.lastInteractionAt)}</span>
            <span className="dhead-vdot" aria-hidden />
            <span>{events.length} 条记录</span>
          </div>
        </div>
        <div className="dhead-ops">
          <button className="btn sm dhead-ix" onClick={() => setIxOpen(true)} title="记录一次互动">
            <MessageSquarePlus size={15} />
            <span className="hide-mobile">记录互动</span>
          </button>
          <Menu
            trigger={(open) => (
              <button className="btn sm dhead-more" onClick={open} aria-label="更多操作">
                <MoreHorizontal size={16} />
              </button>
            )}
            items={[
              {
                label: '编辑全部字段',
                icon: <Pencil size={14} />,
                onClick: () => useUI.getState().openPersonForm(person.id),
              },
              {
                label: '与其他人脉合并',
                icon: <Users size={14} />,
                onClick: () => setMergeOpen(true),
              },
              {
                label: '导出 vCard',
                icon: <Upload size={14} />,
                onClick: () => useStore.getState().exportVCardFile([person.id]),
              },
              { label: '显示空字段', icon: <Plus size={14} />, onClick: () => setPrefs({ showEmptyFields: !showEmptyFields }) },
              <MenuSeparator key="sep" />,
              {
                label: '删除联系人',
                icon: <Trash2 size={14} />,
                danger: true,
                onClick: () =>
                  askConfirm({
                    title: `删除「${meta.name}」？`,
                    message: '其互动记录、待办与纪念日将一并删除。被引用处默认保留姓名快照。',
                    confirmText: '删除',
                    danger: true,
                    onConfirm: () => {
                      deletePerson(person.id, 'snapshot')
                      onClose()
                      toast('已删除联系人', 'success')
                    },
                  }),
              },
            ]}
          />
        </div>
      </div>

      <div className="detail-body">
        {pinned && (
          <div className="pinned-note">
            <span className="pin-label">置顶备注 · {formatDate(pinned.occurredAt, 'YYYY年M月D日')}</span>
            {pinned.content}
          </div>
        )}

        <div className="detail-section">
          <div className="detail-section-head">
            <h4>
              <span className="ds-ico">
                <LayoutList size={13} />
              </span>
              字段信息
            </h4>
            <div className="ds-head-right">
              <span className="ds-meter" title={`资料完整度 ${meta.completeness}%`}>
                <span className="ds-meter-label">完整度 {meta.completeness}%</span>
                <span className="ds-meter-bar" role="progressbar" aria-valuenow={meta.completeness} aria-valuemin={0} aria-valuemax={100}>
                  <i style={{ width: `${meta.completeness}%` }} />
                </span>
              </span>
              <button className="link-btn" onClick={() => navigate('settings', { tab: 'fields' })}>
                管理字段
              </button>
            </div>
          </div>
          {orderedFields.length ? (
            <div className="stack" style={{ gap: 2 }}>
              <EditableRow def={ctx.fieldDefinitions.find((d) => d.key === 'name')!} person={person} ctx={ctx} />
              {orderedFields.map((def) =>
                def.key === 'phones' ? (
                  <ContactBlock key={def.key} def={def} person={person} />
                ) : (
                  <EditableRow
                    key={def.key}
                    def={def}
                    person={person}
                    ctx={ctx}
                    autoEdit={autoEditKey === def.key}
                    onAutoEditDone={() => setAutoEditKey(null)}
                    onKeepVisible={() =>
                      setPinnedKeys((prev) => (prev.includes(def.key) ? prev : [...prev, def.key]))
                    }
                  />
                ),
              )}
            </div>
          ) : (
            <div className="fields-empty">
              <p>还没有可显示的字段</p>
              <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
                <button className="btn sm" onClick={() => setPrefs({ showEmptyFields: true })}>
                  显示空字段
                </button>
                <button className="btn sm ghost" onClick={() => navigate('settings', { tab: 'fields' })}>
                  去字段管理
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="detail-section">
          <div className="detail-section-head">
            <h4>
              <span className="ds-ico">
                <NotebookPen size={13} />
              </span>
              关系备忘
            </h4>
            <button className="link-btn" onClick={() => setMemoEditing(true)}>
              {person.memo ? '编辑' : '添加'}
            </button>
          </div>
          <MemoEditor person={person} editing={memoEditing} onEditingChange={setMemoEditing} />
        </div>

        <div className="detail-section">
          <div className="detail-section-head">
            <h4>
              <span className="ds-ico">
                <History size={13} />
              </span>
              互动时间线
            </h4>
            <div className="row" style={{ gap: 6 }}>
              {selectMode ? (
                <>
                  <button
                    className="link-btn danger"
                    onClick={() => {
                      if (!selected.length) return
                      deleteTimeline(selected)
                      setSelected([])
                      setSelectMode(false)
                      toast('已删除所选记录', 'success')
                    }}
                  >
                    删除 {selected.length}
                  </button>
                  <button
                    className="link-btn"
                    onClick={() => {
                      setSelectMode(false)
                      setSelected([])
                    }}
                  >
                    取消
                  </button>
                </>
              ) : (
                <>
                  <button className="link-btn" onClick={() => setSelectMode(true)}>
                    选择
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="chip-row tl-filter" style={{ marginBottom: 10 }}>
            {(['all', 'note', 'reach_out', 'gift', 'todo_completed', 'anniversary'] as const).map((t) => (
              <button
                key={t}
                className={cn('chip tl-filter-chip', timelineFilter === t && 'accent')}
                onClick={() => setTimelineFilter(t)}
              >
                {t === 'all' ? '全部' : TL_META[t].label}
              </button>
            ))}
          </div>

          {filteredEvents.length === 0 ? (
            <p className="field-hint">
              还没有互动记录。点上方「记录互动」或在走动提醒里点「已联系」，都会写进这里。
            </p>
          ) : (
            <div className="timeline">
              {filteredEvents.map((e) => {
                const on = selected.includes(e.id)
                return (
                  <div
                    key={e.id}
                    className={cn('tl-item', on && 'selected')}
                    data-type={e.type}
                    onClick={() => {
                      if (!selectMode) return
                      setSelected((prev) => (on ? prev.filter((x) => x !== e.id) : [...prev, e.id]))
                    }}
                  >
                    <div className="tl-meta">
                      {selectMode && <span className={cn('check', on && 'on')} style={{ width: 14, height: 14 }}>{on && <Check size={10} />}</span>}
                      <span className="chip tl-type">
                        {TL_META[e.type]?.icon}
                        {TL_META[e.type]?.label}
                      </span>
                      <span title={formatDateTime(e.occurredAt)}>{relativeTime(e.occurredAt)}</span>
                      {e.channel && e.channel !== '普通备注' && <span>· {e.channel}</span>}
                    </div>
                    <div className="tl-content">{e.content}</div>
                    {!selectMode && (
                      <div className="tl-actions">
                        <button
                          className="btn icon sm"
                          title="置顶到详情顶部"
                          onClick={() =>
                            pinTimeline(person.id, person.pinnedTimelineId === e.id ? null : e.id)
                          }
                        >
                          <Pin size={12} />
                        </button>
                        <button
                          className="btn icon sm"
                          title="删除该条记录"
                          onClick={() => {
                            deleteTimeline([e.id])
                            toast('已删除记录', 'success')
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="detail-section">
          <div className="detail-section-head">
            <h4>
              <span className="ds-ico">
                <BellRing size={13} />
              </span>
              联系频率
            </h4>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <select
              className="input sm"
              style={{ width: 'auto' }}
              value={freq === null || freq === undefined ? '__unset' : String(freq)}
              onChange={(e) => {
                const v = e.target.value
                setFrequency(person.id, v === '__unset' ? null : Number(v))
              }}
            >
              <option value="__unset">跟随视图/全局（{policy.defaultFrequencyDays} 天）</option>
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o.label} value={o.days === null ? '__unset' : String(o.days)}>
                  {o.label}
                  {o.days && o.days > 0 ? `（${o.days} 天）` : ''}
                </option>
              ))}
            </select>
            <span className="field-hint">个人设置优先于智能视图与全局默认</span>
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-head">
            <h4>
              <span className="ds-ico">
                <ListChecks size={13} />
              </span>
              关联待办
            </h4>
            <button className="link-btn" onClick={() => setTodoOpen(true)}>
              + 新建待办
            </button>
          </div>
          {personTodos.length === 0 ? (
            <p className="field-hint">暂无待办</p>
          ) : (
            <div className="stack" style={{ gap: 2 }}>
              {personTodos.map((t) => (
                <div key={t.id} className={cn('todo-item', t.done && 'done')} style={{ padding: '6px 4px' }}>
                  <button
                    className={cn('check', t.done && 'on')}
                    onClick={() => toggleTodo(t.id, false)}
                    aria-label={t.done ? '标记未完成' : '标记完成'}
                  >
                    {t.done && <Check size={12} strokeWidth={3} />}
                  </button>
                  <div className="grow">
                    <div className="title">{t.title}</div>
                    <div className="sub">
                      截止 {formatDate(t.dueDate)}
                      {dayDiff(new Date(t.dueDate)) > 0 && !t.done && (
                        <span style={{ color: 'var(--danger)' }}>逾期 {dayDiff(new Date(t.dueDate))} 天</span>
                      )}
                    </div>
                  </div>
                  <button className="btn icon sm" onClick={() => deleteTodo(t.id)} aria-label="删除待办">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="detail-section">
          <div className="detail-section-head">
            <h4>
              <span className="ds-ico">
                <Cake size={13} />
              </span>
              纪念日
            </h4>
            <button className="link-btn" onClick={() => setAnnOpen(true)}>
              + 添加
            </button>
          </div>
          {personAnns.length === 0 ? (
            <p className="field-hint">暂无纪念日</p>
          ) : (
            <div className="stack" style={{ gap: 4 }}>
              {personAnns.map((a) => (
                <div key={a.id} className="row between" style={{ fontSize: 12.5 }}>
                  <span className="row" style={{ gap: 6 }}>
                    <Cake size={13} className="muted" />
                    {a.label} · {formatAnniversary(a.date)}
                  </span>
                  <button className="btn icon sm" onClick={() => useStore.getState().deleteAnniversary(a.id)} aria-label="删除纪念日">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <InteractionDialog open={ixOpen} onClose={() => setIxOpen(false)} person={person} />
      <AnniversaryDialog open={annOpen} onClose={() => setAnnOpen(false)} personId={person.id} />
      <TodoDialog open={todoOpen} onClose={() => setTodoOpen(false)} personId={person.id} />
      <MergeDialog open={mergeOpen} onClose={() => setMergeOpen(false)} personId={person.id} onMerged={onClose} />
    </div>
  )
}

/* 联系方式：一个父字段 + 若干下级通道（手机 / 固定电话 / 微信 / QQ / 钉钉…）
   通道定义在「设置 → 字段管理」里维护，这里只负责逐行填写，本级顺序即通道顺序 */
function ContactBlock({ def, person }: { def: FieldDefinition; person: Person }) {
  const channels = useStore((s) => normalizeChannels(s.settings.contactChannels))
  const updatePerson = useStore((s) => s.updatePerson)
  const toast = useUI((s) => s.toast)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  /* 本次会话里被主动删掉的空通道：删了就先别自动铺回来，需要时从「添加联系方式」里取 */
  const [dismissed, setDismissed] = useState<string[]>([])
  const arr = (person.fields.phones as { label: string; number: string }[]) ?? []
  const valueOf = (cid: string) => arr.find((p) => channelId(p.label, channels) === cid)?.number ?? ''

  const save = (cid: string, next: string) => {
    const order = channels.map((c) => c.id)
    const list = arr
      .map((p) => ({ label: channelId(p.label, channels), number: p.number }))
      .filter((p) => p.label !== cid)
    if (next.trim()) list.push({ label: cid, number: next.trim() })
    list.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
    updatePerson(person.id, { phones: list })
    setEditing(null)
  }

  /* 删除一条下级通道：清掉值，并把这一行收起来（空行也一样能删，不再一直占位） */
  const removeChannel = (cid: string) => {
    const ch = channels.find((c) => c.id === cid)
    save(cid, '')
    setDismissed((d) => (d.includes(cid) ? d : [...d, cid]))
    toast(`已删除「${ch?.label ?? '联系方式'}」`, 'success')
  }

  const used = new Set(arr.map((p) => channelId(p.label, channels)))
  /* 所有启用的通道都列出来：空值也能点开就填，不再需要「+ 更多方式」 */
  /* 默认只铺手机与微信这两行：其余通道填过才出现，新增走「添加联系方式」 */
  const DEFAULT_ROWS = ['mobile', 'wechat']
  const shown = channels.filter((c) => {
    if (editing === c.id) return true
    if (used.has(c.id)) return true
    if (dismissed.includes(c.id)) return false
    return c.visible && DEFAULT_ROWS.includes(c.id)
  })
  const spare = channels.filter((c) => !used.has(c.id) && !shown.some((x) => x.id === c.id))

  return (
    <div className="field-row field-row--contact">
      <span className="fk" title={def.label}>
        <FieldIcon name={iconNameForField(def)} size={13} className="fk-icon" />
        <span className="ellipsis">{def.label}</span>
      </span>
      <div className="fv">
        <div className="contact-list">
          {shown.map((c) => {
            const v = valueOf(c.id)
            const on = editing === c.id
            return (
              <div className={cn('contact-line', !v && 'is-empty', on && 'is-editing')} key={c.id}>
                <span className="cl-label">{c.label}</span>
                {on ? (
                  <input
                    className="input sm cl-input"
                    autoFocus
                    value={draft}
                    inputMode={c.kind === 'tel' ? 'tel' : 'text'}
                    placeholder={c.hint ?? '填写内容'}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') save(c.id, draft)
                      if (e.key === 'Escape') setEditing(null)
                    }}
                    onBlur={() => save(c.id, draft)}
                  />
                ) : (
                  <button
                    type="button"
                    className="cl-value"
                    onClick={() => {
                      setDraft(v)
                      setEditing(c.id)
                    }}
                  >
                    <span className={cn('ellipsis')}>{v || '未填写'}</span>
                  </button>
                )}
                <span className="cl-ops" data-no-edit>
                  {!on && v && c.kind === 'tel' && (
                    <a className="btn icon sm" href={`tel:${v.replace(/[\s-]/g, '')}`} aria-label={`拨打${c.label}`}>
                      <Phone size={12} />
                    </a>
                  )}
                  {!on && v && c.kind !== 'tel' && <CopyButton text={v} label={`复制${c.label}`} />}
                  <button
                    type="button"
                    className="cl-del"
                    title={v ? `删除${c.label}` : `移除${c.label}这一行`}
                    aria-label={v ? `删除${c.label}` : `移除${c.label}这一行`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => removeChannel(c.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              </div>
            )
          })}
        </div>
        <Menu
          trigger={(open) => (
            <button type="button" className="contact-add" onClick={open}>
              <Plus size={12} /> 添加联系方式
            </button>
          )}
          items={[
            ...spare.map((c) => ({
              label: c.label,
              icon: <Plus size={13} />,
              onClick: () => {
                setDraft('')
                setDismissed((d) => d.filter((x) => x !== c.id))
                setEditing(c.id)
              },
            })),
            ...(spare.length === 0
              ? [
                  {
                    label: '通道都已启用 · 去字段管理新增',
                    onClick: () => useUI.getState().navigate('settings', { tab: 'fields' }),
                  },
                ]
              : []),
          ]}
        />
      </div>
    </div>
  )
}

/* 单字段点击即编辑：字段名只在左侧出现一次，编辑态直接展开输入区 */
function EditableRow({
  def,
  person,
  ctx,
  autoEdit,
  onAutoEditDone,
  onKeepVisible,
}: {
  def: FieldDefinition
  person: Person
  ctx: DeriveCtx
  autoEdit?: boolean
  onAutoEditDone?: () => void
  /** 清空后这一行先留着（否则会被「隐藏空字段」的偏好直接收走，看着像凭空消失） */
  onKeepVisible?: () => void
}) {
  const updatePerson = useStore((s) => s.updatePerson)
  const [editing, setEditing] = useState(!!autoEdit)
  const [draft, setDraft] = useState<unknown>(person.fields[def.key])
  const [saved, setSaved] = useState(false)
  const empty = isEmptyValue(person.fields[def.key], def)
  React.useEffect(() => {
    if (autoEdit) onAutoEditDone?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  const commit = (next?: unknown) => {
    const v = next === undefined ? draft : next
    updatePerson(person.id, { [def.key]: v })
    setDraft(v)
    if (isEmptyValue(v, def)) onKeepVisible?.()
    setEditing(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1200)
  }

  return (
    <div className={cn('field-row', empty && !editing && 'is-empty', editing && 'is-editing')}>
      <span className="fk" title={def.label}>
        <FieldIcon name={iconNameForField(def)} size={13} className="fk-icon" />
        <span className="ellipsis">{def.label}</span>
      </span>
      <div className="fv">
        {editing ? (
          <div className="fv-editor">
            <FieldBlock
              def={def}
              value={draft}
              onChange={(v) => {
                setDraft(v)
                /* 单选是一次到位的动作：选完即生效并收起，不需要再点一次「完成」 */
                if (def.type === 'select') commit(v)
              }}
              personId={person.id}
              hideLabel
            />
            {/* 单选选完就生效，只留一个「取消」当退路；其余类型仍需显式确认 */}
            <div className="row" style={{ gap: 6 }}>
              {def.type !== 'select' && (
                <button className="btn sm primary" onClick={() => commit()}>
                  完成
                </button>
              )}
              <button className="btn sm ghost" onClick={() => setEditing(false)}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <div
            className="fv-view"
            onClick={(e) => {
              // 行内已有「电话 / 短信 / 复制」等操作按钮时，点按钮不进入编辑
              if ((e.target as HTMLElement).closest('a, button, [data-no-edit]')) return
              setDraft(person.fields[def.key])
              setEditing(true)
            }}
            title="点击编辑"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setDraft(person.fields[def.key])
                setEditing(true)
              }
            }}
          >
            <span className="grow">
              <FieldValue def={def} value={person.fields[def.key]} personId={person.id} onOpenPerson={useUI.getState().openPerson} />
            </span>
            {saved ? (
              <span className="field-hint" style={{ color: 'var(--ok)' }}>已保存</span>
            ) : (
              <Pencil size={12} className="edit-hint" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MemoEditor({
  person,
  editing,
  onEditingChange,
}: {
  person: Person
  editing: boolean
  onEditingChange: (v: boolean) => void
}) {
  const patchPerson = useStore((s) => s.patchPerson)
  const [text, setText] = useState(person.memo ?? '')
  const toast = useUI((s) => s.toast)
  const open = () => {
    setText(person.memo ?? '')
    onEditingChange(true)
  }
  if (!editing) {
    return person.memo ? (
      <p className="memo-box memo-box--filled" onClick={open} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open()}>
        {person.memo}
      </p>
    ) : (
      <button type="button" className="memo-box memo-box--empty" onClick={open}>
        <PenLine size={13} />
        怎么写、在哪认识、聊过什么、下次可以聊什么 —— 点这里写下来
      </button>
    )
  }
  return (
    <div className="memo-edit">
      <textarea
        className="textarea memo-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        autoFocus
      />
      <div className="row" style={{ gap: 6 }}>
        <button
          className="btn sm primary"
          onClick={() => {
            patchPerson(person.id, { memo: text })
            onEditingChange(false)
            toast('备忘已保存', 'success')
          }}
        >
          保存
        </button>
        <button className="btn sm ghost" onClick={() => onEditingChange(false)}>
          取消
        </button>
      </div>
    </div>
  )
}

export function AnniversaryDialog({ open, onClose, personId }: { open: boolean; onClose: () => void; personId: string }) {
  const addAnniversary = useStore((s) => s.addAnniversary)
  const policy = useStore((s) => s.settings.reminderPolicy)
  const [type, setType] = useState<Anniversary['type']>('birthday')
  const [label, setLabel] = useState('生日')
  const [date, setDate] = useState('')
  const toast = useUI((s) => s.toast)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="添加纪念日"
      narrow
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button
            className="btn primary"
            onClick={() => {
              if (!date) {
                toast('请选择日期', 'error')
                return
              }
              addAnniversary({
                personId,
                type,
                label: label || '纪念日',
                date: date.length > 5 ? date.slice(5) : date,
                advanceDays: policy.anniversaryAdvanceDays,
              })
              toast('已添加纪念日', 'success')
              onClose()
            }}
          >
            保存
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="field">
          <span className="field-label">类型</span>
          <select
            className="input"
            value={type}
            onChange={(e) => {
              const v = e.target.value as Anniversary['type']
              setType(v)
              setLabel(ANNIVERSARY_TYPES.find((x) => x.value === v)?.label ?? '纪念日')
            }}
          >
            {ANNIVERSARY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="field-label">名称</span>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="field">
          <span className="field-label">日期</span>
          <DateField value={date} onChange={setDate} width={160} />
          <span className="field-hint">纪念日按每年循环提醒</span>
        </div>
      </div>
    </Modal>
  )
}

export function TodoDialog({ open, onClose, personId }: { open: boolean; onClose: () => void; personId?: string }) {
  const addTodo = useStore((s) => s.addTodo)
  const persons = useStore((s) => s.persons)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(new Date().toISOString().slice(0, 10))
  const [priority, setPriority] = useState<Todo['priority']>('normal')
  const [pid, setPid] = useState(personId ?? '')
  const toast = useUI((s) => s.toast)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建待办"
      narrow
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button
            className="btn primary"
            onClick={() => {
              if (!title.trim()) {
                toast('请填写待办标题', 'error')
                return
              }
              addTodo({ title: title.trim(), personId: pid || null, dueDate: due, priority })
              setTitle('')
              toast('待办已创建', 'success')
              onClose()
            }}
          >
            保存
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="field">
          <span className="field-label">标题</span>
          <input
            className="input"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：把方案发给李静"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && title.trim()) {
                addTodo({ title: title.trim(), personId: pid || null, dueDate: due, priority })
                toast('待办已创建', 'success')
                onClose()
              }
            }}
          />
        </div>
        <div className="field">
          <span className="field-label">关联人脉</span>
          <PersonSelect value={pid} onChange={setPid} />
        </div>
        <div className="row" style={{ gap: 10 }}>
          <div className="field grow">
            <span className="field-label">截止日期</span>
            <DateField value={due} onChange={setDue} width={160} />
          </div>
          <div className="field" style={{ width: 120 }}>
            <span className="field-label">优先级</span>
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Todo['priority'])}>
              <option value="normal">普通</option>
              <option value="important">重要</option>
            </select>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function MergeDialog({
  open,
  onClose,
  personId,
  onMerged,
}: {
  open: boolean
  onClose: () => void
  personId: string
  onMerged: () => void
}) {
  const persons = useStore((s) => s.persons)
  const fieldDefinitions = useStore((s) => s.fieldDefinitions)
  const mergePersons = useStore((s) => s.mergePersons)
  const [targetId, setTargetId] = useState('')
  const [choice, setChoice] = useState<Record<string, 'keep' | 'remove'>>({})
  const [step, setStep] = useState(1)
  const toast = useUI((s) => s.toast)
  const keep = persons.find((p) => p.id === personId)
  const other = persons.find((p) => p.id === targetId)
  const diffs = useMemo(() => {
    if (!keep || !other) return []
    return fieldDefinitions
      .filter((d) => d.type !== 'timeline')
      .map((d) => ({
        def: d,
        a: keep.fields[d.key],
        b: other.fields[d.key],
      }))
      .filter((x) => JSON.stringify(x.a ?? '') !== JSON.stringify(x.b ?? ''))
  }, [keep, other, fieldDefinitions])

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="合并人脉"
      footer={
        step === 1 ? (
          <>
            <button className="btn" onClick={onClose}>
              取消
            </button>
            <button className="btn primary" disabled={!targetId} onClick={() => setStep(2)}>
              下一步：逐字段对比
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost left" onClick={() => setStep(1)}>
              上一步
            </button>
            <button className="btn" onClick={onClose}>
              取消
            </button>
            <button
              className="btn primary"
              onClick={() => {
                mergePersons(personId, targetId, choice)
                toast('已合并，引用关系已重定向', 'success')
                onClose()
                onMerged()
              }}
            >
              确认合并
            </button>
          </>
        )
      }
    >
      {step === 1 ? (
        <div className="stack" style={{ gap: 12 }}>
          <p className="field-hint">
            选择要合并进来的另一条记录。合并后保留当前记录（{String(keep?.fields.name ?? '')}），另一条记录的互动、待办与引用会自动重定向。
          </p>
          <div className="picker-list">
            {persons
              .filter((p) => p.id !== personId)
              .map((p) => (
                <button
                  key={p.id}
                  className={cn('picker-item', targetId === p.id && 'on')}
                  onClick={() => setTargetId(p.id)}
                >
                  <Avatar name={personName(p)} size={26} />
                  <div className="grow">
                    <div style={{ fontSize: 13 }}>{personName(p)}</div>
                    <div className="sub">
                      {String(p.fields.company ?? '—')} · {(p.fields.phones as { number: string }[])?.[0]?.number ?? '无电话'}
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <p className="field-hint">逐字段选择保留哪一侧的值，未选择的字段保留「{String(keep?.fields.name ?? '')}」的值。</p>
          {diffs.length === 0 && <p className="field-hint">两条记录字段值完全一致，可直接合并。</p>}
          {diffs.map(({ def, a, b }) => (
            <div key={def.key} className="conflict-row">
              <div className="cf-head">{def.label}</div>
              <div className="side-pick">
                <button
                  className={cn('side-opt', choice[def.key] !== 'remove' && 'on')}
                  onClick={() => setChoice((c) => ({ ...c, [def.key]: 'keep' }))}
                >
                  {formatDisp(def, a, keep)}
                </button>
                <button
                  className={cn('side-opt', choice[def.key] === 'remove' && 'on')}
                  onClick={() => setChoice((c) => ({ ...c, [def.key]: 'remove' }))}
                >
                  {formatDisp(def, b, other)}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function formatDisp(def: FieldDefinition, value: unknown, person?: Person): string {
  if (value === undefined || value === null || value === '') return '（空）'
  if (def.type === 'phone') return ((value as { number: string }[]) ?? []).map((x) => x.number).join(' / ') || '（空）'
  if (def.type === 'select') return def.config.options?.find((o) => o.id === value)?.label ?? String(value)
  if (def.type === 'personRef') {
    const ids = Array.isArray(value) ? value : [value]
    return ids.map((x) => (typeof x === 'string' ? x.slice(-6) : (x as { snapshotName: string }).snapshotName)).join('、')
  }
  if (def.type === 'date') return formatDate((value as { value: string }).value)
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 60)
  return String(value)
}
