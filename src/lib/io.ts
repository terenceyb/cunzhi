import type {
  AttachmentData,
  AttachmentMeta,
  DataPackage,
  EmailValue,
  FieldDefinition,
  Group,
  Person,
  PhoneValue,
  Tag,
  TimelineEvent,
} from '../types'
import type { DeriveCtx } from './derive'
import { defByKey, displayValue, isEmptyValue, personName } from './derive'
import { nowISO, uid } from './utils'

/* ---------------- CSV ---------------- */

export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch === '\r') {
      // skip
    } else cell += ch
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export function toCSV(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number): string => {
    const s = String(v ?? '')
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.map(esc).join(',')]
  for (const r of rows) lines.push(r.map(esc).join(','))
  // 加 BOM 以便 Excel 正确识别 UTF-8
  return `\uFEFF${lines.join('\r\n')}`
}

export function exportCSV(
  persons: Person[],
  defs: FieldDefinition[],
  ctx: DeriveCtx,
): { headers: string[]; rows: string[][]; text: string } {
  const visible = [...defs]
    .filter((d) => d.type !== 'timeline' && !d.disabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const headers = visible.map((d) => d.label)
  const rows = persons.map((p) =>
    visible.map((d) => {
      const v = p.fields[d.key]
      if (isEmptyValue(v, d)) return ''
      if (d.type === 'date') {
        const dv = v as { value: string }
        return dv.value ?? ''
      }
      if (d.type === 'link') return (v as { url: string }).url
      if (d.type === 'attachment') return ((v as AttachmentMeta[]) ?? []).map((a) => a.name).join(';')
      if (d.type === 'multiselect') {
        const arr = Array.isArray(v) ? (v as string[]) : []
        if (d.key === 'tags') return arr.map((id) => ctx.tags.find((t) => t.id === id)?.name ?? id).join(';')
        return arr
          .map((id) => d.config.options?.find((o) => o.id === id)?.label ?? id)
          .join(';')
      }
      if (d.type === 'phone') return ((v as PhoneValue[]) ?? []).map((x) => x.number).join(';')
      if (d.type === 'email') return ((v as EmailValue[]) ?? []).map((x) => x.address).join(';')
      if (d.type === 'personRef') return displayValue(d, v, ctx)
      const text = displayValue(d, v, ctx)
      return d.type === 'longtext' ? text.replace(/\n/g, ' ') : text
    }),
  )
  return { headers, rows, text: toCSV(headers, rows) }
}

export const FIELD_ALIASES: Record<string, string[]> = {
  name: ['姓名', '名字', '名称', 'name', 'fn', 'fullname', 'full name', '称呼'],
  phones: ['电话', '手机', '手机号', '联系方式', 'phone', 'tel', 'telephone', 'mobile', 'cell'],
  emails: ['邮箱', '邮件', '电子邮件', 'email', 'e-mail', 'mail'],
  company: ['公司', '单位', '公司/单位', 'company', 'org', 'organization', '组织'],
  city: ['城市', 'city', '所在地'],
  addresses: ['地址', 'address', 'adr', '住址'],
  tags: ['标签', 'tags', 'tag'],
  groups: ['群组', '分组', 'groups', 'group', 'category'],
  birthday: ['生日', '出生日期', 'birthday', 'birth', 'dob'],
  referrer: ['引荐人', '介绍人', 'referrer', 'referred by'],
  relatedPersons: ['关联人', '关系', 'related', 'relation'],
  memo: ['备注', '关系备忘', 'note', 'notes', 'memo', '备注信息'],
}

const LABEL_SYNONYMS: string[][] = [
  ['职位', '职务', '头衔', '岗位', 'title', 'position', 'job', 'jobtitle'],
  ['主页', '个人主页', '网站', '官网', 'website', 'url', 'homepage'],
  ['简介', '介绍', '备注简介', 'bio', 'intro'],
  ['微信', 'wechat', 'weixin'],
]

export function guessFieldKey(header: string, defs: FieldDefinition[]): string | 'memo' | null {
  const h = header.trim().toLowerCase()
  for (const d of defs) {
    if (d.label.toLowerCase() === h || d.key.toLowerCase() === h) return d.key
  }
  for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase() === h)) {
      if (key === 'memo') return 'memo'
      if (key === 'emails') {
        const emailDef = defs.find((d) => d.type === 'email')
        return emailDef?.key ?? null
      }
      if (defs.some((d) => d.key === key)) return key
    }
  }
  // 同义词组：如「职位」可命中自定义字段「职务」
  for (const group of LABEL_SYNONYMS) {
    if (!group.includes(h)) continue
    const def = defs.find((d) => group.includes(d.label.toLowerCase().trim()))
    if (def) return def.key
  }
  return null
}

