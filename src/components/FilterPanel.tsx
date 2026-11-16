import React, { useMemo, useState } from 'react'
import { Filter, FolderPlus, Plus, Trash2, X } from 'lucide-react'
import type { FieldDefinition, FilterNode, FilterOperator, SmartView } from '../types'
import type { DeriveCtx } from '../lib/derive'
import {
  MAX_CONDITIONS,
  MAX_DEPTH,
  addChild,
  computeFunnel,
  countConditions,
  depthOf,
  describeCondition,
  findNode,
  newCondition,
  newGroup,
  operatorsFor,
  removeNode,
  unaryOperators,
} from '../lib/filter'
import { useUI } from '../ui'
import { useStore } from '../store'
import { cn, uid } from '../lib/utils'
import { defByKey } from '../lib/derive'
import { Modal, Switch } from './ui'
import { FREQUENCY_OPTIONS } from '../defaults'

const VIRTUAL_FIELDS: { key: string; label: string }[] = [
  { key: '__lastInteraction', label: '互动活跃度' },
  { key: '__createdWithin', label: '添加时间' },
  { key: '__birthdayMonth', label: '生日月份' },
  { key: '__completeness', label: '字段完整度' },
]

export function fieldChoices(defs: FieldDefinition[]): { key: string; label: string; def?: FieldDefinition }[] {
  return [
    ...defs
      .filter((d) => d.type !== 'timeline')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((d) => ({ key: d.key, label: d.label, def: d })),
    ...VIRTUAL_FIELDS.map((v) => ({ key: v.key, label: v.label })),
  ]
}

function patchGroup(node: FilterNode, id: string, patch: Partial<Extract<FilterNode, { kind: 'group' }>>): FilterNode {
  if (node.kind === 'condition') return node
  if (node.id === id) return { ...node, ...patch }
  return { ...node, children: node.children.map((c) => patchGroup(c, id, patch)) }
}

export function FilterEditor({
  filter,
  onChange,
  ctx,
  depth = 0,
  root,
}: {
  filter: FilterNode
  onChange: (f: FilterNode) => void
  ctx: DeriveCtx
  depth?: number
  root?: boolean
}) {
  const choices = fieldChoices(ctx.fieldDefinitions)
  const totalConds = countConditions(filter)
  const levels = depthOf(filter)
  const canNest = levels < MAX_DEPTH
  const canAdd = totalConds < MAX_CONDITIONS

  if (filter.kind === 'condition') return null

  return (
    <div className={cn('filter-editor', !root && 'group-block')} data-logic={filter.logic}>
      {!root && (
        <div className="group-head">
          <div className="logic-switch">
            <button
              className={filter.logic === 'and' ? 'on' : ''}
              onClick={() => onChange(patchGroup(filter, filter.id, { logic: 'and' }))}
            >
              且
            </button>
            <button
              className={filter.logic === 'or' ? 'on' : ''}
              onClick={() => onChange(patchGroup(filter, filter.id, { logic: 'or' }))}
            >
              或
            </button>
          </div>
          <span>条件组 · {filter.children.length} 项</span>
        </div>
      )}

      {filter.children.map((child) =>
        child.kind === 'condition' ? (
          <ConditionRow
            key={child.id}
            cond={child}
            ctx={ctx}
            choices={choices}
            onChange={(patch) => onChange(replaceCondition(filter, child.id, patch))}
            onRemove={() => onChange(removeNode(filter, child.id))}
          />
        ) : (
          <div key={child.id} className="group-block">
            <div className="group-head">
              <div className="logic-switch">
                <button
                  className={child.logic === 'and' ? 'on' : ''}
                  onClick={() => onChange(patchGroup(filter, child.id, { logic: 'and' }))}
                >
                  且
                </button>
                <button
                  className={child.logic === 'or' ? 'on' : ''}
                  onClick={() => onChange(patchGroup(filter, child.id, { logic: 'or' }))}
                >
                  或
                </button>
              </div>
              <span>条件组</span>
              <button
                className="btn icon sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => onChange(removeNode(filter, child.id))}
                aria-label="删除条件组"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <FilterEditor filter={child} onChange={(f) => onChange(replaceChild(filter, child.id, f))} ctx={ctx} depth={depth + 1} />
            <div className="row" style={{ gap: 6 }}>
              <button
                className="btn sm ghost"
                disabled={!canAdd}
                onClick={() => onChange(addChild(filter, child.id, newCondition()))}
              >
                <Plus size={12} /> 条件
              </button>
              <button
                className="btn sm ghost"
                disabled={!canNest || !canAdd}
                onClick={() => onChange(addChild(filter, child.id, newGroup()))}
              >
                <FolderPlus size={12} /> 条件组
              </button>
            </div>
          </div>
        ),
      )}

      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button className="btn sm" disabled={!canAdd} onClick={() => onChange(addChild(filter, filter.id, newCondition()))}>
          <Plus size={13} /> 添加条件
        </button>
        {root && totalConds > 0 && (
          <button
            className="btn sm ghost"
            disabled={!canNest || !canAdd}
            onClick={() => onChange(addChild(filter, filter.id, newGroup()))}
            title={!canNest ? `最多 ${MAX_DEPTH} 层条件组` : '把条件分组，表达「不同人群不同规则」'}
          >
            <FolderPlus size={13} /> 添加条件组
          </button>
        )}
        {(!canAdd || !canNest) && (
          <span className="field-hint">
            {!canAdd ? `已达 ${MAX_CONDITIONS} 个条件上限` : `已达 ${MAX_DEPTH} 层嵌套上限`}
          </span>
        )}
      </div>
    </div>
  )
}

