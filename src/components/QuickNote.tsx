import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Plus, Sparkles, X } from 'lucide-react'
import { useStore } from '../store'
import { useUI } from '../ui'
import { Avatar, Modal } from './ui'
import { cn } from '../lib/utils'
import { personName } from '../lib/derive'
import { suggestPersons } from '../lib/search'

const CHANNELS = [
  { key: 'note', label: '普通备注' },
  { key: 'phone', label: '电话沟通' },
  { key: 'meet', label: '见面' },
  { key: 'wechat', label: '微信沟通' },
  { key: 'email', label: '邮件' },
  { key: 'gift', label: '礼物' },
]

export function QuickNote({ presetPersonId }: { presetPersonId?: string | null }) {
  const open = useUI((s) => s.quickNoteOpen)
  const setOpen = (v: boolean) => useUI.setState({ quickNoteOpen: v })
  const persons = useStore((s) => s.persons)
  const groups = useStore((s) => s.groups)
  const addTimeline = useStore((s) => s.addTimeline)
  const recent = useStore((s) => s.prefs.recentViewed)
  const toast = useUI((s) => s.toast)
  const [text, setText] = useState('')
  const [channel, setChannel] = useState('note')
  const [giftItem, setGiftItem] = useState('')
  const [giftValue, setGiftValue] = useState('')
  const [targets, setTargets] = useState<string[]>([])
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    setText('')
    setChannel('note')
    setGiftItem('')
    setGiftValue('')
    setTargets(presetPersonId ? [presetPersonId] : [])
    setTimeout(() => areaRef.current?.focus(), 60)
  }, [open, presetPersonId])

  const suggestions = useMemo(() => {
    const list = suggestPersons(text, persons, recent, 4)
    if (targets.length === 0) return list
    return list.filter((p) => !targets.includes(p.id))
  }, [text, persons, recent, targets])

  const save = () => {
    const isGift = channel === 'gift'
    const giftTitle = giftItem.trim() || text.trim()
    if (isGift && !giftTitle) {
      toast('写上礼物是什么，方便日后回礼', 'warn')
      return
    }
    if (!isGift && !text.trim()) {
      toast('写点什么再保存', 'warn')
      return
    }
    if (targets.length === 0) {
      toast('请选择要记录到哪位联系人', 'warn')
      return
    }
    const ch = CHANNELS.find((c) => c.key === channel)!
    const value = Number(giftValue.replace(/[^\d.]/g, ''))
    const hasValue = isGift && !!giftValue.trim() && !Number.isNaN(value) && value > 0
    let content: string
    if (isGift) {
      content = `礼物：${giftTitle}${hasValue ? `（价值 ¥${value}）` : ''}`
    } else {
      content = channel === 'note' ? text.trim() : `${ch.label}：${text.trim()}`
    }
    const type = isGift ? 'gift' : channel === 'note' ? 'note' : 'reach_out'
    for (const id of targets) {
      addTimeline(id, type, content, undefined, ch.label, isGift ? { gift: { item: giftTitle, value: hasValue ? value : undefined } } : undefined)
    }
    toast(`已记录到 ${targets.length} 位联系人的时间线`, 'success')
    setOpen(false)
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      focusOnTouch
      title={
        <span className="row" style={{ gap: 6 }}>
          <Sparkles size={15} /> 速记
        </span>
      }
      footer={
        <>
          <span className="left field-hint">⌘/Ctrl + Enter 保存 · Esc 关闭</span>
          <button className="btn" onClick={() => setOpen(false)}>
            取消
          </button>
          <button className="btn primary" onClick={save}>
            保存到时间线
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="quicknote">
          <textarea
            ref={areaRef}
            data-autofocus
            className="textarea"
            rows={4}
            value={text}
            placeholder={
              channel === 'gift'
                ? '补充说明（可选）：为什么送、对方反应如何…'
                : '刚聊了什么？一句话就够。比如「她对会员体系很感兴趣，下周发方案」'
            }
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                save()
              }
            }}
          />
        </div>
        {channel === 'gift' && (
          <div className="qn-gift">
            <div className="field grow">
              <span className="field-label">礼物内容</span>
              <input
                className="input"
                value={giftItem}
                placeholder="例如：手冲咖啡套装"
                onChange={(e) => setGiftItem(e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="field" style={{ flex: '0 0 140px' }}>
              <span className="field-label">价值（元）</span>
              <input
                className="input"
                inputMode="decimal"
                value={giftValue}
                placeholder="选填"
                onChange={(e) => setGiftValue(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="qn-toolbar">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={channel === c.key}
              className={cn('chip', channel === c.key && 'accent')}
              onClick={() => setChannel(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {targets.length > 0 && (
          <div className="chip-row">
            {targets.map((id) => {
              const p = persons.find((x) => x.id === id)
              return (
                <span key={id} className="chip suggest-chip on" style={{ height: 30, paddingLeft: 3, gap: 6 }}>
                  <Avatar name={personName(p)} size={22} color={groups.find((g) => g.id === p?.fields.groups)?.color} />
                  {personName(p)}
                  {p?.fields.company ? <span className="muted" style={{ fontSize: 10.5 }}>{String(p.fields.company)}</span> : null}
                  <button className="suggest-tick on" onClick={() => setTargets((t) => t.filter((x) => x !== id))} aria-label="移除关联">
                    <X size={11} strokeWidth={2.6} />
                  </button>
                </span>
              )
            })}
          </div>
        )}

        <div>
          <div className="field-label" style={{ marginBottom: 6 }}>
            关联到
            {suggestions.length > 0 && <span className="field-hint">· 根据内容为你推荐</span>}
          </div>
          <div className="chip-row">
            {suggestions.map((p) => (
              (() => {
                const on = targets.includes(p.id)
                return (
                  <button
                    key={p.id}
                    className={cn('chip suggest-chip', on && 'on')}
                    style={{ height: 30, paddingLeft: 3, gap: 6 }}
                    aria-pressed={on}
                    title={on ? '再次点击取消关联' : '点击关联到该人脉'}
                    onClick={() =>
                      setTargets((t) => (on ? t.filter((x) => x !== p.id) : [...t, p.id]))
                    }
                  >
                    <Avatar name={personName(p)} size={22} color={groups.find((g) => g.id === p.fields.groups)?.color} />
                    {personName(p)}
                    <span className="muted" style={{ fontSize: 10.5 }}>
                      {String(p.fields.company ?? '')}
                    </span>
                    <span className={cn('suggest-tick', on && 'on')} aria-hidden="true">
                      {on ? <Check size={11} strokeWidth={3} /> : <Plus size={11} />}
                    </span>
                  </button>
                )
              })()
            ))}
            {suggestions.length === 0 && <span className="field-hint">输入内容后会自动匹配联系人，也可在下方手动挑选</span>}
          </div>
          <details style={{ marginTop: 10 }}>
            <summary style={{ fontSize: 12, color: 'var(--text-3)', cursor: 'pointer' }}>从全部联系人中选择</summary>
            <div className="picker-list" style={{ marginTop: 8 }}>
              {persons
                .filter((p) => !targets.includes(p.id))
                .slice(0, 60)
                .map((p) => (
                  <button key={p.id} className="picker-item" onClick={() => setTargets((t) => [...t, p.id])}>
                    <Avatar name={personName(p)} size={24} color={groups.find((g) => g.id === p.fields.groups)?.color} />
                    <div className="grow">
                      <div style={{ fontSize: 13 }}>{personName(p)}</div>
                      <div className="sub">{String(p.fields.company ?? '—')}</div>
                    </div>
                    <Check size={13} className="muted" />
                  </button>
                ))}
            </div>
          </details>
        </div>
      </div>
    </Modal>
  )
}
