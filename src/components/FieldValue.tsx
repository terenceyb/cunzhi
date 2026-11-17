import React, { useState } from 'react'
import {
  ArrowUpRight,
  Check,
  Copy,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  QrCode,
  UserRound,
} from 'lucide-react'
import type {
  AddressValue,
  AttachmentMeta,
  BarcodeValue,
  DateValue,
  EmailValue,
  FieldDefinition,
  LinkValue,
  PersonRef,
  PhoneValue,
  SelectOption,
} from '../types'
import { useStore } from '../store'
import { useUI } from '../ui'
import { cn, formatDate, hostOf, sanitizeUrl, dayDiff } from '../lib/utils'
import { ageOf, daysToBirthday, defByKey, isRefSnapshot, personName } from '../lib/derive'
import { channelId, channelLabel, channelOf, normalizeChannels } from '../lib/channels'
import { Avatar, CopyButton } from './ui'
import { QrImage } from './QrImage'

/* 名片码里常见的写法是「www.xxx.com」或「xxx.com」，缺协议头点开只会 404，
   这里统一补全；不像网址的内容（纯号码、MECARD 等）原样交给二维码。 */
function withProtocol(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v
  if (/^[\w-]+(\.[\w-]+)+(\/|$|\?)/.test(v) && !/\s/.test(v)) return `https://${v}`
  return null
}

