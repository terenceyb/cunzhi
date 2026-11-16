import type {
  DeriveCtx,
} from './derive'
import type {
  DateValue,
  FieldDefinition,
  FilterNode,
  FilterOperator,
  Person,
  PersonRef,
} from '../types'
import { completenessOf, defByKey, displayValue, isEmptyValue, isRefSnapshot, lastInteractionOf } from './derive'
import { dayDiff, formatDate, uid } from './utils'

export const MAX_DEPTH = 3
export const MAX_CONDITIONS = 20

export const newCondition = (fieldKey = 'groups', operator: FilterOperator = 'equals'): FilterNode => ({
  kind: 'condition',
  id: uid('c'),
  fieldKey,
  operator,
  value: '',
})

export const newGroup = (): FilterNode => ({ kind: 'group', id: uid('g'), logic: 'and', children: [] })

export const emptyFilter = (): FilterNode => newGroup()

export function operatorsFor(def?: FieldDefinition, fieldKey?: string): { value: FilterOperator; label: string }[] {
  if (fieldKey === '__completeness') return [
    { value: 'lt', label: '低于' },
    { value: 'gt', label: '高于' },
  ]
  if (fieldKey === '__lastInteraction')
    return [
      { value: 'activeWithin', label: '最近 N 天有互动' },
      { value: 'inactiveOver', label: '超过 N 天无互动' },
      { value: 'never', label: '从未互动' },
    ]
  if (fieldKey === '__createdWithin') return [{ value: 'activeWithin', label: '最近 N 天添加' }]
  if (fieldKey === '__birthdayMonth') return [{ value: 'birthdayMonth', label: '生日在指定月份' }]
  switch (def?.type) {
    case 'text':
    case 'longtext':
      return [
        { value: 'contains', label: '包含' },
        { value: 'equals', label: '等于' },
        { value: 'notEquals', label: '不等于' },
        { value: 'isEmpty', label: '为空' },
        { value: 'notEmpty', label: '不为空' },
      ]
    case 'select':
      return [
        { value: 'equals', label: '等于' },
        { value: 'notEquals', label: '不等于' },
        { value: 'in', label: '属于任一' },
        { value: 'isEmpty', label: '为空' },
        { value: 'notEmpty', label: '不为空' },
      ]
    case 'multiselect':
      return [
        { value: 'hasAny', label: '包含任一' },
        { value: 'hasAll', label: '包含全部' },
        { value: 'hasNone', label: '不包含' },
        { value: 'isEmpty', label: '为空' },
        { value: 'notEmpty', label: '不为空' },
      ]
    case 'date':
      return [
        { value: 'before', label: '早于' },
        { value: 'after', label: '晚于' },
        { value: 'between', label: '介于' },
        { value: 'isEmpty', label: '为空' },
        { value: 'notEmpty', label: '不为空' },
      ]
    case 'number':
      return [
        { value: 'equals', label: '等于' },
        { value: 'gt', label: '大于' },
        { value: 'lt', label: '小于' },
        { value: 'between', label: '介于' },
        { value: 'isEmpty', label: '为空' },
        { value: 'notEmpty', label: '不为空' },
      ]
    case 'checkbox':
      return [
        { value: 'equals', label: '等于' },
        { value: 'isEmpty', label: '未勾选' },
      ]
    case 'phone':
    case 'email':
    case 'address':
    case 'link':
    case 'barcode':
      return [
        { value: 'contains', label: '包含' },
        { value: 'isEmpty', label: '为空' },
        { value: 'notEmpty', label: '不为空' },
      ]
    case 'personRef':
      return [
        { value: 'contains', label: '包含某人' },
        { value: 'equals', label: '等于某人' },
        { value: 'isEmpty', label: '为空' },
        { value: 'notEmpty', label: '不为空' },
      ]
    case 'attachment':
      return [
        { value: 'notEmpty', label: '有附件' },
        { value: 'isEmpty', label: '无附件' },
      ]
    default:
      return [
        { value: 'contains', label: '包含' },
        { value: 'isEmpty', label: '为空' },
        { value: 'notEmpty', label: '不为空' },
      ]
  }
}

export const unaryOperators: FilterOperator[] = ['isEmpty', 'notEmpty', 'never']

