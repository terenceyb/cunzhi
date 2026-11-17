import type { EmailValue, FieldDefinition, Group, Person, Tag } from '../types'

/**
 * 名片码内容：一个可直接打开的静态网页地址，数据放在 URL hash 里。
 *
 *   {站点}/card.html#d=<base64url(JSON)>
 *
 * - 扫码后由浏览器打开 card.html，渲染成「列表视图」的名片卡片；
 * - 卡片信息只放在 # 之后的片段里 —— 片段不会随 HTTP 请求发给服务器，
 *   所以「数据不上传服务器」的产品承诺依然成立，纯静态、离线可渲染；
 * - 只收录基本身份与联系方式，不含引荐人、关联人、关系备忘、标签、群组、
 *   互动记录等关系类/隐私类信息；
 * - 内容由本人资料就地生成：person 一变，二维码内容随之变化，自动更新。
 */

/** 名片卡片上展示的「基本信息」（白名单，未列字段一律不进二维码） */
export interface CardInfo {
  n: string // 姓名 name
  c?: string // 单位 company
  t?: string // 职务 title
  y?: string // 城市 city
  p?: { l: string; v: string }[] // 联系方式 phones（label=通道, value=号码）
  e?: string[] // 邮箱 emails
  w?: string // 个人主页 website
}

export interface CardCodeCtx {
  fieldDefinitions?: FieldDefinition[]
  groups?: Group[]
  tags?: Tag[]
}

const txt = (v: unknown): string => String(v ?? '').trim()

/** UTF-8 安全的 base64url 编码（中文不乱码、URL 里无需转义） */
function encodeUtf8(obj: CardInfo): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj))
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 静态卡片页的绝对地址：跟随当前部署路径（含 /cunzhi/ 子路径），本地预览同样可用 */
export function cardPageUrl(): string {
  if (typeof window === 'undefined') return 'card.html'
  return new URL('card.html', window.location.href).href
}

/**
 * 从 person 里挑出允许公开的基本信息。
 * 白名单之外（引荐人、关联人、群组、标签、备注、生日、互动……）一概不读。
 */
export function buildCardInfo(person: Person | undefined, ctx: CardCodeCtx = {}): CardInfo | null {
  if (!person) return null
  const f = person.fields
  const defs = ctx.fieldDefinitions ?? []
  const info: CardInfo = { n: txt(f.name) || '未命名' }

  const company = txt(f.company)
  if (company) info.c = company

  const city = txt(f.city)
  if (city) info.y = city

  /* 职务不是内置字段：从文本类自定义字段里按名字找，找不到就略过 */
  const titleDef = defs.find((d) => d.type === 'text' && /职务|职位|头衔/.test(d.label))
  const title = titleDef ? txt(f[titleDef.key]) : ''
  if (title) info.t = title

  /* 联系方式：只取有值的通道，保留通道名（手机 / 微信 / 邮箱…）与号码 */
  const contacts = ((f.phones as { label: string; number: string }[] | undefined) ?? [])
    .map((p) => ({ l: txt(p.label) || '电话', v: txt(p.number) }))
    .filter((p) => p.v)
  if (contacts.length) info.p = contacts

  /* 邮箱：内置没有独立邮箱字段，从所有 email 类型字段里收集 */
  const emails: string[] = []
  defs
    .filter((d) => d.type === 'email')
    .forEach((d) => {
      const raw = f[d.key] as EmailValue[] | EmailValue | undefined
      const arr = Array.isArray(raw) ? raw : raw ? [raw] : []
      arr.forEach((e) => {
        const address = txt(e?.address)
        if (address && !emails.includes(address)) emails.push(address)
      })
    })
  if (emails.length) info.e = emails

  /* 个人主页：内置自定义 link 字段（custom_web），有值才带 */
  const web = f.custom_web as { url?: string } | undefined
  if (web?.url) info.w = txt(web.url)

  return info
}

/** 二维码内容：静态卡片页 URL + 编码后的基本信息 */
export function buildCardCode(person: Person | undefined, ctx: CardCodeCtx = {}): string {
  const info = buildCardInfo(person, ctx)
  if (!info) return ''
  return `${cardPageUrl()}#d=${encodeUtf8(info)}`
}

/** 二维码下方那行摘要：让人一眼看出码里有什么（只含基本信息） */
export function cardCodeSummary(person: Person | undefined, ctx: CardCodeCtx = {}): string {
  const info = buildCardInfo(person, ctx)
  if (!info) return ''
  const bits = [info.c, info.t, info.y, info.p?.[0]?.v].filter(Boolean)
  return bits.join(' · ')
}

/** 解码（卡片页 / 预览用）：从 URL 的 #d= 还原名片信息 */
export function decodeCardInfo(hash: string): CardInfo | null {
  const m = /(?:^#|[#&])d=([^&]+)/.exec(hash.startsWith('#') ? hash : `#${hash}`)
  if (!m) return null
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return JSON.parse(new TextDecoder().decode(bytes)) as CardInfo
  } catch {
    return null
  }
}

/** 只读预览用：把名片信息拆成「标签：值」行 */
export function cardCodeLines(text: string): string[] {
  const hash = text.includes('#') ? text.slice(text.indexOf('#')) : text
  const info = decodeCardInfo(hash)
  if (!info) return []
  const lines = [`姓名：${info.n}`]
  if (info.c) lines.push(`单位：${info.c}`)
  if (info.t) lines.push(`职务：${info.t}`)
  if (info.y) lines.push(`城市：${info.y}`)
  info.p?.forEach((p) => lines.push(`${p.l}：${p.v}`))
  info.e?.forEach((e) => lines.push(`邮箱：${e}`))
  if (info.w) lines.push(`主页：${info.w}`)
  return lines
}
