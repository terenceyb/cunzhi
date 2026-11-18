import React, { useMemo, useState } from 'react'
import { Search, UserPlus, X } from 'lucide-react'
import type { PersonRef } from '../types'
import { useStore } from '../store'
import { isRefSnapshot, personName } from '../lib/derive'
import { Avatar, Modal } from './ui'
import { cn } from '../lib/utils'
import { pinyinOf } from '../lib/search'

const refId = (r: PersonRef): string => (isRefSnapshot(r) ? r.refId : r)

export function PersonPicker({
  value,
  onChange,
  multiple,
  readOnly,
  excludeId,
  placeholder = '选择联系人',
}: {
  value: PersonRef | PersonRef[] | undefined
  onChange: (v: PersonRef | PersonRef[]) => void
  multiple?: boolean
  readOnly?: boolean
  excludeId?: string
  placeholder?: string
}) {
  const persons = useStore((s) => s.persons)
  const groups = useStore((s) => s.groups)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const list: PersonRef[] = Array.isArray(value) ? value : value ? [value] : []
  const byId = useMemo(() => new Map(persons.map((p) => [p.id, p])), [persons])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return persons
      .filter((p) => p.id !== excludeId)
      .filter((p) => {
        if (!query) return true
        const name = personName(p)
        const py = pinyinOf(name)
        return (
          name.toLowerCase().includes(query) ||
          py.full.includes(query) ||
          py.initials.startsWith(query) ||
          String(p.fields.company ?? '').toLowerCase().includes(query)
        )
      })
      .slice(0, 80)
  }, [persons, q, excludeId])

  const emit = (ids: string[]) => {
    if (multiple) onChange(ids)
    else onChange(ids[0] ?? '')
  }

  return (
    <div className="chip-row">
      {list.map((r) => {
        const id = refId(r)
        const person = byId.get(id)
        const deleted = isRefSnapshot(r) || !person
        const name = person ? personName(person) : isRefSnapshot(r) ? r.snapshotName : '已删除联系人'
        const group = groups.find((g) => g.id === person?.fields.groups)
        return (
          <span
            key={id || name}
            className={cn('chip chip-opt avatar-chip', deleted && 'outline')}
            style={{ opacity: deleted ? 0.65 : 1 }}
          >
            <Avatar name={name} size={17} color={group?.color} />
            <span style={{ color: deleted ? 'var(--text-3)' : undefined }}>{name}</span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => emit(list.map(refId).filter((x) => x !== id))}
                aria-label={`移除 ${name}`}
                style={{ display: 'inline-flex', opacity: 0.5 }}
              >
                <X size={12} />
              </button>
            )}
          </span>
        )
      })}
      {!readOnly && (
        <button type="button" className="btn sm ghost" onClick={() => setOpen(true)}>
          <UserPlus size={13} /> {list.length ? '添加' : placeholder}
        </button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={multiple ? '选择关联人（可多选）' : '选择联系人'}
        footer={
          <>
            <span className="left field-hint">已选 {list.length} 人</span>
            <button type="button" className="btn primary" onClick={() => setOpen(false)}>
              完成
            </button>
          </>
        }
      >
        <div className="search-box" style={{ marginBottom: 10 }}>
          <Search size={15} />
          <input
            className="input"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索姓名、拼音或公司"
          />
        </div>
        <div className="picker-list">
          {filtered.map((p) => {
            const id = p.id
            const on = list.map(refId).includes(id)
            return (
              <button
                type="button"
                key={id}
                className={cn('picker-item', on && 'on')}
                onClick={() => {
                  const ids = list.map(refId)
                  if (multiple) emit(on ? ids.filter((x) => x !== id) : [...ids, id])
                  else {
                    emit([id])
                    setOpen(false)
                  }
                }}
              >
                <Avatar name={personName(p)} size={26} color={groups.find((g) => g.id === p.fields.groups)?.color} />
                <div className="grow">
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{personName(p)}</div>
                  <div className="sub">{String(p.fields.company ?? '') || '—'}</div>
                </div>
                {on && <span style={{ color: 'var(--accent)' }}>已选</span>}
              </button>
            )
          })}
          {filtered.length === 0 && <div className="empty"><p>没有匹配的联系人</p></div>}
        </div>
      </Modal>
    </div>
  )
}
