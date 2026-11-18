import type { EmailValue, FieldDefinition, Group, Person, Tag } from '../types'

/**
 * 名片码内容：一张「完全自包含」的本地 HTML 名片，直接作为 data URI 写进二维码。
 *
 *   data:text/html;base64,<整张名片网页>
 *
 * - 网页本身和资料都在二维码里 —— 扫码后浏览器本地直接渲染，零网络请求、
 *   不上传任何数据、不依赖任何服务器或托管平台，离线也能打开；
 * - 只收录基本身份与联系方式，不含引荐人、关联人、关系备忘、标签、群组、
 *   互动记录等关系类/隐私类信息；
 * - 内容由本人资料就地生成：person 一变，二维码内容随之变化，自动更新；
 * - 所有变量值一律 HTML 转义、链接只放行白名单协议，防注入。
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

/** HTML 转义：名片值全部来自用户输入，拼进静态 HTML 前必须转义 */
const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&#39;'
    }
  })

/** UTF-8 安全的 base64（中文不乱码） */
function toB64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}

/** 紧凑但体面的内联样式：单字母类名、无外部依赖、跟随系统深浅色 */
const CARD_CSS =
  'body{margin:0;background:#f2f4f7;font:16px/1.5 system-ui,-apple-system,sans-serif;color:#16191f}' +
  '.c{max-width:420px;margin:20px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px #0001}' +
  '.h{padding:20px;background:linear-gradient(135deg,#eef3ff,#fff)}' +
  '.n{font-size:24px;font-weight:700}.r{font-size:13px;color:#888;margin-top:4px}' +
  '.d{border-top:1px solid #eee;padding:11px 20px;display:flex;gap:10px}' +
  '.d b{width:48px;color:#999;font-weight:400;font-size:13px;flex:none}' +
  '.d span{flex:1;word-break:break-all}a{color:#2f6feb;text-decoration:none}'

/** 电话：仅纯数字/+-()()生成 tel:；微信号等含字母的保留为文本 */
function telHref(raw: string): string {
  const v = txt(raw)
  if (/^(tel:)/i.test(v)) return v
  return /^[\d\s+()-]+$/.test(v) ? `tel:${v.replace(/[^\d+]/g, '')}` : ''
}

/** 把基本信息渲染成一张完整的 HTML 名片（列表视图） */
function buildCardHtml(info: CardInfo): string {
  const subBits = [info.c, info.t, info.y].map((x) => esc(txt(x))).filter(Boolean)
  const head =
    `<div class=h><div class=n>${esc(info.n)}</div>` +
    (subBits.length ? `<div class=r>${subBits.join(' · ')}</div>` : '') +
    `</div>`

  const rows: string[] = []
  const line = (label: string, shown: string, href?: string, blank?: boolean) => {
    const value = href ? `<a href="${esc(href)}"${blank ? ' target="_blank" rel="noopener"' : ''}>${shown}</a>` : shown
    rows.push(`<div class=d><b>${label}</b><span>${value}</span></div>`)
  }

  ;(info.p ?? []).forEach((p) => {
    const shown = esc(p.v)
    line(esc(p.l || '电话'), shown, telHref(p.v))
  })
  ;(info.e ?? []).forEach((e) => {
    const address = txt(e)
    const href = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? `mailto:${encodeURIComponent(address)}` : ''
    line('邮箱', esc(address), href)
  })
  if (info.w) {
    const site = txt(info.w)
    let href = ''
    if (/^https?:\/\//i.test(site)) href = site
    else if (/^[\w-]+(\.[\w-]+)+/i.test(site)) href = `https://${site}`
    line('主页', esc(site), href, true)
  }

  return (
    '<!doctype html><meta charset=utf-8><meta name=viewport content=width=device-width>' +
    `<title>名片</title><style>${CARD_CSS}</style><div class=c>${head}${rows.join('')}</div>`
  )
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

/** 二维码内容：自包含的本地 HTML 名片（data URI），个人资料就地生成 */
export function buildCardCode(person: Person | undefined, ctx: CardCodeCtx = {}): string {
  const info = buildCardInfo(person, ctx)
  if (!info) return ''
  return `data:text/html;base64,${toB64(buildCardHtml(info))}`
}

/** 二维码下方那行摘要：让人一眼看出码里有什么（只含基本信息） */
export function cardCodeSummary(person: Person | undefined, ctx: CardCodeCtx = {}): string {
  const info = buildCardInfo(person, ctx)
  if (!info) return ''
  const bits = [info.c, info.t, info.y, info.p?.[0]?.v].filter(Boolean)
  return bits.join(' · ')
}
