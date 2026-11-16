export const uid = (prefix = 'id'): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const nowISO = (): string => new Date().toISOString()

export const DAY = 86400000

export const startOfDay = (d: Date): Date => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export const dayDiff = (a: string | Date, b: string | Date = new Date()): number => {
  const da = typeof a === 'string' ? new Date(a) : a
  const db = typeof b === 'string' ? new Date(b) : b
  return Math.floor((startOfDay(db).getTime() - startOfDay(da).getTime()) / DAY)
}

export const addDays = (d: Date, n: number): Date => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export const pad = (n: number): string => String(n).padStart(2, '0')

export function formatDate(
  input: string | Date | undefined | null,
  fmt = 'YYYY-MM-DD',
  withTime = false,
): string {
  if (!input) return ''
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return ''
  const Y = d.getFullYear()
  const M = d.getMonth() + 1
  const D = d.getDate()
  const hh = d.getHours()
  const mm = d.getMinutes()
  const suffix = withTime ? ` ${pad(hh)}:${pad(mm)}` : ''
  switch (fmt) {
    case 'YYYY年M月D日':
      return `${Y}年${M}月${D}日${suffix}`
    case 'MM/DD/YYYY':
      return `${pad(M)}/${pad(D)}/${Y}${suffix}`
    case 'DD/MM/YYYY':
      return `${pad(D)}/${pad(M)}/${Y}${suffix}`
    default:
      return `${Y}-${pad(M)}-${pad(D)}${suffix}`
  }
}

/** 纪念日日期（可能是 MM-DD 或完整日期） */
export function formatAnniversary(date: string): string {
  if (!date) return ''
  if (date.length === 5 && date[2] === '-') return `${Number(date.slice(0, 2))} 月 ${Number(date.slice(3))} 日`
  return formatDate(date)
}

export function formatDateTime(input?: string | null): string {
  if (!input) return '—'
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function relativeTime(input?: string | null): string {
  if (!input) return '从未互动'
  const diff = Date.now() - new Date(input).getTime()
  const days = Math.floor(diff / DAY)
  if (days <= 0) {
    const hours = Math.floor(diff / 3600000)
    if (hours <= 0) {
      const mins = Math.max(1, Math.floor(diff / 60000))
      return `${mins} 分钟前`
    }
    return `${hours} 小时前`
  }
  if (days === 1) return '昨天'
  if (days < 30) return `${days} 天前`
  if (days < 365) return `${Math.floor(days / 30)} 个月前`
  return `${Math.floor(days / 365)} 年前`
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export function debounce<T extends (...args: never[]) => void>(fn: T, wait: number) {
  let t: ReturnType<typeof setTimeout> | null = null
  const wrapped = (...args: Parameters<T>) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), wait)
  }
  wrapped.cancel = () => {
    if (t) clearTimeout(t)
  }
  return wrapped
}

export const fmtFileStamp = (d = new Date()): string =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`

export function bytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export const pct = (n: number, total: number): number => (total <= 0 ? 0 : Math.round((n / total) * 100))

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

export function sanitizeUrl(url: string): string | null {
  const trimmed = (url || '').trim()
  if (!trimmed) return null
  let candidate = trimmed
  if (/^\/\//.test(candidate)) candidate = `https:${candidate}`
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) candidate = `https://${candidate}`
  try {
    const u = new URL(candidate)
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol)) return null
    return u.toString()
  } catch {
    return null
  }
}

export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export const initials = (name: string): string => {
  const n = (name || '').trim()
  if (!n) return '?'
  if (/[\u4e00-\u9fa5]/.test(n)) return n.slice(-2)
  return n
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')
}

export function maskPhone(num: string): string {
  const digits = (num || '').replace(/\s|-/g, '')
  if (digits.length >= 7) return `${digits.slice(0, 3)}****${digits.slice(-4)}`
  return num
}

export function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

export function groupBy<T>(arr: T[], key: (x: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const item of arr) {
    const k = key(item)
    ;(out[k] ||= []).push(item)
  }
  return out
}

export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))

/* ---------------------------------------------------------------------------
   日期校验：格式之外还要看日历是否成立（2 月 30 日、13 月、10 月 40 日都要拦住）
   返回 null 表示没问题，返回字符串则是给用户看的错误文案
--------------------------------------------------------------------------- */
export function dateIssue(input: string | null | undefined): string | null {
  const s = (input ?? '').trim()
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return '格式不对，请输入规范日期（年-月-日）'
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (y < 1900 || y > 2200) return '年份超出范围，请输入 1900–2200 之间的规范日期'
  if (mo < 1 || mo > 12) return '月份不存在，请输入规范日期（1–12 月）'
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]
  if (d < 1 || d > days) return `${mo} 月只有 ${days} 天，请输入规范日期`
  return null
}

/** 把「2024-2-3」这类不规范写法补成 2024-02-03；非法输入原样返回交给校验 */
export function normalizeDate(input: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec((input ?? '').trim())
  if (!m) return (input ?? '').trim()
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}
