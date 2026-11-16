import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock, Search, Users } from 'lucide-react'
import { useStore, buildCtx } from '../store'
import { useUI } from '../ui'
import { Avatar, Highlight } from './ui'
import { buildSearchIndex, searchPersons } from '../lib/search'
import { buildPersonMeta, personName } from '../lib/derive'
import { cn, relativeTime } from '../lib/utils'

export function GlobalSearch() {
  const open = useUI((s) => s.searchOpen)
  const close = () => useUI.setState({ searchOpen: false })
  const persons = useStore((s) => s.persons)
  const fieldDefinitions = useStore((s) => s.fieldDefinitions)
  const groups = useStore((s) => s.groups)
  const prefs = useStore((s) => s.prefs)
  const setPrefs = useStore((s) => s.setPrefs)
  const openPerson = useUI((s) => s.openPerson)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const store = useStore()
  const ctx = useMemo(() => buildCtx(store), [store.persons, store.fieldDefinitions, store.groups, store.tags, store.timelineEvents, store.attachments])
  const index = useMemo(() => buildSearchIndex(ctx), [ctx])
  const hits = useMemo(() => searchPersons(q, index, ctx), [q, index, ctx])

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => setActive(0), [q])

  const recentPersons = prefs.recentViewed.map((id) => persons.find((p) => p.id === id)).filter(Boolean) as typeof persons
  const recentAdded = [...persons].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 5)

  const go = (id: string) => {
    openPerson(id)
    const next = [id, ...prefs.recentViewed.filter((x) => x !== id)].slice(0, 8)
    setPrefs({ recentViewed: next })
    if (q.trim()) {
      const hist = [q.trim(), ...prefs.searchHistory.filter((x) => x !== q.trim())].slice(0, 10)
      setPrefs({ searchHistory: hist })
    }
    close()
  }

  if (!open) return null

  const list = q.trim() ? hits.slice(0, 30) : []

  return createPortal(
    <div
      className="overlay"
      style={{ alignItems: 'flex-start', paddingTop: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="search-panel" role="dialog" aria-label="全局搜索">
        <div className="sp-input">
          <Search size={18} className="muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索姓名、拼音、公司、标签、备注、电话、字段值…"
            aria-label="搜索"
            onKeyDown={(e) => {
              if (e.key === 'Escape') close()
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(list.length - 1, a + 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(0, a - 1))
              }
              if (e.key === 'Enter') {
                const hit = list[active]
                if (hit) go(hit.personId)
              }
            }}
          />
          <button className="kbd" onClick={close}>
            Esc
          </button>
        </div>

        <div className="search-results">
          {q.trim() ? (
            <>
              <div className="search-section-label">按联系人聚合 · {hits.length} 个结果</div>
              {list.map((hit, i) => {
                const person = persons.find((p) => p.id === hit.personId)
                if (!person) return null
                const meta = buildPersonMeta(person, ctx)
                return (
                  <div
                    key={hit.personId}
                    className={cn('search-hit', i === active && 'on')}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(hit.personId)}
                  >
                    <Avatar name={hit.name} src={meta.avatar?.thumbnail} size={32} color={meta.groupColor} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="hit-name">
                        {hit.name}
                        {meta.group && (
                          <span className="chip sm" style={{ background: `${meta.groupColor}16`, color: meta.groupColor }}>
                            {meta.group.name}
                          </span>
                        )}
                      </div>
                      {hit.matches.slice(0, 2).map((m, idx) => (
                        <div key={idx} className="hit-match">
                          <span style={{ color: 'var(--text-3)' }}>{m.label}：</span>
                          {m.length > 0 ? (
                            <Highlight text={m.snippet} keyword={q} />
                          ) : (
                            <span>{m.snippet}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {list.length === 0 && (
                <div className="empty" style={{ padding: '30px 20px' }}>
                  <p>没有匹配的联系人，试试姓名拼音首字母或公司名</p>
                </div>
              )}
            </>
          ) : (
            <>
              {prefs.searchHistory.length > 0 && (
                <>
                  <div className="search-section-label">搜索历史</div>
                  <div className="chip-row" style={{ padding: '0 10px 10px' }}>
                    {prefs.searchHistory.map((h) => (
                      <button key={h} className="chip" onClick={() => setQ(h)}>
                        <Clock size={11} /> {h}
                      </button>
                    ))}
                    <button className="link-btn" onClick={() => setPrefs({ searchHistory: [] })}>
                      清空
                    </button>
                  </div>
                </>
              )}
              {recentPersons.length > 0 && (
                <>
                  <div className="search-section-label">最近查看</div>
                  {recentPersons.slice(0, 4).map((p) => {
                    const meta = buildPersonMeta(p, ctx)
                    return (
                      <div key={p.id} className="search-hit" onClick={() => go(p.id)}>
                        <Avatar name={personName(p)} src={meta.avatar?.thumbnail} size={28} color={meta.groupColor} />
                        <div className="grow">
                          <div className="hit-name">{personName(p)}</div>
                          <div className="hit-match">{relativeTime(meta.lastInteractionAt)}互动</div>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
              <div className="search-section-label">
                <Users size={11} /> 最近添加
              </div>
              {recentAdded.map((p) => {
                const meta = buildPersonMeta(p, ctx)
                return (
                  <div key={p.id} className="search-hit" onClick={() => go(p.id)}>
                    <Avatar name={personName(p)} src={meta.avatar?.thumbnail} size={28} color={meta.groupColor} />
                    <div className="grow">
                      <div className="hit-name">{personName(p)}</div>
                      <div className="hit-match">{String(p.fields.company ?? '—')}</div>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
        <div className="search-foot">
          <span className="kbd">↑</span>
          <span className="kbd">↓</span> 切换
          <span className="kbd">Enter</span> 打开
          <span className="kbd">Esc</span> 关闭
          <span style={{ marginLeft: 'auto' }}>搜索覆盖姓名拼音、备注、字段值与附件名</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
