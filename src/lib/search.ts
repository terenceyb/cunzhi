import { pinyin } from 'pinyin-pro'
import type { Person, FieldDefinition, TimelineEvent } from '../types'
import type { DeriveCtx } from './derive'
import { displayValue, isEmptyValue, personName } from './derive'

export interface IndexEntry {
  personId: string
  haystacks: { fieldKey: string; label: string; text: string; lower: string }[]
  pinyinFull: string
  pinyinInitials: string
}

const cache = new Map<string, { full: string; initials: string }>()

export function pinyinOf(text: string): { full: string; initials: string } {
  const key = text.trim()
  if (!key) return { full: '', initials: '' }
  const hit = cache.get(key)
  if (hit) return hit
  let full = ''
  let initials = ''
  try {
    const arr = pinyin(key, { toneType: 'none', type: 'array', nonZh: 'consecutive' }) as string[]
    full = arr.join('').replace(/\s+/g, '').toLowerCase()
    initials = arr.map((s) => s[0] ?? '').join('').toLowerCase()
  } catch {
    full = key.toLowerCase()
    initials = key.toLowerCase()
  }
  const res = { full, initials }
  if (cache.size < 5000) cache.set(key, res)
  return res
}

const digitOnly = (s: string): string => s.replace(/[^\d+]/g, '')

export function buildSearchIndex(ctx: DeriveCtx): IndexEntry[] {
  return ctx.persons.map((person) => {
    const haystacks: IndexEntry['haystacks'] = []
    const push = (fieldKey: string, label: string, text: string) => {
      if (text && text.trim()) haystacks.push({ fieldKey, label, text, lower: text.toLowerCase() })
    }
    for (const def of ctx.fieldDefinitions) {
      if (def.type === 'timeline' || !def.visible) continue
      const value = person.fields[def.key]
      if (isEmptyValue(value, def)) continue
      push(def.key, def.label, displayValue(def, value, ctx))
    }
    const phones = (person.fields.phones as { number: string }[]) ?? []
    const digits = phones.map((p) => digitOnly(p.number)).filter(Boolean)
    if (digits.length) push('phones', '电话', digits.join(' '))
    const name = personName(person)
    const py = pinyinOf(name)
    return { personId: person.id, haystacks, pinyinFull: py.full, pinyinInitials: py.initials }
  })
}

export interface SearchMatch {
  fieldKey: string
  label: string
  snippet: string
  start: number
  length: number
}

export interface SearchHit {
  personId: string
  name: string
  matches: SearchMatch[]
  score: number
}

function snippetAround(text: string, idx: number, len: number): { snippet: string; start: number; length: number } {
  const radius = 18
  const from = Math.max(0, idx - radius)
  const to = Math.min(text.length, idx + len + radius)
  return {
    snippet: `${from > 0 ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`,
    start: idx - from + (from > 0 ? 1 : 0),
    length: len,
  }
}

export function searchPersons(query: string, index: IndexEntry[], ctx: DeriveCtx): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const qDigits = digitOnly(q)
  const hits: SearchHit[] = []
  for (const entry of index) {
    const person = ctx.persons.find((p) => p.id === entry.personId)
    if (!person) continue
    const matches: SearchMatch[] = []
    let score = 0
    const name = personName(person)
    if (name.toLowerCase().includes(q)) {
      const idx = name.toLowerCase().indexOf(q)
      matches.push({ fieldKey: 'name', label: '姓名', ...snippetAround(name, idx, q.length) })
      score += 100
    } else if (entry.pinyinFull.startsWith(q) || entry.pinyinInitials.startsWith(q)) {
      matches.push({ fieldKey: 'name', label: '姓名（拼音）', snippet: name, start: 0, length: 0 })
      score += 90
    } else if (entry.pinyinFull.includes(q)) {
      matches.push({ fieldKey: 'name', label: '姓名（拼音）', snippet: name, start: 0, length: 0 })
      score += 60
    }
    for (const hs of entry.haystacks) {
      if (hs.fieldKey === 'name') continue
      const lower = hs.lower
      let at = lower.indexOf(q)
      if (at < 0 && qDigits.length >= 3 && hs.fieldKey === 'phones') at = hs.text.indexOf(qDigits)
      if (at >= 0) {
        const s = snippetAround(hs.text, at, q.length)
        matches.push({ fieldKey: hs.fieldKey, label: hs.label, snippet: s.snippet, start: s.start, length: q.length })
        score += hs.fieldKey === 'company' ? 40 : 20
      }
      if (matches.length >= 4) break
    }
    if (matches.length === 0) continue
    hits.push({ personId: person.id, name, matches: matches.slice(0, 4), score })
  }
  return hits.sort((a, b) => b.score - a.score)
}

/** 速记关联建议：姓名模糊 + 最近查看 */
export function suggestPersons(text: string, persons: Person[], recentIds: string[], limit = 4): Person[] {
  const q = text.trim()
  const recent = recentIds.map((id) => persons.find((p) => p.id === id)).filter(Boolean) as Person[]
  if (!q) return recent.slice(0, limit)
  const ql = q.toLowerCase()
  const qDigits = digitOnly(q)
  const scored = persons
    .map((p) => {
      const name = personName(p)
      const py = pinyinOf(name)
      let score = 0
      if (q.includes(name)) score += 100
      else if (name.includes(q)) score += 60
      else if (py.full && ql.includes(py.full)) score += 80
      else if (py.initials.length > 1 && ql.includes(py.initials)) score += 40
      const phones = (p.fields.phones as { number: string }[]) ?? []
      if (qDigits.length >= 4 && phones.some((x) => digitOnly(x.number).includes(qDigits))) score += 70
      const company = String(p.fields.company ?? '')
      if (company && ql.includes(company.toLowerCase())) score += 30
      if (recentIds.includes(p.id)) score += 5
      return { p, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  if (scored.length > 0) return scored.slice(0, limit).map((x) => x.p)
  return recent.slice(0, limit)
}

export function buildTimelineSearchText(events: TimelineEvent[]): string {
  return events.map((e) => e.content).join('\n')
}

export function fieldSuggestions(def: FieldDefinition, ctx: DeriveCtx): string[] {
  if (def.key === 'tags') return ctx.tags.map((t) => t.name)
  if (def.key === 'groups') return ctx.groups.map((g) => g.name)
  return []
}
