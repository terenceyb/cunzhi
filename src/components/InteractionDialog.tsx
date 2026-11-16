import React, { useEffect, useMemo, useState } from 'react'
import { Gift, Plus } from 'lucide-react'
import type { Person, TimelineEvent } from '../types'
import { useStore } from '../store'
import { useUI } from '../ui'
import { Avatar, Modal } from './ui'
import { DateField } from './inputs'
import { cn } from '../lib/utils'
import { personName } from '../lib/derive'

/**
 * 互动记录弹窗（3.1 / 3.2）
 * 「已联系」不再直接写一条无内容的记录，而是先记录这次互动到底聊了什么、通过什么方式，
 * 保存后才落到该人脉的互动时间线，并重置走动提醒计时。
 */
export function InteractionDialog({
  open,
  onClose,
  person,
  defaultChannel = '电话',
}: {
  open: boolean
  onClose: () => void
  person: Person | null
  defaultChannel?: string
}) {
  const channels = useStore((s) => s.prefs.channels)
  const setPrefs = useStore((s) => s.setPrefs)
  const addTimeline = useStore((s) => s.addTimeline)
  const patchPerson = useStore((s) => s.patchPerson)
  const toast = useUI((s) => s.toast)
  const askPrompt = useUI((s) => s.askPrompt)
  const groups = useStore((s) => s.groups)

  const [channel, setChannel] = useState(defaultChannel)
  const [text, setText] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [giftItem, setGiftItem] = useState('')
  const [giftValue, setGiftValue] = useState('')
  const [resetTimer, setResetTimer] = useState(true)

  useEffect(() => {
    if (!open) return
    setChannel(defaultChannel)
    setText('')
    setDate(new Date().toISOString().slice(0, 10))
    setGiftItem('')
    setGiftValue('')
    setResetTimer(true)
  }, [open, defaultChannel, person?.id])

  const isGift = channel === '礼物'
  const title = useMemo(() => (person ? `记录与「${personName(person)}」的互动` : '记录互动'), [person])

  const save = () => {
    if (!person) return
    const note = text.trim()
    const item = giftItem.trim()
    if (isGift && !item && !note) {
      toast('礼物是什么？写一句方便日后回礼', 'warn')
      return
    }
    if (!isGift && !note) {
      toast('写一句这次互动的要点', 'warn')
      return
    }
    let content: string
    if (isGift) {
      const value = Number(giftValue.replace(/[^\d.]/g, ''))
      const hasValue = !!giftValue.trim() && !Number.isNaN(value) && value > 0
      content = `礼物：${item || note}${hasValue ? `（价值 ¥${value}）` : ''}${note && item ? ` · ${note}` : ''}`
    } else {
      content = `${channel}：${note}`
    }
    const type: TimelineEvent['type'] = isGift ? 'gift' : 'reach_out'
    const occurredAt = `${date}T${new Date().toTimeString().slice(0, 8)}`
    addTimeline(
      person.id,
      type,
      content,
      occurredAt,
      channel,
      isGift ? { gift: { item: item || note, value: Number(giftValue.replace(/[^\d.]/g, '')) || undefined } } : undefined,
    )
    if (resetTimer) patchPerson(person.id, { snoozeUntil: null, ignoredReminders: 0 })
    toast('已记入互动时间线', 'success')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      formId="interaction-form"
      onSubmit={save}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="submit" form="interaction-form">
            保存记录
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        {person && (
          <div className="ix-person">
            <Avatar
              name={personName(person)}
              size={30}
              color={groups.find((g) => g.id === person.fields.groups)?.color}
            />
            <span className="ix-name">{personName(person)}</span>
            <span className="field-hint">{String(person.fields.company ?? '')}</span>
          </div>
        )}

        <div className="field">
          <span className="field-label">互动方式</span>
          <div className="chip-row">
            {channels.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={channel === c}
                className={cn('chip', channel === c && 'accent')}
                onClick={() => setChannel(c)}
              >
                {c === '礼物' && <Gift size={11} />}
                {c}
              </button>
            ))}
            <button
              type="button"
              className="chip dashed"
              onClick={() =>
                askPrompt({
                  title: '新增互动方式',
                  message: '例如：线下拜访、视频会议、领英私信。保存后详情页与速记都会出现。',
                  placeholder: '互动方式名称',
                  confirmText: '添加',
                  onSubmit: (v) => {
                    const name = v.trim()
                    if (!name) return
                    if (channels.includes(name)) {
                      setChannel(name)
                      return
                    }
                    setPrefs({ channels: [...channels, name] })
                    setChannel(name)
                  },
                })
              }
            >
              <Plus size={11} /> 自定义
            </button>
          </div>
        </div>

        {isGift && (
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div className="field grow">
              <span className="field-label">礼物内容</span>
              <input
                className="input"
                value={giftItem}
                placeholder="例如：手冲咖啡套装"
                maxLength={60}
                onChange={(e) => setGiftItem(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: '0 0 132px' }}>
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

        <div className="field">
          <span className="field-label">{isGift ? '补充说明' : '这次聊了什么'}</span>
          <textarea
            className="textarea"
            rows={3}
            value={text}
            placeholder={isGift ? '为什么送、对方反应如何…（选填）' : '例如：聊到他们在扩团队，下周三把方案发过去'}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        <div className="row" style={{ gap: 14, alignItems: 'flex-end' }}>
          <div className="field">
            <span className="field-label">发生日期</span>
            <DateField value={date} onChange={setDate} width={150} />
          </div>
          <label className="ix-check">
            <input type="checkbox" checked={resetTimer} onChange={(e) => setResetTimer(e.target.checked)} />
            重置走动提醒计时
          </label>
        </div>
      </div>
    </Modal>
  )
}
