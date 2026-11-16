import type {
  AttachmentData,
  FieldDefinition,
  Group,
  Person,
  PersonRef,
  RefSnapshot,
  Tag,
  TimelineEvent,
  DateValue,
  PhoneValue,
  EmailValue,
  AddressValue,
  LinkValue,
  BarcodeValue,
  AttachmentMeta,
} from '../types'
import { formatDate, dayDiff } from './utils'

export interface DeriveCtx {
  fieldDefinitions: FieldDefinition[]
  groups: Group[]
  tags: Tag[]
  persons: Person[]
  timelineEvents: TimelineEvent[]
  attachments: Record<string, AttachmentData>
}

export const defByKey = (defs: FieldDefinition[], key: string): FieldDefinition | undefined =>
  defs.find((d) => d.key === key)

export const isRefSnapshot = (v: unknown): v is RefSnapshot =>
  !!v && typeof v === 'object' && 'refId' in (v as Record<string, unknown>) && (v as RefSnapshot).deleted === true

export function isEmptyValue(value: unknown, def?: FieldDefinition): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (typeof value === 'number') return Number.isNaN(value)
  if (typeof value === 'boolean') return value === false
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    if ('value' in (value as Record<string, unknown>)) {
      const v = value as DateValue
      return !v.value
    }
    if ('url' in (value as Record<string, unknown>)) return !(value as LinkValue).url
    if ('rawValue' in (value as Record<string, unknown>)) return !(value as BarcodeValue).rawValue
    if (def?.type === 'personRef') return false
  }
  return false
}

const money = (n: number, decimals: number): string => {
  const fixed = n.toFixed(decimals)
  const [int, dec] = fixed.split('.')
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec ? `${withSep}.${dec}` : withSep
}

export function optionLabel(def: FieldDefinition | undefined, id: string): string {
  return def?.config.options?.find((o) => o.id === id)?.label ?? id
}

export function displayValue(
  def: FieldDefinition | undefined,
  value: unknown,
  ctx: Pick<DeriveCtx, 'persons' | 'tags' | 'groups' | 'fieldDefinitions'>,
  opts: { maskPhone?: boolean } = {},
): string {
  if (!def) return ''
  if (isEmptyValue(value, def)) return ''
  const personsById = new Map(ctx.persons.map((p) => [p.id, p]))
  const nameOf = (ref: PersonRef): string => {
    if (isRefSnapshot(ref)) return ref.snapshotName
    const p = personsById.get(ref)
    if (!p) return '已删除联系人'
    return String(p.fields.name ?? '未命名')
  }
  switch (def.type) {
    case 'text':
    case 'longtext':
      return String(value)
    case 'number': {
      const n = Number(value)
      if (Number.isNaN(n)) return ''
      const dec = def.config.decimals ?? 0
      const base = money(n, dec)
      if (def.config.unit === 'percent') return `${base}%`
      if (def.config.unit === 'custom' && def.config.unitText) return `${base}${def.config.unitText}`
      return base
    }
    case 'checkbox':
      return value ? '是' : '否'
    case 'select': {
      if (def.key === 'groups') {
        const g = ctx.groups.find((x) => x.id === value)
        return g?.name ?? (typeof value === 'string' ? '未分组' : '')
      }
      return optionLabel(def, String(value))
    }
    case 'multiselect': {
      const arr = Array.isArray(value) ? (value as string[]) : [String(value)]
      if (def.key === 'tags') {
        return arr.map((id) => ctx.tags.find((t) => t.id === id)?.name ?? id).join('、')
      }
      return arr.map((id) => optionLabel(def, id)).join('、')
    }
    case 'date': {
      const v = value as DateValue
      if (!v?.value) return ''
      return formatDate(v.value, def.config.dateFormat ?? 'YYYY-MM-DD', Boolean(v.hasTime))
    }
    case 'phone': {
      const arr = (value as PhoneValue[]) ?? []
      return arr.map((p) => (opts.maskPhone ? mask(p.number) : p.number)).join(' / ')
    }
    case 'email': {
      const arr = (value as EmailValue[]) ?? []
      return arr.map((e) => e.address).join(' / ')
    }
    case 'address': {
      const arr = (value as AddressValue[]) ?? []
      return arr
        .map((a) => [a.province, a.city, a.district, a.detail].filter(Boolean).join(' '))
        .join(' / ')
    }
    case 'link': {
      const v = value as LinkValue
      return v.displayText || v.url
    }
    case 'barcode':
      return (value as BarcodeValue).rawValue
    case 'personRef': {
      const arr = Array.isArray(value) ? (value as PersonRef[]) : [value as PersonRef]
      return arr.map(nameOf).join('、')
    }
    case 'attachment': {
      const arr = (value as AttachmentMeta[]) ?? []
      return arr.map((a) => a.name).join('、')
    }
    default:
      return ''
  }
}