export interface ImportMapping {
  sourceIndex: number
  targetKey: string | 'ignore' | 'create'
  createLabel?: string
}

export interface ImportPreviewRow {
  values: string[]
}

export function parseImportValue(
  raw: string,
  def: FieldDefinition | undefined,
): unknown {
  const text = (raw ?? '').trim()
  if (!text) return ''
  if (!def) return text
  switch (def.type) {
    case 'phone': {
      const parts = text.split(/[;；\n]/).map((s) => s.trim()).filter(Boolean)
      return parts.map((number) => ({ label: '手机', number }))
    }
    case 'email': {
      const parts = text.split(/[;；\n]/).map((s) => s.trim()).filter(Boolean)
      return parts.map((address) => ({ label: '工作', address }))
    }
    case 'address':
      return text
        .split(/[;；\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((detail) => ({ label: '地址', detail }))
    case 'date': {
      const norm = normalizeDate(text)
      return norm ? { value: norm, hasTime: def.config.hasTime ?? false } : ''
    }
    case 'number': {
      const n = Number(text.replace(/[^\d.-]/g, ''))
      return Number.isNaN(n) ? '' : n
    }
    case 'checkbox':
      return ['是', 'true', '1', 'yes', 'y', '✓'].includes(text.toLowerCase())
    case 'select':
      return def.config.options?.find((o) => o.label === text)?.id ?? text
    case 'multiselect':
      return text
        .split(/[;；,，、|]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((label) => def.config.options?.find((o) => o.label === label)?.id ?? label)
    case 'link':
      return { url: text, displayText: '' }
    default:
      return text
  }
}

function normalizeDate(text: string): string | null {
  const t = text.trim()
  if (!t) return null
  let m = t.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  m = t.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const d = new Date(t)
  if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return null
}

/* ---------------- vCard ---------------- */

export function parseVCards(text: string): { fn?: string; tels: string[]; emails: string[]; org?: string; adr?: string; note?: string }[] {
  const blocks = text.split(/BEGIN:VCARD/i).slice(1)
  const out: { fn?: string; tels: string[]; emails: string[]; org?: string; adr?: string; note?: string }[] = []
  for (const block of blocks) {
    const lines = unfold(block)
    const item: { fn?: string; tels: string[]; emails: string[]; org?: string; adr?: string; note?: string } = {
      tels: [],
      emails: [],
    }
    for (const line of lines) {
      const [rawName, ...rest] = line.split(':')
      const value = rest.join(':').trim()
      if (!rawName || !value) continue
      const name = rawName.split(';')[0].toUpperCase()
      if (name === 'FN') item.fn = decodeVCardValue(value)
      else if (name === 'N' && !item.fn) {
        const parts = value.split(';')
        item.fn = decodeVCardValue([parts[1], parts[0]].filter(Boolean).join(' '))
      } else if (name === 'TEL') item.tels.push(value.replace(/^tel:/i, '').trim())
      else if (name === 'EMAIL') item.emails.push(value.trim())
      else if (name === 'ORG') item.org = decodeVCardValue(value.split(';')[0])
      else if (name === 'ADR') item.adr = decodeVCardValue(value.split(';').filter(Boolean).join(' '))
      else if (name === 'NOTE') item.note = decodeVCardValue(value)
    }
    if (item.fn || item.tels.length) out.push(item)
  }
  return out
}

function unfold(block: string): string[] {
  const raw = block.split(/\r?\n/)
  const lines: string[] = []
  for (const line of raw) {
    if (/^[ \t]/.test(line) && lines.length > 0) lines[lines.length - 1] += line.trim()
    else if (line.trim() && !/^END:VCARD/i.test(line)) lines.push(line)
  }
  return lines
}

function decodeVCardValue(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .trim()
}

export function toVCard(
  persons: Person[],
  defs: FieldDefinition[],
  ctx: DeriveCtx,
  attachments: Record<string, AttachmentData>,
): string {
  const findType = (type: string) => defs.find((d) => d.type === type)
  const phoneDef = findType('phone')
  const emailDef = findType('email')
  const addressDef = findType('address')
  const companyDef = defByKey(defs, 'company')
  const nameDef = defByKey(defs, 'name')
  const memoOf = (p: Person) => (p.memo ? p.memo.replace(/\n/g, '\\n') : '')
  const out: string[] = []
  for (const p of persons) {
    const name = personName(p)
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${name}`, `N:${name};;;;`]
    if (nameDef && p.fields.name) lines.push(`NICKNAME:${String(p.fields.name)}`)
    if (companyDef && p.fields.company) lines.push(`ORG:${String(p.fields.company)}`)
    const phones = phoneDef ? ((p.fields[phoneDef.key] as PhoneValue[]) ?? []) : []
    phones.forEach((ph) => lines.push(`TEL;TYPE=${ph.label || 'CELL'}:${ph.number}`))
    const emails = emailDef ? ((p.fields[emailDef.key] as EmailValue[]) ?? []) : []
    emails.forEach((em) => lines.push(`EMAIL;TYPE=${em.label || 'WORK'}:${em.address}`))
    const addr = addressDef ? displayValue(addressDef, p.fields[addressDef.key], ctx) : ''
    if (addr) lines.push(`ADR;TYPE=WORK:;;${addr.replace(/;/g, ' ')};;;;`)
    const memo = memoOf(p)
    if (memo) lines.push(`NOTE:${memo}`)
    const avatarIds = (p.fields.avatar as AttachmentMeta[]) ?? []
    const av = avatarIds[0] ? attachments[avatarIds[0].id] : undefined
    if (av?.data) {
      const base64 = av.data.split(',')[1] ?? ''
      if (base64) lines.push(`PHOTO;ENCODING=b;TYPE=${av.mime.split('/')[1]?.toUpperCase() ?? 'JPEG'}:${base64}`)
    }
    lines.push('END:VCARD')
    out.push(lines.join('\r\n'))
  }
  return out.join('\r\n')
}

/* ---------------- 合并导入 ---------------- */

export interface MergeConflict {
  personId: string
  label: string
  local: unknown
  incoming: unknown
}

export function mergePackages(
  local: DataPackage,
  incoming: DataPackage,
): { merged: DataPackage; conflicts: { personId: string; name: string; fields: { key: string; label: string; local: unknown; incoming: unknown }[] }[] } {
  const byId = new Map(local.persons.map((p) => [p.id, p]))
  const conflicts: { personId: string; name: string; fields: { key: string; label: string; local: unknown; incoming: unknown }[] }[] = []
  const localDefs = local.fieldDefinitions
  const persons = [...local.persons]
  for (const inc of incoming.persons) {
    const existing = byId.get(inc.id)
    if (!existing) {
      persons.push(inc)
      continue
    }
    const diffs: { key: string; label: string; local: unknown; incoming: unknown }[] = []
    const keys = new Set([...Object.keys(existing.fields), ...Object.keys(inc.fields)])
    for (const key of keys) {
      const a = existing.fields[key]
      const b = inc.fields[key]
      if (JSON.stringify(a ?? '') !== JSON.stringify(b ?? '')) {
        diffs.push({
          key,
          label: localDefs.find((d) => d.key === key)?.label ?? key,
          local: a,
          incoming: b,
        })
      }
    }
    if (diffs.length) {
      conflicts.push({ personId: inc.id, name: personName(inc), fields: diffs })
    }
    // 默认以较新 updatedAt 为准
    const winner = new Date(inc.updatedAt).getTime() > new Date(existing.updatedAt).getTime() ? inc : existing
    const idx = persons.findIndex((p) => p.id === inc.id)
    if (idx >= 0) persons[idx] = winner
  }
  const eventIds = new Set(local.timelineEvents.map((e) => e.id))
  const timelineEvents = [...local.timelineEvents, ...incoming.timelineEvents.filter((e) => !eventIds.has(e.id))]
  const todoIds = new Set(local.todos.map((t) => t.id))
  const todos = [...local.todos, ...incoming.todos.filter((t) => !todoIds.has(t.id))]
  const annIds = new Set(local.anniversaries.map((a) => a.id))
  const anniversaries = [...local.anniversaries, ...incoming.anniversaries.filter((a) => !annIds.has(a.id))]
  const tagMap = new Map(local.tags.map((t) => [t.id, t]))
  for (const t of incoming.tags) if (!tagMap.has(t.id)) tagMap.set(t.id, t)
  const groupMap = new Map(local.groups.map((g) => [g.id, g]))
  for (const g of incoming.groups) if (!groupMap.has(g.id)) groupMap.set(g.id, g)

  return {
    merged: {
      ...local,
      persons,
      timelineEvents,
      todos,
      anniversaries,
      tags: [...tagMap.values()],
      groups: [...groupMap.values()],
      attachments: { ...incoming.attachments, ...local.attachments },
      updatedAt: nowISO(),
      revision: local.revision + 1,
    },
    conflicts,
  }
}

export function dedupeCandidates(persons: Person[]): { a: Person; b: Person; reason: string }[] {
  const out: { a: Person; b: Person; reason: string }[] = []
  const digits = (p: Person) =>
    (((p.fields.phones as PhoneValue[]) ?? []).map((x) => x.number.replace(/\D/g, '')).filter((x) => x.length >= 7))
  for (let i = 0; i < persons.length; i++) {
    for (let j = i + 1; j < persons.length; j++) {
      const a = persons[i]
      const b = persons[j]
      const sameName = personName(a).trim() === personName(b).trim()
      const pa = digits(a)
      const pb = digits(b)
      const samePhone = pa.some((x) => pb.includes(x))
      if (sameName || samePhone) {
        out.push({ a, b, reason: sameName && samePhone ? '姓名与电话相同' : sameName ? '姓名相同' : '电话相同' })
      }
    }
  }
  return out
}

export function newPersonFromValues(values: Record<string, unknown>): Person {
  return {
    id: uid('person'),
    createdAt: nowISO(),
    updatedAt: nowISO(),
    fields: values,
    reminderFrequencyDays: null,
    ignoredReminders: 0,
    snoozeUntil: null,
    pinnedTimelineId: null,
  }
}

export function groupName(groups: Group[], id: string | undefined): string {
  return groups.find((g) => g.id === id)?.name ?? '未分组'
}

export function tagNames(tags: Tag[], ids: string[] | undefined): string {
  return (ids ?? []).map((id) => tags.find((t) => t.id === id)?.name ?? id).join('、')
}

export function buildTimelineForImport(personId: string, content: string): TimelineEvent {
  return {
    id: uid('ev'),
    personId,
    type: 'import',
    content,
    occurredAt: nowISO(),
  }
}
