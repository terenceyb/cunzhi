import type {
  Anniversary,
  Person,
  ReminderItem,
  ReminderPolicy,
  SmartView,
  TimelineEvent,
  Todo,
} from '../types'
import { dayDiff } from './utils'
import { evalFilter } from './filter'
import { lastInteractionOf, personEvents } from './derive'
import type { DeriveCtx } from './derive'

export interface ReminderInput {
  persons: Person[]
  policy: ReminderPolicy
  smartViews: SmartView[]
  timelineEvents: TimelineEvent[]
  ctx: DeriveCtx
}

/** 频率优先级：个人级 > 智能视图级（多视图取最短） > 全局默认 */
export function frequencyFor(
  person: Person,
  policy: ReminderPolicy,
  smartViews: SmartView[],
  ctx: DeriveCtx,
): { days: number; sourceView?: SmartView } {
  const own = person.reminderFrequencyDays
  if (own !== undefined && own !== null) return { days: own }
  const candidates = smartViews
    .filter((v) => v.reminderEnabled && v.reminderFrequencyDays && evalFilter(v.filter, person, ctx))
    .sort((a, b) => (a.reminderFrequencyDays ?? 9999) - (b.reminderFrequencyDays ?? 9999))
  if (candidates.length > 0) {
    return { days: candidates[0].reminderFrequencyDays as number, sourceView: candidates[0] }
  }
  return { days: policy.defaultFrequencyDays }
}

export function computeReminders(input: ReminderInput, now = new Date()): ReminderItem[] {
  const { persons, policy, smartViews, timelineEvents, ctx } = input
  const items: ReminderItem[] = []
  for (const person of persons) {
    if (person.snoozeUntil && new Date(person.snoozeUntil).getTime() > now.getTime()) continue
    const { days, sourceView } = frequencyFor(person, policy, smartViews, ctx)
    if (!days || days <= 0) continue
    const last = lastInteractionOf(person.id, timelineEvents) ?? person.createdAt
    const elapsed = dayDiff(last, now)
    const overdue = elapsed - days
    if (overdue < 0) continue
    const events = personEvents(person.id, timelineEvents)
    const latestNote = events.find((e) => e.type === 'note' || e.type === 'reach_out')
    const ignored = person.ignoredReminders ?? 0
    const penalty = policy.ignoreDecayEnabled && ignored >= 2 ? 60 : 0
    items.push({
      person,
      frequencyDays: days,
      lastInteractionAt: lastInteractionOf(person.id, timelineEvents),
      overdueDays: overdue,
      sourceViewId: sourceView?.id,
      sourceViewName: sourceView?.name,
      suggestion: latestNote?.content,
      weight: overdue - penalty,
    })
  }
  return items.sort((a, b) => b.weight - a.weight || b.overdueDays - a.overdueDays)
}

/** 重叠视图提示 */
export function overlappingViews(smartViews: SmartView[], ctx: DeriveCtx): Record<string, number> {
  const enabled = smartViews.filter((v) => v.reminderEnabled)
  const out: Record<string, number> = {}
  for (const v of enabled) {
    let count = 0
    for (const p of ctx.persons) {
      if (enabled.some((o) => o.id !== v.id && evalFilter(o.filter, p, ctx)) && evalFilter(v.filter, p, ctx)) count++
    }
    out[v.id] = count
  }
  return out
}

export interface AnniversaryItem {
  anniversary: Anniversary
  person: Person
  daysLeft: number
  dateThisYear: Date
}

export function upcomingAnniversaries(
  anniversaries: Anniversary[],
  persons: Person[],
  daysAhead = 7,
  now = new Date(),
): AnniversaryItem[] {
  const out: AnniversaryItem[] = []
  for (const a of anniversaries) {
    const person = persons.find((p) => p.id === a.personId)
    if (!person) continue
    const parts = a.date.split('-').map(Number)
    const month = parts.length >= 3 ? parts[1] : parts[0]
    const day = parts.length >= 3 ? parts[2] : parts[1]
    if (!month || !day) continue
    let target = new Date(now.getFullYear(), month - 1, day)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (target.getTime() < today.getTime()) target = new Date(now.getFullYear() + 1, month - 1, day)
    const daysLeft = Math.round((target.getTime() - today.getTime()) / 86400000)
    if (daysLeft <= Math.max(daysAhead, a.advanceDays)) out.push({ anniversary: a, person, daysLeft, dateThisYear: target })
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft)
}

export interface TodoBuckets {
  today: Todo[]
  week: Todo[]
  overdue: Todo[]
}

export function bucketTodos(todos: Todo[], now = new Date()): TodoBuckets {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekEnd = new Date(today.getTime() + 7 * 86400000)
  // 回收站里的不算待办
  const open = todos.filter((t) => !t.done && !t.deletedAt)
  const parse = (s: string) => {
    const d = new Date(s)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }
  return {
    overdue: open.filter((t) => parse(t.dueDate).getTime() < today.getTime()),
    today: open.filter((t) => parse(t.dueDate).getTime() === today.getTime()),
    week: open.filter((t) => {
      const d = parse(t.dueDate).getTime()
      return d > today.getTime() && d <= weekEnd.getTime()
    }),
  }
}

export function weeklyStats(persons: Person[], timelineEvents: TimelineEvent[], todos: Todo[]) {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 6 * 86400000)
  const contacted = new Set<string>()
  for (const e of timelineEvents) {
    if (!['note', 'reach_out', 'todo_completed', 'anniversary'].includes(e.type)) continue
    if (new Date(e.occurredAt).getTime() >= weekAgo.getTime()) contacted.add(e.personId)
  }
  const finished = todos.filter((t) => t.done && t.completedAt && new Date(t.completedAt).getTime() >= weekAgo.getTime())
  const relevant = todos.filter((t) => t.done || new Date(t.dueDate).getTime() >= weekAgo.getTime())
  const rate = relevant.length === 0 ? 0 : Math.round((finished.length / relevant.length) * 100)
  return {
    total: persons.length,
    contactedThisWeek: contacted.size,
    todoRate: rate,
    completedTodos: finished.length,
  }
}
