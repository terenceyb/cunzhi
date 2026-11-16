import React, { useMemo, useRef, useState } from 'react'
import { CalendarDays, Search, X } from 'lucide-react'
import { useStore } from '../store'
import { useUI } from '../ui'
import { cn, dateIssue } from '../lib/utils'
import { personName } from '../lib/derive'
import { pinyinOf } from '../lib/search'
import { Avatar } from './ui'

/** 中文语义的日期输入：文本框占位「年-月-日」，右侧按钮唤起系统日历 */
export function DateField({
  value,
  onChange,
  readOnly,
  compact,
  invalid,
  width,
}: {
  value: string
  onChange: (v: string) => void
  readOnly?: boolean
  compact?: boolean
  invalid?: boolean
  width?: number
}) {
  const nativeRef = useRef<HTMLInputElement>(null)
  const text = (value ?? '').slice(0, 10)
  /* 格式对了还要看日历成立不成立（2 月 30 日 / 13 月 / 10 月 40 日） */
  const issue = dateIssue(text)
  const bad = !!issue
  return (
    <span className={cn('date-field', bad && 'has-issue')}>
      <input
        className={cn('input', compact && 'sm', (invalid || bad) && 'invalid')}
        aria-invalid={bad || undefined}
        style={{ width: width ?? 148 }}
        type="text"
        inputMode="numeric"
        placeholder="年-月-日"
        maxLength={10}
        value={text}
        readOnly={readOnly}
        onChange={(e) => onChange(maskDate(e.target.value))}
      />
      {!readOnly && (
        <>
          <button
            type="button"
            className="btn icon sm date-pick"
            aria-label="选择日期"
            onClick={() => {
              const el = nativeRef.current
              if (!el) return
              if (typeof el.showPicker === 'function') el.showPicker()
              else el.click()
            }}
          >
            <CalendarDays size={14} />
          </button>
          <input
            ref={nativeRef}
            type="date"
            className="date-native"
            tabIndex={-1}
            aria-hidden
            value={/^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </>
      )}
      {issue && !invalid && (
        <span className="date-issue" role="alert">
          {issue}
        </span>
      )}
    </span>
  )
}

/** 日期文本框：自动补 -，只允许数字 */
export function maskDate(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
}

/** 可搜索的人脉选择器，替代原生下拉 */
export function PersonSelect({
  value,
  onChange,
  placeholder = '搜索姓名或拼音…',
  allowEmpty = true,
  emptyLabel = '不关联',
}: {
  value: string
  onChange: (id: string) => void
  placeholder?: string
  allowEmpty?: boolean
  emptyLabel?: string
}) {
  const persons = useStore((s) => s.persons)
  const groups = useStore((s) => s.groups)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const selected = persons.find((p) => p.id === value)

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return persons.slice(0, 8)
    return persons
      .filter((p) => {
        const name = personName(p).toLowerCase()
        const py = pinyinOf(personName(p))
        const company = String(p.fields.company ?? '').toLowerCase()
        return name.includes(kw) || py.full.includes(kw) || py.initials.includes(kw) || company.includes(kw)
      })
      .slice(0, 8)
  }, [q, persons])

  if (selected) {
    return (
      <div className="person-select-picked">
        <Avatar
          name={personName(selected)}
          size={24}
          color={groups.find((g) => g.id === selected.fields.groups)?.color}
        />
        <span className="grow ellipsis">{personName(selected)}</span>
        <button
          type="button"
          className="btn icon sm"
          aria-label="清除关联"
          onClick={() => {
            onChange('')
            setQ('')
          }}
        >
          <X size={13} />
        </button>
      </div>
    )
  }

  return (
    <div className="person-select">
      <div className="search-box">
        <Search size={14} />
        <input
          className="input"
          value={q}
          placeholder={placeholder}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 140)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(list.length - 1, a + 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              const hit = list[active]
              if (hit) {
                onChange(hit.id)
                setOpen(false)
                setQ('')
              }
            }
          }}
        />
      </div>
      {open && (
        <div className="person-select-list">
          {allowEmpty && (
            <button
              type="button"
              className="person-select-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              <span className="muted">{emptyLabel}</span>
            </button>
          )}
          {list.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={cn('person-select-item', i === active && 'on')}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                onChange(p.id)
                setOpen(false)
                setQ('')
              }}
            >
              <Avatar name={personName(p)} size={22} color={groups.find((g) => g.id === p.fields.groups)?.color} />
              <span className="grow ellipsis">{personName(p)}</span>
              <span className="sub ellipsis">{String(p.fields.company ?? '')}</span>
            </button>
          ))}
          {list.length === 0 && <div className="person-select-empty">没有匹配的联系人</div>}
        </div>
      )}
    </div>
  )
}
