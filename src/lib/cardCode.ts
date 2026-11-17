import type { AddressValue, DateValue, FieldDefinition, Group, Person, Tag } from '../types'

/**
 * 名片码内容：把这位联系人的「详情信息」就地拼成 vCard 3.0 文本。
 *
 * 这里不生成任何链接、不请求任何接口 —— 二维码里装的就是这段纯文本，
 * 手机相机扫码后由系统直接识别为「新建联系人」，断网也能读。
 */

const esc = (v: string): string =>
  String(v ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')

/** 折行：vCard 规定每行不超过 75 字节，中文按 UTF-8 切分，超出部分用空格续行 */
function fold(line: string): string {
  if (line.length <= 50) return line
  const out: string[] = []
  let i = 0
  while (i < line.length) {
    out.push((i === 0 ? '' : ' ') + line.slice(i, i + 50))
    i += 50
  }
  return out.join('\r\n')
}

export interface CardCodeCtx {
  fieldDefinitions?: FieldDefinition[]
  groups?: Group[]
  tags?: Tag[]
}

export function buildCardCode(person: Person | undefined, ctx: CardCodeCtx = {}): string {
  if (!person) return ''
  const f = person.fields
  const name = String(f.name ?? '').trim() || '未命名'
  const company = String(f.company ?? '').trim()
  const city = String(f.city ?? '').trim()

  /* 职务不是内置字段：从文本类自定义字段里按名字找，找不到就略过 */
  const defs = ctx.fieldDefinitions ?? []
  const titleDef = defs.find((d) => d.type === 'text' && /职务|职位|头衔/.test(d.label))
  const title = titleDef ? String(f[titleDef.key] ?? '').trim() : ''

  const phones = ((f.phones as { label: string; number: string }[]) ?? []).filter((p) => (p.number ?? '').trim())
  const addresses = ((f.addresses as AddressValue[]) ?? []).filter((a) => (a.detail ?? '').trim() || (a.city ?? '').trim())
  const birthday = (f.birthday as DateValue | undefined)?.value?.slice(0, 10) ?? ''
  const groupName = ctx.groups?.find((g) => g.id === f.groups)?.name ?? ''
  const tagNames = ((f.tags as string[]) ?? [])
    .map((id) => ctx.tags?.find((t) => t.id === id)?.name ?? '')
    .filter(Boolean)

  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0']
  /* N 的五个分量：姓;名;中间名;前缀;后缀。中文姓名整体放「姓」位即可 */
  lines.push(`N:${esc(name)};;;;`)
  lines.push(`FN:${esc(name)}`)
  if (company) lines.push(`ORG:${esc(company)}`)
  if (title) lines.push(`TITLE:${esc(title)}`)
  phones.forEach((p) => lines.push(fold(`TEL;TYPE=${esc(p.label || '手机')}:${esc(p.number.trim())}`)))
  addresses.forEach((a) => {
    const region = [a.province, a.city].filter(Boolean).join('')
    lines.push(fold(`ADR;TYPE=WORK:;;${esc(a.detail ?? '')};${esc(region)};;;`))
  })
  if (city) lines.push(`ADR;TYPE=HOME:;;;${esc(city)};;;`)
  if (birthday) lines.push(`BDAY:${birthday}`)
  const noteBits = [groupName ? `群组：${groupName}` : '', tagNames.length ? `标签：${tagNames.join('、')}` : '']
  if (noteBits.filter(Boolean).length) lines.push(fold(`NOTE:${esc(noteBits.filter(Boolean).join(' / '))}`))
  lines.push('CATEGORIES:存知')
  lines.push('END:VCARD')
  return lines.join('\r\n')
}

/** 二维码下方那行摘要：让人一眼看出码里有什么 */
export function cardCodeSummary(person: Person | undefined, ctx: CardCodeCtx = {}): string {
  if (!person) return ''
  const f = person.fields
  const bits: string[] = []
  if (f.company) bits.push(String(f.company))
  const phone = ((f.phones as { number: string }[]) ?? []).find((p) => (p.number ?? '').trim())
  if (phone) bits.push(phone.number)
  const group = ctx.groups?.find((g) => g.id === f.groups)?.name
  if (group) bits.push(group)
  return bits.join(' · ')
}

/** 只读预览用：把 vCard 文本按行拆开，方便折叠展示 */
export function cardCodeLines(text: string): string[] {
  return text.split('\r\n')
}