const money = (n: number, decimals: number): string => {
  const [int, dec] = n.toFixed(decimals).split('.')
  return dec ? `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}` : int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function FieldValue({
  def,
  value,
  personId,
  compact,
  maskPhone,
  onOpenPerson,
}: {
  def: FieldDefinition
  value: unknown
  personId?: string
  compact?: boolean
  maskPhone?: boolean
  onOpenPerson?: (id: string) => void
}) {
  const channels = useStore((s) => normalizeChannels(s.settings.contactChannels))
  const groups = useStore((s) => s.groups)
  const tags = useStore((s) => s.tags)
  const persons = useStore((s) => s.persons)
  const attachments = useStore((s) => s.attachments)
  const fieldDefinitions = useStore((s) => s.fieldDefinitions)
  const setPrefs = useStore((s) => s.setPrefs)
  const mapProvider = useStore((s) => s.prefs.mapProvider)
  const [expanded, setExpanded] = useState(false)

  const options: SelectOption[] =
    def.key === 'groups'
      ? groups.map((g) => ({ id: g.id, label: g.name, color: g.color }))
      : def.key === 'tags'
        ? tags.map((t) => ({ id: t.id, label: t.name, color: '#5B6573' }))
        : def.config.options ?? []

  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    return <span className="muted" style={{ fontSize: compact ? 12 : 13 }}>—</span>
  }

  switch (def.type) {
    case 'text':
      return <span className={compact ? 'ellipsis' : undefined}>{String(value)}</span>
    case 'longtext': {
      const text = String(value)
      return (
        <span
          className={cn('fv-text', !expanded && 'clamp')}
          onClick={() => !compact && setExpanded((v) => !v)}
          style={{ cursor: compact ? 'default' : 'pointer' }}
          title={compact ? text : undefined}
        >
          {text}
        </span>
      )
    }
    case 'number': {
      const n = Number(value)
      const base = money(n, def.config.decimals ?? 0)
      return (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {base}
          {def.config.unit === 'percent' ? '%' : def.config.unit === 'custom' ? def.config.unitText : ''}
        </span>
      )
    }
    case 'checkbox':
      return value ? (
        <span className="row" style={{ gap: 5, color: 'var(--ok)' }}>
          <Check size={14} /> 是
        </span>
      ) : (
        <span className="muted">否</span>
      )
    case 'select': {
      const opt = options.find((o) => o.id === value)
      if (!opt) {
        return (
          <span className="chip chip-opt dashed" title="该选项已被删除，请重新选择">
            失效选项
          </span>
        )
      }
      return (
        <span className="chip chip-opt" style={{ background: `${opt.color}18`, color: opt.color }}>
          <span className="dot" style={{ background: opt.color }} />
          {opt.label}
        </span>
      )
    }
    case 'multiselect': {
      const arr = (Array.isArray(value) ? value : [value]) as string[]
      const shown = compact ? arr.slice(0, 3) : arr
      return (
        <span className="chip-row" style={{ gap: 6 }}>
          {shown.map((id) => {
            const opt = options.find((o) => o.id === id)
            if (!opt) {
              return (
                <span key={id} className="chip chip-opt dashed" title="该选项已被删除">
                  失效选项
                </span>
              )
            }
            return (
              <span key={id} className="chip chip-opt" style={{ background: `${opt.color}16`, color: opt.color }}>
                {opt.label}
              </span>
            )
          })}
          {compact && arr.length > 3 && <span className="chip chip-opt">+{arr.length - 3}</span>}
        </span>
      )
    }
    case 'date': {
      const dv = value as DateValue
      if (!dv?.value) return <span className="muted">—</span>
      const text = formatDate(dv.value, def.config.dateFormat ?? 'YYYY-MM-DD', Boolean(dv.hasTime))
      const isBirthday = def.key === 'birthday'
      const person = personId ? persons.find((p) => p.id === personId) : undefined
      const age = isBirthday && person ? ageOf(person, fieldDefinitions) : null
      const left = isBirthday ? daysToBirthday(dv.value) : null
      return (
        <span className="row" style={{ gap: 7, flexWrap: 'wrap' }}>
          <span>{text}</span>
          {!compact && isBirthday && (
            <span className="field-hint">
              {age !== null ? `${age} 岁` : ''}
              {left !== null ? ` · ${left === 0 ? '今天生日' : `距生日 ${left} 天`}` : ''}
            </span>
          )}
        </span>
      )
    }
    case 'link': {
      const lv = value as LinkValue
      const href = sanitizeUrl(lv.url)
      if (!href) return <span className="muted">无效链接</span>
      const host = hostOf(href)
      const color = ['#2F6FEB', '#0F9D8F', '#B4530A', '#7C4DFF', '#C2185B'][host.length % 5]
      if (compact) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {lv.displayText || host}
          </a>
        )
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 9,
            padding: '7px 10px',
            border: '1px solid var(--line)',
            borderRadius: 10,
            maxWidth: '100%',
            background: 'var(--surface-2)',
            color: 'var(--text)',
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: color,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              flex: '0 0 auto',
            }}
          >
            {host[0]?.toUpperCase()}
          </span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 500 }} className="ellipsis">
              {lv.displayText || host}
            </span>
            <span className="ellipsis" style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)' }}>
              {host}
            </span>
          </span>
          <ArrowUpRight size={13} className="muted" />
        </a>
      )
    }
    case 'phone': {
      const arr = (value as PhoneValue[]) ?? []
      return (
        <span className="stack" style={{ gap: 5 }}>
          {arr.map((p, i) => {
            const cid = channelId(p.label, channels)
            const ch = channelOf(cid, channels)
            const tel = (ch?.kind ?? 'im') === 'tel'
            const digits = (p.number || '').replace(/[\s-]/g, '')
            const masked = maskPhone ? `${digits.slice(0, 3)}****${digits.slice(-4)}` : p.number
            return (
              <span key={i} className="fv-line">
                {!compact && <span className="fv-line-label">{ch?.label ?? channelLabel(cid, channels)}</span>}
                {compact || maskPhone || !tel ? (
                  <span className={cn('fv-line-value', tel && 'mono')}>{masked}</span>
                ) : (
                  <a href={`tel:${digits}`} className="mono fv-line-value" style={{ color: 'var(--text)' }}>
                    {p.number}
                  </a>
                )}
                {!compact && (
                  <span className="fv-line-ops" data-no-edit>
                    {tel && (
                      <>
                        <a className="btn icon sm" href={`tel:${digits}`} aria-label="拨号">
                          <Phone size={13} />
                        </a>
                        <a className="btn icon sm" href={`sms:${digits}`} aria-label="发短信">
                          <MessageSquare size={13} />
                        </a>
                      </>
                    )}
                    <CopyButton text={p.number} label={tel ? '复制号码' : `复制${ch?.label ?? ''}`} />
                  </span>
                )}
              </span>
            )
          })}
        </span>
      )
    }
    case 'email': {
      const arr = (value as EmailValue[]) ?? []
      return (
        <span className="stack" style={{ gap: 5 }}>
          {arr.map((e, i) => (
            <span key={i} className="fv-line">
              {!compact && <span className="fv-line-label">{e.label}</span>}
              <a href={`mailto:${e.address}`} className="fv-line-value">
                {e.address}
              </a>
              {!compact && (
                <span className="fv-line-ops">
                  <CopyButton text={e.address} label="复制邮箱" />
                </span>
              )}
            </span>
          ))}
        </span>
      )
    }
    case 'address': {
      const arr = (value as AddressValue[]) ?? []
      return (
        <span className="stack" style={{ gap: 6 }}>
          {arr.map((a, i) => {
            const text = [a.province, a.city, a.district, a.detail].filter(Boolean).join(' ')
            const mapUrl =
              mapProvider === 'google'
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`
                : mapProvider === 'baidu'
                  ? `https://map.baidu.com/search/${encodeURIComponent(text)}`
                  : `https://uri.amap.com/search?keyword=${encodeURIComponent(text)}`
            return (
              <span key={i} className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
                <MapPin size={14} className="muted" style={{ marginTop: 3, flex: '0 0 auto' }} />
                <span className="grow" style={{ minWidth: 0 }}>
                  {text}
                  {!compact && (
                    <span className="row" style={{ gap: 4, marginTop: 2 }}>
                      <CopyButton variant="text" text={text} label="复制地址" className="copy-text">
                        复制地址
                      </CopyButton>
                      <span className="muted" style={{ fontSize: 11 }}>
                        ·
                      </span>
                      <a href={mapUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5 }}>
                        在地图中打开
                      </a>
                    </span>
                  )}
                </span>
              </span>
            )
          })}
        </span>
      )
    }
    case 'barcode': {
      const bv = value as BarcodeValue
      if (!bv?.rawValue) return <span className="muted">—</span>
      /* 名片码要的是「能扫的码」，不是一串链接文本：把原始值编码成真二维码，
         内容是网址时直接点码就能打开（补全缺少的协议头，避免点了没反应）。 */
      const raw = String(bv.rawValue).trim()
      const href = withProtocol(raw)
      return (
        <span className="barcode-view">
          <a
            className={cn('barcode-qr', href ? 'is-link' : undefined)}
            href={href ?? undefined}
            target={href ? '_blank' : undefined}
            rel={href ? 'noopener noreferrer' : undefined}
            onClick={(e) => !href && e.preventDefault()}
            title={href ? '扫码或在浏览器打开' : '扫码可读取这条内容'}
            aria-label={href ? '打开名片码链接' : '名片码'}
          >
            <QrImage value={raw} size={compact ? 52 : 68} title={`名片码：${raw}`} />
          </a>
          <span className="barcode-main">
            <span className="barcode-raw mono ellipsis">{raw}</span>
            <span className="barcode-meta">
              <span className="chip sm">{bv.format || '二维码'}</span>
              {href && (
                <a className="barcode-open" href={href} target="_blank" rel="noopener noreferrer">
                  <ArrowUpRight size={11} /> 打开
                </a>
              )}
              {!compact && (
                <CopyButton variant="text" text={raw} label="复制名片码内容" className="copy-text">
                  复制
                </CopyButton>
              )}
            </span>
          </span>
        </span>
      )
    }
    case 'personRef': {
      const arr = (Array.isArray(value) ? value : [value]) as PersonRef[]
      return (
        <span className="chip-row">
          {arr.map((r, i) => {
            const id = isRefSnapshot(r) ? r.refId : r
            const person = persons.find((p) => p.id === id)
            const name = person ? personName(person) : isRefSnapshot(r) ? r.snapshotName : '已删除联系人'
            const color = groups.find((g) => g.id === person?.fields.groups)?.color
            return (
              <button
                key={`${id}-${i}`}
                className="chip chip-opt avatar-chip"
                style={{ opacity: person ? 1 : 0.6 }}
                onClick={() => person && onOpenPerson?.(person.id)}
                title={person ? `查看 ${name}` : '该联系人已删除，保留姓名快照'}
              >
                {person ? <Avatar name={name} size={17} color={color} /> : <UserRound size={13} className="muted" />}
                {name}
              </button>
            )
          })}
        </span>
      )
    }
    case 'attachment': {
      const metas = (value as AttachmentMeta[]) ?? []
      return (
        <span className="chip-row">
          {metas.map((m) => {
            const data = attachments[m.id]
            const isImg = m.mime.startsWith('image/')
            return (
              <a
                key={m.id}
                href={data?.data || undefined}
                download={m.name}
                target="_blank"
                rel="noopener noreferrer"
                className="chip"
                style={{ paddingLeft: 3, gap: 5, maxWidth: 200 }}
              >
                {isImg && data?.thumbnail ? (
                  <img src={data.thumbnail} alt="" style={{ width: 20, height: 20, borderRadius: 5, objectFit: 'cover' }} />
                ) : (
                  <QrCode size={13} className="muted" />
                )}
                <span className="ellipsis">{m.name}</span>
              </a>
            )
          })}
        </span>
      )
    }
    default:
      return <span className="muted">—</span>
  }
}

export function ProgressRing({ value, size = 34 }: { value: number; size?: number }) {
  const r = (size - 4) / 2
  const c = 2 * Math.PI * r
  const color = value >= 80 ? 'var(--ok)' : value >= 50 ? 'var(--warn)' : 'var(--danger)'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`完整度 ${value}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={3} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="52%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={size * 0.26}
        fill="var(--text-2)"
        fontWeight={600}
      >
        {value}
      </text>
    </svg>
  )
}

export function mailto(address: string): string {
  return `mailto:${address}`
}

export function daysUntil(dateStr: string): number {
  return dayDiff(new Date(), dateStr)
}

export function valueOfBirthday(p: { fields: Record<string, unknown> }): string {
  const b = p.fields.birthday as DateValue | undefined
  return b?.value ?? ''
}

export function birthdayDef(defs: FieldDefinition[]): FieldDefinition | undefined {
  return defByKey(defs, 'birthday')
}

export const MailIcon = Mail
