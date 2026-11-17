import React, { useEffect, useState } from 'react'
import { ChevronRight, Phone } from 'lucide-react'
import type { DeriveCtx, PersonMeta } from '../lib/derive'
import { buildPersonMeta } from '../lib/derive'
import { useUI } from '../ui'
import { relativeTime } from '../lib/utils'
import { Avatar } from './ui'
import type { Person } from '../types'

/** 在 PersonMeta 上补一个「距上次互动天数」，卡堆头部鼓轮要用 */
export type WalletMeta = PersonMeta & { daysSinceLast: number }

function buildMeta(p: Person, ctx: DeriveCtx): WalletMeta {
  const meta = buildPersonMeta(p, ctx)
  const days = meta.lastInteractionAt
    ? Math.max(0, Math.round((Date.now() - new Date(meta.lastInteractionAt).getTime()) / 86400000))
    : 0
  return { ...meta, daysSinceLast: days }
}

/* ---------------------------------------------------------------------------
   Wallet Card Stack（transitions.dev Community）
   参数沿用：--w2-dur 400ms / --w2-ease、peek 63px、press 0.99、
   sheen 600ms、reel 327ms + 19ms stagger。
   露出的部分是每张卡的上半截（信息区），所以名字与单位职务都放在卡片最上面，
   露出的高度 = 上内边距 12 + 姓名 20 + 间距 3 + 单位职务 16 + 12 —— 与「姓名到卡上沿」等距。
--------------------------------------------------------------------------- */

function cardColors(color: string) {
  return {
    ['--w2-tint' as string]: color,
    background: `radial-gradient(90% 120% at 100% 0%, ${color}59, transparent 62%), radial-gradient(80% 100% at 0% 100%, ${color}2e, transparent 60%), linear-gradient(140deg, #23262f 0%, #16181f 55%, #0b0c10 100%)`,
  } as React.CSSProperties
}

const PATTERNS = [
  'repeating-radial-gradient(circle at 120% 140%, rgba(255,255,255,.07) 0 1px, transparent 1px 11px)',
  'repeating-radial-gradient(200% 100% at -10% 130%, rgba(255,255,255,.07) 0 1px, transparent 1px 9px)',
  'repeating-conic-gradient(from 0deg at 110% -10%, rgba(255,255,255,.06) 0 1deg, transparent 1deg 6deg)',
]

function primaryPhone(meta: PersonMeta): string {
  const arr = (meta.person.fields.phones as { number: string }[]) ?? []
  return arr.find((x) => x.number?.trim())?.number ?? ''
}