function asText(def: FieldDefinition | undefined, person: Person, ctx: DeriveCtx): string {
  const value = person.fields[def?.key ?? '']
  if (def?.type === 'phone') {
    const arr = (value as { number: string }[]) ?? []
    return arr.map((p) => p.number).join(' ')
  }
  return displayValue(def, value, ctx)
}

function dateValueOf(person: Person, def: FieldDefinition | undefined): string | null {
  const v = person.fields[def?.key ?? ''] as DateValue | undefined
  return v?.value ?? null
}

function refIds(value: unknown): string[] {
  const arr = Array.isArray(value) ? value : value ? [value] : []
  return arr.map((v) => (isRefSnapshot(v) ? v.refId : String(v)))
}

export function evalCondition(cond: Extract<FilterNode, { kind: 'condition' }>, person: Person, ctx: DeriveCtx): boolean {
  const { fieldKey, operator, value } = cond
  const def = defByKey(ctx.fieldDefinitions, fieldKey)
  let result = false

  if (fieldKey === '__completeness') {
    const c = completenessOf(person, ctx.fieldDefinitions)
    result = operator === 'gt' ? c > Number(value) : c < Number(value)
  } else if (fieldKey === '__lastInteraction') {
    const last = lastInteractionOf(person.id, ctx.timelineEvents)
    if (operator === 'never') result = !last
    else if (!last) result = operator === 'inactiveOver'
    else {
      const days = dayDiff(last)
      result = operator === 'activeWithin' ? days <= Number(value) : days > Number(value)
    }
  } else if (fieldKey === '__createdWithin') {
    result = dayDiff(person.createdAt) <= Number(value)
  } else if (fieldKey === '__birthdayMonth') {
    const b = person.fields.birthday as DateValue | undefined
    if (!b?.value) result = false
    else result = new Date(b.value).getMonth() + 1 === Number(value)
  } else if (!def) {
    result = false
  } else {
    const raw = person.fields[fieldKey]
    const empty = isEmptyValue(raw, def)
    switch (operator) {
      case 'isEmpty':
        result = empty
        break
      case 'notEmpty':
        result = !empty
        break
      case 'never':
        result = false
        break
      case 'contains': {
        if (def.type === 'personRef') result = refIds(raw).includes(String(value))
        else result = asText(def, person, ctx).toLowerCase().includes(String(value ?? '').toLowerCase())
        break
      }
      case 'equals': {
        if (def.type === 'checkbox') result = Boolean(raw) === Boolean(value)
        else if (def.type === 'date') result = dateValueOf(person, def) === String(value ?? '')
        else if (def.type === 'number') result = Number(raw) === Number(value)
        else if (def.type === 'personRef') result = refIds(raw)[0] === String(value) && refIds(raw).length === 1
        else result = String(raw ?? '') === String(value ?? '')
        if (def.type === 'personRef' && def.config.multiple) result = refIds(raw).includes(String(value))
        break
      }
      case 'notEquals': {
        if (def.type === 'number') result = Number(raw) !== Number(value)
        else result = String(raw ?? '') !== String(value ?? '')
        break
      }
      case 'in': {
        const list = Array.isArray(value) ? (value as unknown[]).map(String) : []
        result = list.length === 0 ? false : list.includes(String(raw ?? ''))
        break
      }
      case 'gt':
        result = Number(raw) > Number(value)
        break
      case 'lt':
        result = Number(raw) < Number(value)
        break
      case 'between': {
        const [a, b] = Array.isArray(value) ? (value as unknown[]) : []
        if (def.type === 'date') {
          const dv = dateValueOf(person, def)
          result = !!dv && dv >= String(a ?? '') && dv <= String(b ?? '')
        } else {
          const n = Number(raw)
          result = n >= Number(a) && n <= Number(b)
        }
        break
      }
      case 'before': {
        const dv = dateValueOf(person, def)
        result = !!dv && dv < String(value ?? '')
        break
      }
      case 'after': {
        const dv = dateValueOf(person, def)
        result = !!dv && dv > String(value ?? '')
        break
      }
      case 'hasAny': {
        const arr = ((raw as string[]) ?? []).map(String)
        const list = Array.isArray(value) ? (value as unknown[]).map(String) : [String(value)]
        result = list.some((v) => arr.includes(v))
        break
      }
      case 'hasAll': {
        const arr = ((raw as string[]) ?? []).map(String)
        const list = Array.isArray(value) ? (value as unknown[]).map(String) : [String(value)]
        result = list.length > 0 && list.every((v) => arr.includes(v))
        break
      }
      case 'hasNone': {
        const arr = ((raw as string[]) ?? []).map(String)
        const list = Array.isArray(value) ? (value as unknown[]).map(String) : [String(value)]
        result = !list.some((v) => arr.includes(v))
        break
      }
      case 'birthdayMonth': {
        const dv = dateValueOf(person, def)
        result = !!dv && new Date(dv).getMonth() + 1 === Number(value)
        break
      }
      default:
        result = false
    }
  }
  return cond.negated ? !result : result
}