const mask = (num: string): string => {
  const digits = (num || '').replace(/[\s-]/g, '')
  if (digits.length >= 7) return `${digits.slice(0, 3)}****${digits.slice(-4)}`
  return num
}

export function personName(person: Person | undefined): string {
  if (!person) return '未命名'
  const n = person.fields.name
  return typeof n === 'string' && n.trim() ? n : '未命名'
}

const INTERACTION_TYPES: TimelineEvent['type'][] = ['note', 'reach_out', 'todo_completed', 'anniversary', 'import']

export function lastInteractionOf(personId: string, events: TimelineEvent[]): string | null {
  let latest: string | null = null
  for (const e of events) {
    if (e.personId !== personId) continue
    if (!INTERACTION_TYPES.includes(e.type)) continue
    if (!latest || new Date(e.occurredAt).getTime() > new Date(latest).getTime()) latest = e.occurredAt
  }
  return latest
}

export function personEvents(personId: string, events: TimelineEvent[]): TimelineEvent[] {
  return events
    .filter((e) => e.personId === personId)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
}

export function completenessOf(person: Person, defs: FieldDefinition[]): number {
  const keys = defs.filter(
    (d) => d.visible && !d.disabled && d.type !== 'timeline' && d.key !== 'avatar',
  )
  if (keys.length === 0) return 100
  const filled = keys.filter((d) => !isEmptyValue(person.fields[d.key], d)).length
  return Math.round((filled / keys.length) * 100)
}

export function ageOf(person: Person, defs: FieldDefinition[]): number | null {
  const def = defByKey(defs, 'birthday')
  const v = person.fields.birthday as DateValue | undefined
  if (!def || !v?.value) return null
  const d = new Date(v.value)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}

/** 距下一次生日的天数（0 表示今天） */
export function daysToBirthday(birthday: string): number | null {
  if (!birthday) return null
  const d = new Date(birthday)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  const next = new Date(now.getFullYear(), d.getMonth(), d.getDate())
  if (next.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
    next.setFullYear(now.getFullYear() + 1)
  }
  return dayDiff(now, next)
}

export interface PersonMeta {
  person: Person
  name: string
  group?: Group
  tags: Tag[]
  groupColor: string
  lastInteractionAt: string | null
  completeness: number
  avatar?: AttachmentData
}

export function buildPersonMeta(person: Person, ctx: DeriveCtx): PersonMeta {
  const groupId = person.fields.groups as string | undefined
  const group = ctx.groups.find((g) => g.id === groupId)
  const tagIds = (person.fields.tags as string[]) ?? []
  const tags = tagIds.map((id) => ctx.tags.find((t) => t.id === id)).filter(Boolean) as Tag[]
  const avatarIds = (person.fields.avatar as AttachmentMeta[]) ?? []
  const avatar = avatarIds[0] ? ctx.attachments[avatarIds[0].id] : undefined
  return {
    person,
    name: personName(person),
    group,
    tags,
    groupColor: group?.color ?? '#5B6573',
    lastInteractionAt: lastInteractionOf(person.id, ctx.timelineEvents),
    completeness: completenessOf(person, ctx.fieldDefinitions),
    avatar,
  }
}

export function buildMetaMap(ctx: DeriveCtx): Map<string, PersonMeta> {
  const map = new Map<string, PersonMeta>()
  for (const p of ctx.persons) map.set(p.id, buildPersonMeta(p, ctx))
  return map
}

export const firstPhone = (person: Person): string => {
  const arr = (person.fields.phones as PhoneValue[]) ?? []
  return arr[0]?.number ?? ''
}