/** 电话原样展示，不再打码 */
function prettyPhone(phone: string): string {
  const d = phone.replace(/\s+/g, '')
  if (/^1\d{10}$/.test(d)) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`
  return phone
}

/** 职务：默认字段 custom_role（文本） */
function jobTitle(person: Person): string {
  const v = person.fields.custom_role
  return typeof v === 'string' ? v.trim() : ''
}

/** 卡面本身：视觉 + 悬停流光 + 按下缩放 */
export function WalletCardFace({
  meta,
  index,
  front,
  onActivate,
  footer,
  children,
}: {
  meta: WalletMeta
  index: number
  front?: boolean
  onActivate: () => void
  /** 置顶卡专属：贴在卡片底部的一条「打开完整名片」，视觉上属于这张卡 */
  footer?: React.ReactNode
  children?: React.ReactNode
}) {
  const phone = primaryPhone(meta)
  const title = jobTitle(meta.person)
  const org = String(meta.person.fields.company ?? '').trim()
  const city = String(meta.person.fields.city ?? '').trim()
  const tags = meta.tags.slice(0, 3)
  return (
    <div
      className="w2-card"
      role="button"
      tabIndex={0}
      style={{ ...cardColors(meta.groupColor), ['--w2-pattern' as string]: PATTERNS[index % PATTERNS.length] }}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onActivate()
        }
      }}
      aria-label={`${meta.name} 的名片${front ? '，点开看详情' : '，点击置顶'}`}
      data-front={front ? 'true' : 'false'}
    >
      <div className="w2-top">
        <Avatar
          name={meta.name}
          src={meta.avatar?.thumbnail || meta.avatar?.data}
          size={42}
          color={meta.groupColor}
          className="w2-avatar"
        />
        <div className="w2-id">
          <div className="w2-name-line">
            <span className="w2-name ellipsis">{meta.name}</span>
          </div>
          {/* 单位 · 职务 | 城市：叠放时露出来的就是这一行，下一张卡正好压在它下方 */}
          <div className="w2-sub">
            <span className="w2-org ellipsis">{org || '未填写单位'}</span>
            {title && (
              <>
                <span className="w2-dot" aria-hidden>
                  ·
                </span>
                <span className="w2-job ellipsis">{title}</span>
              </>
            )}
            {city && (
              <>
                <span className="w2-sep" aria-hidden>
                  |
                </span>
                <span className="w2-city ellipsis">{city}</span>
              </>
            )}
          </div>
        </div>
        {/* 右上角：分组右对齐，分组正下方是电话号码 */}
        <div className="w2-side">
          <span className="w2-type">{meta.group?.name ?? '未分组'}</span>
          <span className={phone ? 'w2-sidephone' : 'w2-sidephone is-empty'}>
            {phone ? (
              <>
                <Phone size={10} className="w2-tel" />
                <span className="ellipsis">{prettyPhone(phone)}</span>
              </>
            ) : (
              '未填写电话'
            )}
          </span>
        </div>
      </div>

      {children}

      {/* 原电话位：现在放标签 */}
      <div className="w2-cardfoot">
        <div className="w2-tags">
          {tags.length > 0 ? (
            tags.map((t) => (
              <span className="w2-tag" key={t.id}>
                {t.name}
              </span>
            ))
          ) : (
            <span className="w2-tag w2-tag--empty">暂无标签</span>
          )}
        </div>
        <span className="w2-brand">{relativeTime(meta.lastInteractionAt)}</span>
      </div>

      {footer}
    </div>
  )
}

/* ---------------- 卡堆：顶部固定卡整块吸顶，下面是滚动的叠放卡 ---------------- */
export function WalletStackView({ rows, ctx }: { rows: Person[]; ctx: DeriveCtx }) {
  const openPerson = useUI((s) => s.openPerson)
  const [order, setOrder] = useState<number[]>(() => rows.map((_, i) => i))

  const sig = rows.map((p) => p.id).join(',')
  useEffect(() => {
    setOrder(rows.map((_, i) => i))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  /* 切换筛选时 order 会短暂指向已不存在的下标，过滤掉再渲染，避免白屏 */
  const safe = order.filter((i) => i < rows.length)
  const seq = safe.length ? safe : rows.map((_, i) => i)

  const front = seq[0]
  const frontPerson = front === undefined ? undefined : rows[front]
  const frontMeta = frontPerson ? buildMeta(frontPerson, ctx) : null

  /** 顶部固定的那张：默认最先一位，点下面的卡就换人 */
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const found = pinnedId ? seq.find((i) => rows[i]?.id === pinnedId) : undefined
  const pinned = found ?? front
  const pinnedPerson = pinned === undefined ? undefined : rows[pinned]
  const pinnedMeta = pinnedPerson ? buildMeta(pinnedPerson, ctx) : null
  const rest = seq.filter((i) => i !== pinned)

  const pinTo = (idx: number) => {
    if (idx === pinned) return
    setPinnedId(rows[idx]?.id ?? null)
    // 点到的那张沉到卡堆最前面，其余保持相对顺序
    setOrder((prev) => [idx, ...prev.filter((x) => x !== idx)])
  }

  if (!frontPerson || !frontMeta || !pinnedPerson || !pinnedMeta) return null

  return (
    <div className="w2-wallet w2-wallet--stack">
      {/* 固定卡整块吸顶：实底层与页面同色，滑上来的卡片藏到它后面；
          底沿那道「进卡口」让卡片像被吞进卡机一样消失 */}
      <div className="w2-sticky">
        {/* 与固定区同高的实底层：和固定区融成一层，滚动卡片永远在它下面，交界处不会有阴影 */}
        <div className="w2-shade" aria-hidden />
        <div className="w2-pin">
          <div className="w2-pin-inner" key={pinnedPerson.id} style={{ ['--w2-tint' as string]: pinnedMeta.groupColor }}>
            <WalletCardFace
              meta={pinnedMeta}
              index={pinned}
              front
              /* 固定卡点一下直接进详情弹窗，不再原地展开 */
              onActivate={() => openPerson(pinnedPerson.id)}
              footer={
                <button
                  type="button"
                  className="w2-edge"
                  onClick={(e) => {
                    e.stopPropagation()
                    openPerson(pinnedPerson.id)
                  }}
                >
                  <span className="w2-edge-lead">完整名片</span>
                  <span className="w2-edge-dot" aria-hidden />
                  <span className="w2-edge-meta">上次互动 {relativeTime(pinnedMeta.lastInteractionAt)}</span>
                  <ChevronRight size={13} className="w2-edge-caret" />
                </button>
              }
            />
          </div>
        </div>

        {/* 进卡口：固定卡下沿的一道卡槽。堆叠卡滑到这里被“吞”进去，
            左右两瓣小唇片是卡机开口的边沿，让「滑走」有明确的终点 */}
        <div className="w2-slotmouth" aria-hidden />
      </div>

      {rest.length > 0 && (
        <div className="w2-deck" style={{ ['--n' as string]: rest.length }}>
          {rest.map((idx, pos) => {
            const p = rows[idx]
            const meta = buildMeta(p, ctx)
            return (
              <div
                key={p.id}
                className="w2-slot"
                style={{
                  ['--p' as string]: pos,
                  zIndex: 10 + pos,
                }}
              >
                <WalletCardFace meta={meta} index={idx} onActivate={() => pinTo(idx)} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