export function evalFilter(node: FilterNode, person: Person, ctx: DeriveCtx): boolean {
  if (node.kind === 'condition') return evalCondition(node, person, ctx)
  if (node.children.length === 0) return true
  const results = node.children.map((child) => evalFilter(child, person, ctx))
  return node.logic === 'and' ? results.every(Boolean) : results.some(Boolean)
}

export function applyFilter(persons: Person[], filter: FilterNode, ctx: DeriveCtx): Person[] {
  return persons.filter((p) => evalFilter(filter, p, ctx))
}

export interface FunnelStep {
  nodeId: string
  label: string
  depth: number
  logic: 'and' | 'or' | null
  selfCount: number
  remaining: number
}

/** 命中漏斗：逐层收缩可视化（AND 语义逐条收窄，OR 语义取并集） */
export function computeFunnel(filter: FilterNode, ctx: DeriveCtx): { steps: FunnelStep[]; total: number; zeroAt?: string } {
  const all = ctx.persons
  const steps: FunnelStep[] = []
  let zeroAt: string | undefined

  const walk = (node: FilterNode, pool: Person[], depth: number): Person[] => {
    if (node.kind === 'condition') {
      const matched = pool.filter((p) => evalCondition(node, p, ctx))
      steps.push({
        nodeId: node.id,
        label: describeCondition(node, ctx),
        depth,
        logic: null,
        selfCount: matched.length,
        remaining: matched.length,
      })
      if (matched.length === 0) zeroAt = zeroAt ?? node.id
      return matched
    }
    if (node.children.length === 0) {
      // 根级空组代表「全部人脉」，子级空组不参与漏斗展示
      if (depth === 0) {
        steps.push({ nodeId: node.id, label: '全部人脉', depth, logic: node.logic, selfCount: pool.length, remaining: pool.length })
      }
      return pool
    }
    let current = node.logic === 'and' ? pool : []
    let first = true
    for (const child of node.children) {
      if (node.logic === 'and') {
        const before = current.length
        const next = walk(child, current, depth + 1)
        current = next
        if (current.length === 0 && before > 0) zeroAt = zeroAt ?? child.id
      } else {
        const childMatched = walk(child, pool, depth + 1)
        if (first) {
          current = childMatched
          first = false
        } else {
          const ids = new Set(current.map((p) => p.id))
          current = [...current, ...childMatched.filter((p) => !ids.has(p.id))]
        }
      }
    }
    if (current.length === 0 && !zeroAt) zeroAt = node.id
    // 根组只有单个条件时，不再重复汇总一行；嵌套组仍保留汇总
    const trivialRoot = depth === 0 && node.children.length === 1 && node.children[0].kind === 'condition'
    if (!trivialRoot) {
      steps.push({
        nodeId: node.id,
        label: `条件组（${node.logic === 'and' ? '且' : '或'}）`,
        depth,
        logic: node.logic,
        selfCount: current.length,
        remaining: current.length,
      })
    }
    return current
  }

  const result = walk(filter, all, 0)
  return { steps, total: result.length, zeroAt }
}

