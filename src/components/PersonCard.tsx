import React, { useEffect, useRef, useState } from 'react'
import { Copy, FlipHorizontal2, MoreHorizontal, Phone, User } from 'lucide-react'
import type { DeriveCtx, PersonMeta } from '../lib/derive'
import { displayValue, defByKey } from '../lib/derive'
import { useStore } from '../store'
import { useUI } from '../ui'
import { cn, maskPhone } from '../lib/utils'
import { attachTilt } from '../lib/motion'
import { Avatar, CopyButton, Menu, MenuSeparator, Modal } from './ui'
import { FieldValue } from './FieldValue'

export function PersonCard({
  meta,
  ctx,
  selected,
  onOpen,
  view = 'cards',
}: {
  meta: PersonMeta
  ctx: DeriveCtx
  selected?: boolean
  onOpen: () => void
  view?: 'cards' | 'grid'
}) {
  const [flipped, setFlipped] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null)
  // transitions.dev card-tilt：外层平面积负责命中，内层卡片负责形变
  const tiltRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!tiltRef.current || !cardRef.current) return
    return attachTilt(tiltRef.current, cardRef.current)
  }, [])
  const markContacted = useStore((s) => s.markContacted)
  const deletePerson = useStore((s) => s.deletePerson)
  const askConfirm = useUI((s) => s.askConfirm)
  const toast = useUI((s) => s.toast)
  const openPerson = useUI((s) => s.openPerson)
  const setPrefs = useStore((s) => s.setPrefs)

  const phones = (meta.person.fields.phones as { number: string; label: string }[]) ?? []
  const primaryPhone = phones[0]?.number ?? ''
  const tagNames = meta.tags.slice(0, 3).map((t) => t.name)

  const backDefs = ctx.fieldDefinitions
    .filter(
      (d) =>
        d.visible &&
        !d.disabled &&
        d.type !== 'timeline' &&
        d.type !== 'attachment' &&
        !['name', 'company', 'groups', 'tags', 'phones'].includes(d.key),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const backItems = backDefs
    .map((d) => ({ label: d.label, text: displayValue(d, meta.person.fields[d.key], ctx) }))
    .filter((x) => x.text)
    .slice(0, 8)

  const referrer = meta.person.fields.referrer
  let referrerName = ''
  if (typeof referrer === 'string') {
    referrerName = String(ctx.persons.find((p) => p.id === referrer)?.fields.name ?? '')
  } else if (referrer && typeof referrer === 'object' && 'snapshotName' in referrer) {
    referrerName = (referrer as { snapshotName: string }).snapshotName
  }

  const startLongPress = () => {
    longPress.current = setTimeout(() => setMenuOpen(true), 480)
  }
  const cancelLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current)
  }

  const cardStyle: React.CSSProperties = {
    background: `linear-gradient(150deg, ${meta.groupColor} 0%, ${meta.groupColor} 55%, ${meta.groupColor} 100%)`,
  }

  return (
    <>
      <div className="t-tilt" ref={tiltRef}>
        <div
          ref={cardRef}
          className={cn('wallet-card', 't-tilt-card', selected && 'selected', flipped && 'is-back')}
          style={cardStyle}
          onClick={onOpen}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenuOpen(true)
          }}
          onPointerDown={startLongPress}
          onPointerUp={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onOpen()
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={`${meta.name} 的名片`}
        >
          <div className="veil" />
          <div className="sheen" />

          {!flipped ? (
            <>
              <div className="wc-top">
                <Avatar
                  name={meta.name}
                  src={meta.avatar?.thumbnail || meta.avatar?.data}
                  size={42}
                  color={meta.groupColor}
                  className="wc-avatar"
                  fallbackClass="wc-avatar-fallback"
                />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="wc-name ellipsis">{meta.name}</div>
                  <div className="wc-company ellipsis">{String(meta.person.fields.company ?? '') || '—'}</div>
                </div>
                <div className="row" style={{ gap: 3 }} onClick={(e) => e.stopPropagation()}>
                  {backItems.length > 0 && (
                    <button
                      className="wc-icon-btn"
                      onClick={() => setFlipped(true)}
                      aria-label="查看背面信息"
                      title="查看背面信息"
                    >
                      <FlipHorizontal2 size={13} />
                    </button>
                  )}
                  <button className="wc-icon-btn" onClick={() => setMenuOpen(true)} aria-label="更多操作">
                    <MoreHorizontal size={14} />
                  </button>
                </div>
              </div>

              <div className="wc-badges">
                {meta.group && <span className="wc-badge">{meta.group.name}</span>}
                {tagNames.map((t) => (
                  <span key={t} className="wc-badge">
                    {t}
                  </span>
                ))}
                {meta.tags.length > 3 && <span className="wc-badge">+{meta.tags.length - 3}</span>}
              </div>

              {referrerName && (
                <div className="wc-chain">
                  <User size={11} /> 由 {referrerName} 引荐
                </div>
              )}

              <div className="wc-bottom">
                {primaryPhone ? (
                  <a
                    className="wc-phone"
                    href={`tel:${primaryPhone.replace(/[\s-]/g, '')}`}
                    onClick={(e) => e.stopPropagation()}
                    title={primaryPhone}
                  >
                    <Phone size={11} />
                    {maskPhone(primaryPhone)}
                  </a>
                ) : (
                  <span className="wc-phone" style={{ opacity: 0.6 }}>
                    未填写电话
                  </span>
                )}
                {view === 'grid' && (
                  <span style={{ fontSize: 10.5, opacity: 0.8 }}>完整度 {meta.completeness}%</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="row between" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', opacity: 0.75 }}>
                  补充信息 · {meta.name}
                </span>
                <button
                  className="wc-icon-btn"
                  style={{ opacity: 1 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setFlipped(false)
                  }}
                  aria-label="翻回正面"
                >
                  <FlipHorizontal2 size={13} />
                </button>
              </div>
              <div style={{ overflow: 'hidden', flex: '1 1 auto' }}>
                {backItems.map((item) => (
                  <div className="back-row" key={item.label}>
                    <span className="k">{item.label}</span>
                    <span className="v">{item.text}</span>
                  </div>
                ))}
              </div>
              <div className="wc-bottom" style={{ paddingTop: 6 }}>
                <span style={{ fontSize: 10.5, opacity: 0.72 }}>完整度 {meta.completeness}%</span>
                <span style={{ fontSize: 10.5, opacity: 0.72 }}>点击卡片查看详情</span>
              </div>
            </>
          )}
          <div className="t-tilt-glare" aria-hidden="true" />
        </div>
      </div>

      <Modal
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={meta.name}
        narrow
        footer={
          <button className="btn" onClick={() => setMenuOpen(false)}>
            关闭
          </button>
        }
      >
        <div className="stack" style={{ gap: 4 }}>
          <button
            className="btn ghost"
            style={{ justifyContent: 'flex-start', height: 40 }}
            onClick={() => {
              setMenuOpen(false)
              onOpen()
            }}
          >
            <User size={15} /> 打开详情
          </button>
          {primaryPhone && (
            <>
              <a
                className="btn ghost"
                style={{ justifyContent: 'flex-start', height: 40 }}
                href={`tel:${primaryPhone.replace(/[\s-]/g, '')}`}
                onClick={() => setMenuOpen(false)}
              >
                <Phone size={15} /> 拨打电话
              </a>
              <CopyButton variant="row" text={primaryPhone} label="复制电话" icon={<Copy size={15} />}>
                复制电话
              </CopyButton>
            </>
          )}
          <button
            className="btn ghost"
            style={{ justifyContent: 'flex-start', height: 40 }}
            onClick={() => {
              markContacted(meta.person.id)
              toast(`已记录与${meta.name}的联系`, 'success')
              setMenuOpen(false)
            }}
          >
            <FlipHorizontal2 size={15} /> 标记为已联系
          </button>
          <div className="divider" />
          <button
            className="btn ghost"
            style={{ justifyContent: 'flex-start', height: 40, color: 'var(--danger)' }}
            onClick={() => {
              const refCount = ctx.persons.filter((p) => {
                const rel = p.fields.relatedPersons
                const ref = p.fields.referrer
                const inRel = Array.isArray(rel) && rel.some((x) => (typeof x === 'string' ? x : (x as { refId: string }).refId) === meta.person.id)
                const isRef = (typeof ref === 'string' ? ref : ref && typeof ref === 'object' ? (ref as { refId: string }).refId : '') === meta.person.id
                return inRel || isRef
              }).length
              setMenuOpen(false)
              askConfirm({
                title: `删除「${meta.name}」？`,
                message:
                  refCount > 0
                    ? `该联系人是 ${refCount} 人的关联人或引荐人。删除后默认保留姓名快照（灰显「已删除联系人」），其互动记录与待办将一并删除。`
                    : '其互动记录、待办与纪念日将一并删除，此操作不可撤销（可用 ⌘/Ctrl+Z 撤销）。',
                confirmText: '删除',
                danger: true,
                onConfirm: () => {
                  deletePerson(meta.person.id, 'snapshot')
                  toast('已删除联系人', 'success')
                  setPrefs({})
                },
              })
            }}
          >
            删除联系人
          </button>
        </div>
      </Modal>
    </>
  )
}
