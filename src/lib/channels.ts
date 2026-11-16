/**
 * 联系方式的下级通道工具。
 * 数据仍存在 person.fields.phones（{ label, number }[]）里，label 存通道 id；
 * 旧数据里 label 是「手机 / 工作 / 家庭 / 其他」这类中文，读取时归一化一次。
 */
import type { ContactChannel } from '../types'
import { DEFAULT_CONTACT_CHANNELS } from '../defaults'

const LEGACY: Record<string, string> = {
  手机: 'mobile',
  移动电话: 'mobile',
  工作: 'landline',
  公司: 'landline',
  家庭: 'landline',
  固定电话: 'landline',
  座机: 'landline',
  微信: 'wechat',
  其他: 'other',
}

/** 旧中文 label → 通道 id；已经是 id 的原样返回 */
export function channelId(label: string | undefined | null, channels: ContactChannel[]): string {
  const raw = (label ?? '').trim()
  if (!raw) return channels[0]?.id ?? 'mobile'
  if (channels.some((c) => c.id === raw)) return raw
  const mapped = LEGACY[raw]
  if (mapped && channels.some((c) => c.id === mapped)) return mapped
  const byLabel = channels.find((c) => c.label === raw)
  return byLabel?.id ?? raw
}

export function channelOf(id: string, channels: ContactChannel[]): ContactChannel | undefined {
  return channels.find((c) => c.id === id)
}

/** 通道显示名：找不到定义时退回原 label，保证旧数据仍可读 */
export function channelLabel(id: string, channels: ContactChannel[]): string {
  const ch = channelOf(id, channels)
  if (ch) return ch.label
  const legacy = Object.keys(LEGACY).find((k) => LEGACY[k] === id)
  return legacy ?? id
}

export function isTelChannel(id: string, channels: ContactChannel[]): boolean {
  return (channelOf(id, channels)?.kind ?? 'im') === 'tel'
}

/** settings 里没有通道时退回默认，避免老数据包打开后联系方式空白 */
export function normalizeChannels(list: ContactChannel[] | undefined | null): ContactChannel[] {
  if (!Array.isArray(list) || list.length === 0) return DEFAULT_CONTACT_CHANNELS.map((c) => ({ ...c }))
  return list.map((c, i) => ({
    id: c?.id || `ch_${i}`,
    label: c?.label || '未命名',
    kind: c?.kind === 'tel' ? 'tel' : 'im',
    visible: c?.visible !== false,
    hint: c?.hint,
    isBuiltIn: !!c?.isBuiltIn,
  }))
}