function replaceCondition(
  node: FilterNode,
  id: string,
  patch: Partial<Extract<FilterNode, { kind: 'condition' }>>,
): FilterNode {
  if (node.kind === 'condition') return node.id === id ? ({ ...node, ...patch } as FilterNode) : node
  return { ...node, children: node.children.map((c) => replaceCondition(c, id, patch)) }
}

function replaceChild(node: FilterNode, id: string, next: FilterNode): FilterNode {
  if (node.kind === 'condition') return node
  return { ...node, children: node.children.map((c) => (c.id === id ? next : replaceChild(c, id, next))) }
}

function ConditionRow({
  cond,
  ctx,
  choices,
  onChange,
  onRemove,
}: {
  cond: Extract<FilterNode, { kind: 'condition' }>
  ctx: DeriveCtx
  choices: { key: string; label: string; def?: FieldDefinition }[]
  onChange: (patch: Partial<Extract<FilterNode, { kind: 'condition' }>>) => void
  onRemove: () => void
}) {
  const def = defByKey(ctx.fieldDefinitions, cond.fieldKey)
  const ops = operatorsFor(def, cond.fieldKey)
  const unary = unaryOperators.includes(cond.operator)
  const isBetween = cond.operator === 'between'
  const between = Array.isArray(cond.value) ? (cond.value as unknown[]) : ['', '']

  const options = useMemo(() => {
    if (cond.fieldKey === 'groups') return ctx.groups.map((g) => ({ id: g.id, label: g.name }))
    if (cond.fieldKey === 'tags') return ctx.tags.map((t) => ({ id: t.id, label: t.name }))
    if (cond.fieldKey === '__birthdayMonth')
      return Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1), label: `${i + 1} 月` }))
    return def?.config.options ?? []
  }, [cond.fieldKey, def, ctx.groups, ctx.tags])

  const setField = (key: string) => {
    const nextDef = choices.find((c) => c.key === key)?.def
    const nextOps = operatorsFor(nextDef, key)
    onChange({ fieldKey: key, operator: nextOps[0].value, value: '' })
  }

  return (
    <div className="cond-row">
      <button
        className={cn('neg-toggle', cond.negated && 'on')}
        onClick={() => onChange({ negated: !cond.negated })}
        title="取反"
      >
        非
      </button>
      <select className="cond-field" value={cond.fieldKey} onChange={(e) => setField(e.target.value)} aria-label="字段">
        {choices.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <select
        className="cond-op"
        value={cond.operator}
        onChange={(e) => onChange({ operator: e.target.value as FilterOperator, value: '' })}
        aria-label="操作符"
      >
        {ops.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {!unary && !isBetween && (
        <>
          {options.length > 0 ? (
            <select
              className="cond-value"
              value={String(cond.value ?? '')}
              onChange={(e) => onChange({ value: e.target.value })}
              aria-label="值"
            >
              <option value="">选择…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : cond.fieldKey === '__completeness' || cond.fieldKey === '__lastInteraction' || cond.fieldKey === '__createdWithin' ? (
            <input
              className="cond-value"
              type="number"
              value={String(cond.value ?? '')}
              onChange={(e) => onChange({ value: Number(e.target.value) })}
              placeholder={cond.fieldKey === '__completeness' ? '百分比' : '天数'}
            />
          ) : def?.type === 'date' ? (
            <input
              className="cond-value"
              type="date"
              value={String(cond.value ?? '')}
              onChange={(e) => onChange({ value: e.target.value })}
            />
          ) : def?.type === 'number' ? (
            <input
              className="cond-value"
              type="number"
              value={String(cond.value ?? '')}
              onChange={(e) => onChange({ value: Number(e.target.value) })}
            />
          ) : def?.type === 'checkbox' ? (
            <select
              className="cond-value"
              value={String(cond.value ?? 'true')}
              onChange={(e) => onChange({ value: e.target.value === 'true' })}
            >
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          ) : def?.type === 'personRef' ? (
            <select
              className="cond-value"
              value={String(cond.value ?? '')}
              onChange={(e) => onChange({ value: e.target.value })}
            >
              <option value="">选择人…</option>
              {ctx.persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {String(p.fields.name ?? '未命名')}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="cond-value"
              value={String(cond.value ?? '')}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder="输入值"
            />
          )}
        </>
      )}

      {isBetween && (
        <div className="row" style={{ gap: 4, flex: '1 1 140px' }}>
          <input
            className="cond-value"
            type={def?.type === 'date' ? 'date' : 'number'}
            value={String(between[0] ?? '')}
            onChange={(e) => onChange({ value: [e.target.value, between[1] ?? ''] })}
          />
          <span className="muted">~</span>
          <input
            className="cond-value"
            type={def?.type === 'date' ? 'date' : 'number'}
            value={String(between[1] ?? '')}
            onChange={(e) => onChange({ value: [between[0] ?? '', e.target.value] })}
          />
        </div>
      )}

      <button className="btn icon sm" onClick={onRemove} aria-label="删除条件">
        <X size={13} />
      </button>
    </div>
  )
}

export function Funnel({ filter, ctx }: { filter: FilterNode; ctx: DeriveCtx }) {
  const { steps, total, zeroAt } = useMemo(() => computeFunnel(filter, ctx), [filter, ctx])
  const max = Math.max(1, ...steps.map((s) => s.remaining))
  if (steps.length === 0) return null
  return (
    <div className="funnel">
      <div className="row between">
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)' }}>命中漏斗</span>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          共 {ctx.persons.length} 人 → <strong style={{ color: 'var(--text)' }}>{total}</strong> 人
        </span>
      </div>
      {steps.map((s, i) => (
        <div key={`${s.nodeId}-${i}`} className={cn('funnel-step', s.nodeId === zeroAt && 'zero')}>
          <div style={{ width: Math.max(28, (s.remaining / max) * 46), flex: '0 0 auto' }} className="funnel-bar" />
          <span className="lbl" style={{ paddingLeft: Math.min(30, s.depth * 11) }} title={s.label}>
            {s.label}
          </span>
          <span className="num">{s.remaining}</span>
        </div>
      ))}
      {zeroAt && <span className="field-hint" style={{ color: 'var(--danger)' }}>该层筛选后人数归零，可从此处调整条件</span>}
    </div>
  )
}

export function FilterPanel({ ctx }: { ctx: DeriveCtx }) {
  const filterOpen = useUI((s) => s.filterOpen)
  const draft = useUI((s) => s.filterDraft)
  const setDraft = useUI((s) => s.setDraft)
  const closeFilter = useUI((s) => s.closeFilter)
  const clearFilter = useUI((s) => s.clearFilter)
  const askPrompt = useUI((s) => s.askPrompt)
  const toast = useUI((s) => s.toast)
  const saveSmartView = useStore((s) => s.saveSmartView)
  const [saveOpen, setSaveOpen] = useState(false)

  if (!filterOpen) return null
  const { total } = computeFunnel(draft, ctx)

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && closeFilter(false)}>
      <div className="modal" style={{ maxWidth: 660 }}>
        <div className="modal-header">
          <h2>
            <Filter size={15} /> 筛选条件
          </h2>
          <button className="btn icon sm" onClick={() => closeFilter(false)} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FilterEditor filter={draft} onChange={setDraft} ctx={ctx} root />
          <Funnel filter={draft} ctx={ctx} />
          <div className="chip-row">
            <span className="field-hint">快速筛选：</span>
            {ctx.groups.slice(0, 6).map((g) => (
              <button
                key={g.id}
                className={cn('chip sm', isGroupSelected(draft, g.id) && 'accent')}
                onClick={() => {
                  const groupCond = findGroupCond(draft, g.id)
                  setDraft(groupCond ? removeNode(draft, groupCond) : addChild(draft, draft.id, {
                    kind: 'condition',
                    id: uid('c'),
                    fieldKey: 'groups',
                    operator: 'equals',
                    value: g.id,
                  }))
                }}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn ghost left" onClick={() => { clearFilter(); setDraft(newGroup()) }}>
            全部清除
          </button>
          <button className="btn" onClick={() => setSaveOpen(true)}>
            保存为智能视图
          </button>
          <button className="btn primary" onClick={() => closeFilter(true)}>
            应用（{total} 人）
          </button>
        </div>
      </div>
      <SaveViewDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        filter={draft}
        onSaved={(v) => {
          saveSmartView(v)
          closeFilter(true)
          toast(`已保存视图「${v.name}」`, 'success')
        }}
      />
    </div>
  )
}

function isGroupSelected(node: FilterNode, groupId: string): boolean {
  if (node.kind === 'condition') return node.fieldKey === 'groups' && node.value === groupId
  return node.children.some((c) => isGroupSelected(c, groupId))
}
function findGroupCond(node: FilterNode, groupId: string): string | null {
  if (node.kind === 'condition') return node.fieldKey === 'groups' && node.value === groupId ? node.id : null
  for (const c of node.children) {
    const r = findGroupCond(c, groupId)
    if (r) return r
  }
  return null
}

export function SaveViewDialog({
  open,
  onClose,
  filter,
  onSaved,
  existing,
}: {
  open: boolean
  onClose: () => void
  filter: FilterNode
  onSaved: (v: SmartView) => void
  existing?: SmartView | null
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [icon, setIcon] = useState(existing?.icon ?? 'filter')
  const [color, setColor] = useState(existing?.color ?? '#2F6FEB')
  const [reminderEnabled, setReminderEnabled] = useState(existing?.reminderEnabled ?? false)
  const [freq, setFreq] = useState(existing?.reminderFrequencyDays ?? 14)
  const toast = useUI((s) => s.toast)
  React.useEffect(() => {
    if (open) {
      setName(existing?.name ?? '')
      setIcon(existing?.icon ?? 'filter')
      setColor(existing?.color ?? '#2F6FEB')
      setReminderEnabled(existing?.reminderEnabled ?? false)
      setFreq(existing?.reminderFrequencyDays ?? 14)
    }
  }, [open, existing])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? '编辑智能视图' : '保存为智能视图'}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button
            className="btn primary"
            onClick={() => {
              if (!name.trim()) {
                toast('请填写视图名称', 'error')
                return
              }
              onSaved({
                id: existing?.id ?? uid('view'),
                name: name.trim(),
                icon,
                color,
                filter,
                reminderEnabled,
                reminderFrequencyDays: reminderEnabled ? freq : undefined,
                isSystem: existing?.isSystem,
                createdAt: existing?.createdAt ?? '',
                updatedAt: '',
              })
              onClose()
            }}
          >
            保存
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="field">
          <span className="field-label">视图名称</span>
          <input
            className="input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：本月要联系的客户"
          />
        </div>
        <div className="field">
          <span className="field-label">颜色</span>
          <div className="row" style={{ gap: 6 }}>
            {['#2F6FEB', '#0F9D8F', '#B4530A', '#7C4DFF', '#C2185B', '#2E7D32', '#5B6573'].map((c) => (
              <button
                key={c}
                className={cn('color-swatch', color === c && 'active')}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`颜色 ${c}`}
              />
            ))}
          </div>
        </div>
        <div className="set-row">
          <div>
            <div className="lbl">用于走动提醒</div>
            <div className="hint">开启后，该视图内未单独设置频率的人脉将按统一频率提醒</div>
          </div>
          <Switch on={reminderEnabled} onChange={setReminderEnabled} label="用于走动提醒" />
        </div>
        {reminderEnabled && (
          <div className="field">
            <span className="field-label">联系频率</span>
            <select className="input" value={String(freq)} onChange={(e) => setFreq(Number(e.target.value))}>
              {FREQUENCY_OPTIONS.filter((o) => o.days && o.days > 0).map((o) => (
                <option key={o.label} value={String(o.days)}>
                  {o.label}（{o.days} 天）
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </Modal>
  )
}

/** 只算「有几条筛选条件」，列表工具栏与胶囊条共用 */
export function filterConditionCount(filter: FilterNode): number {
  let n = 0
  const walk = (node: FilterNode) => {
    if (node.kind === 'condition') n += 1
    else node.children.forEach(walk)
  }
  walk(filter)
  return n
}

/** 独立的「筛选」按钮：移动端把它和搜索框摆在同一行 */
export function FilterTrigger() {
  const filter = useUI((s) => s.filter)
  const openFilter = useUI((s) => s.openFilter)
  const n = filterConditionCount(filter)
  return (
    <button className="btn sm pt-filter" onClick={() => openFilter('inline')} aria-label="筛选条件">
      <Filter size={14} />
      <span className="pt-filter-label">筛选</span>
      {n > 0 && (
        <span className="badge soft" style={{ height: 16, minWidth: 16, fontSize: 10 }}>
          {n}
        </span>
      )}
    </button>
  )
}

export function ActiveFilterChips({ ctx, hideButton }: { ctx: DeriveCtx; hideButton?: boolean }) {
  const filter = useUI((s) => s.filter)
  const setFilter = useUI((s) => s.setFilter)
  const openFilter = useUI((s) => s.openFilter)
  const clearFilter = useUI((s) => s.clearFilter)
  const conds: Extract<FilterNode, { kind: 'condition' }>[] = []
  const walk = (n: FilterNode) => {
    if (n.kind === 'condition') conds.push(n)
    else n.children.forEach(walk)
  }
  walk(filter)
  if (hideButton && conds.length === 0) return null
  return (
    <div className="filter-chips">
      {!hideButton && (
        <button className="btn sm" onClick={() => openFilter('inline')}>
          <Filter size={13} /> 筛选
          {conds.length > 0 && (
            <span className="badge soft" style={{ height: 16, minWidth: 16, fontSize: 10 }}>
              {conds.length}
            </span>
          )}
        </button>
      )}
      {conds.slice(0, 4).map((c) => (
        <span key={c.id} className="chip removable">
          <span className="ellipsis" style={{ maxWidth: 200 }}>
            {describeCondition(c, ctx)}
          </span>
          <button onClick={() => setFilter(removeNode(filter, c.id))} aria-label="移除该条件">
            <X size={11} />
          </button>
        </span>
      ))}
      {conds.length > 4 && <span className="chip sm">+{conds.length - 4}</span>}
      {conds.length > 0 && (
        <button className="link-btn" onClick={clearFilter}>
          全部清除
        </button>
      )}
    </div>
  )
}