export function describeCondition(
  cond: Extract<FilterNode, { kind: 'condition' }>,
  ctx: Pick<DeriveCtx, 'fieldDefinitions' | 'groups' | 'tags' | 'persons'>,
): string {
  const def = defByKey(ctx.fieldDefinitions, cond.fieldKey)
  const opLabel = operatorsFor(def, cond.fieldKey).find((o) => o.value === cond.operator)?.label ?? cond.operator
  const prefix = cond.negated ? '非：' : ''
  const fname =
    cond.fieldKey === '__completeness'
      ? '字段完整度'
      : cond.fieldKey === '__lastInteraction'
        ? '互动活跃度'
        : cond.fieldKey === '__createdWithin'
          ? '添加时间'
          : cond.fieldKey === '__birthdayMonth'
            ? '生日月份'
            : def?.label ?? cond.fieldKey
  if (unaryOperators.includes(cond.operator)) return `${prefix}${fname} ${opLabel}`
  if (cond.fieldKey === '__completeness') return `${prefix}${fname} ${opLabel} ${cond.value}%`
  if (cond.fieldKey === '__lastInteraction' || cond.fieldKey === '__createdWithin')
    return `${prefix}${fname} ${opLabel} ${cond.value} 天`
  if (cond.operator === 'between') {
    const [a, b] = Array.isArray(cond.value) ? (cond.value as unknown[]) : []
    return `${fname} ${opLabel} ${valLabel(cond.value, def, ctx, a)} ~ ${valLabel(cond.value, def, ctx, b)}`
  }
  return `${prefix}${fname} ${opLabel} ${valLabel(cond.value, def, ctx)}`
}

function valLabel(
  value: unknown,
  def: FieldDefinition | undefined,
  ctx: Pick<DeriveCtx, 'groups' | 'tags' | 'persons' | 'fieldDefinitions'>,
  single?: unknown,
): string {
  const v = single !== undefined ? single : value
  if (Array.isArray(v)) return v.map((x) => valLabel(x, def, ctx)).join('、')
  if (v === null || v === undefined || v === '') return '…'
  if (def?.key === 'groups') return ctx.groups.find((g) => g.id === String(v))?.name ?? String(v)
  if (def?.key === 'tags') return ctx.tags.find((t) => t.id === String(v))?.name ?? String(v)
  if (def?.type === 'select') return def.config.options?.find((o) => o.id === String(v))?.label ?? String(v)
  if (def?.type === 'multiselect')
    return def.config.options?.find((o) => o.id === String(v))?.label ?? String(v)
  if (def?.type === 'personRef') return ctx.persons.find((p) => p.id === String(v))?.fields.name as string ?? String(v)
  if (def?.type === 'checkbox') return v ? '是' : '否'
  if (def?.type === 'date') return formatDate(String(v))
  return String(v)
}

export function countConditions(node: FilterNode): number {
  if (node.kind === 'condition') return 1
  return node.children.reduce((acc, c) => acc + countConditions(c), 0)
}

export function depthOf(node: FilterNode): number {
  if (node.kind === 'condition') return 0
  if (node.children.length === 0) return 1
  return 1 + Math.max(...node.children.map(depthOf))
}

export function hasAnyCondition(node: FilterNode): boolean {
  return countConditions(node) > 0
}

export function removeNode(node: FilterNode, id: string): FilterNode {
  if (node.kind === 'condition') return node
  return {
    ...node,
    children: node.children.filter((c) => c.id !== id).map((c) => removeNode(c, id)),
  }
}

export function updateNode(node: FilterNode, id: string, patch: Partial<Extract<FilterNode, { kind: 'condition' }>>): FilterNode {
  if (node.kind === 'condition') return node.id === id ? ({ ...node, ...patch } as FilterNode) : node
  return { ...node, children: node.children.map((c) => updateNode(c, id, patch)) }
}

export function addChild(node: FilterNode, parentId: string, child: FilterNode): FilterNode {
  if (node.kind === 'condition') return node
  if (node.id === parentId) return { ...node, children: [...node.children, child] }
  return { ...node, children: node.children.map((c) => addChild(c, parentId, child)) }
}

export function findNode(node: FilterNode, id: string): FilterNode | null {
  if (node.id === id) return node
  if (node.kind === 'condition') return null
  for (const c of node.children) {
    const found = findNode(c, id)
    if (found) return found
  }
  return null
}

export function collectIds(node: FilterNode): string[] {
  if (node.kind === 'condition') return [node.id]
  return [node.id, ...node.children.flatMap(collectIds)]
}

export const isPersonRefValue = (v: PersonRef): boolean => typeof v === 'string' || isRefSnapshot(v)
