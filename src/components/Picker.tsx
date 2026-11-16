import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import type { SelectOption } from '../types'
import { cn } from '../lib/utils'
import { usePresence } from '../lib/motion'

/* ============================================================================
   选项选择器（单选 / 多选共用）
   ----------------------------------------------------------------------------
   · 触发器就是「当前值」本身：选了什么，触发器上立刻看得见，不再是一个空输入框
   · 面板挂在 body 上、position: fixed，跟随触发器定位并自动上下翻转，
     不再被详情面板 / 滚动容器裁切（手机上尤其明显）
   · 点选项 = 立刻生效：单选选中即收起；多选留在原地连续勾选
   · 键盘：↑↓ 移动、Enter 选中、Esc 收起、Tab 离开；过滤框输入即筛，回车可新建
   · 动效遵循 transitions.dev：从触发器 origin 长出、150ms ease-out、只动 transform/opacity
   ========================================================================== */

type Props = {
  options: SelectOption[]
  /** 已选中的选项 id */
  selected: string[]
  multiple?: boolean
  placeholder?: string
  /** 触发器文案：多选时是「+ 添加」，单选空值时是「选择」 */
  addLabel?: string
  invalid?: boolean
  readOnly?: boolean
  /** 输入了不存在的选项时的新建入口，返回新 id（同步返回则立即选中） */
  onCreate?: (label: string) => string | void
  onSelect: (id: string) => void
  onClear?: () => void
  ariaLabel?: string
}

const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function ChoicePicker({
  options,
  selected,
  multiple,
  placeholder = '选择',
  addLabel = '添加',
  invalid,
  readOnly,
  onCreate,
  onSelect,
  onClear,
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const [box, setBox] = useState<{ top: number; left: number; width: number; origin: string } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const { mounted, state } = usePresence(open, '--dropdown-close-dur', 150)

  const current = multiple ? undefined : options.find((o) => o.id === selected[0])
  const keyword = q.trim()
  const list = useMemo(() => {
    const base = options.filter((o) => !keyword || o.label.toLowerCase().includes(keyword.toLowerCase()))
    return base.slice(0, 40)
  }, [options, keyword])
  const exact = keyword ? options.find((o) => sameLabel(o.label, keyword)) : undefined
  const canCreate = !!keyword && !exact && !!onCreate

  /* 面板定位：默认贴触发器下方，下方不够就翻到上方；宽度不小于触发器 */
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const a = triggerRef.current?.getBoundingClientRect()
      if (!a) return
      const panel = panelRef.current
      const h = panel?.offsetHeight ?? 0
      const gap = 6
      /* 手机上别做太窄的一条：留出读得清选项的宽度 */
      const base = window.matchMedia('(max-width: 767px)').matches ? 268 : 200
      const width = Math.min(Math.max(a.width, base), window.innerWidth - 16)
      let left = Math.min(Math.max(8, a.left), window.innerWidth - width - 8)
      let top = a.bottom + gap
      const flipped = !!h && top + h > window.innerHeight - 8
      if (flipped) top = Math.max(8, a.top - h - gap)
      /* 圆角在一侧，origin 跟着翻转方向走，让它像从触发器里长出来 */
      const originX = a.left + a.width / 2 < window.innerWidth / 2 ? 'left' : 'right'
      setBox({ top, left, width, origin: `${flipped ? 'bottom' : 'top'}-${originX}` })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, list.length, canCreate])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const rows = list.length + (canCreate ? 1 : 0)
  const commit = () => {
    if (hi < list.length) {
      const opt = list[hi]
      if (opt) pick(opt.id)
    } else if (canCreate) {
      create(keyword)
    }
  }

  /* 键盘全部在捕获阶段处理：焦点在触发器、搜索框还是选项上，反应都一致 */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHi((i) => Math.min(Math.max(0, rows - 1), i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => keyRef.current(e)
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open])

  useEffect(() => {
    if (!open) {
      setQ('')
      setHi(0)
      return
    }
    setHi(0)
    /* 触屏不自动聚焦：一聚焦就弹系统键盘，会把下面半屏的选项顶掉 */
    const coarse = window.matchMedia('(hover: none)').matches
    if (!coarse) {
      const t = window.setTimeout(() => searchRef.current?.focus(), 40)
      return () => window.clearTimeout(t)
    }
  }, [open])

  const pick = (id: string) => {
    onSelect(id)
    setQ('')
    if (!multiple) {
      setOpen(false)
      triggerRef.current?.focus()
    } else if (!window.matchMedia('(hover: none)').matches) {
      /* 触屏别抢焦点，一抢就弹键盘把选项顶走 */
      searchRef.current?.focus()
    }
  }

  const create = (label: string) => {
    const v = label.trim()
    if (!v || !onCreate) return
    const id = onCreate(v)
    if (typeof id === 'string') pick(id)
    else setQ('')
  }

  if (readOnly) {
    return current ? (
      <span className="chip chip-opt">
        {current.color && <span className="dot" style={{ background: current.color }} />}
        {current.label}
      </span>
    ) : (
      <span className="muted">—</span>
    )
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          'chip chip-opt pk-trigger',
          !current && !multiple && 'is-empty',
          invalid && 'is-invalid',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? (current ? `${current.label}，点击修改` : placeholder)}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          e.preventDefault()
          setOpen((v) => !v)
        }}
        onClickCapture={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        {current ? (
          <>
            {current.color && <span className="dot" style={{ background: current.color }} />}
            <span className="ellipsis">{current.label}</span>
            <ChevronDown size={12} className="pk-caret" />
          </>
        ) : (
          <>
            <Plus size={12} />
            <span>{multiple ? addLabel : placeholder}</span>
          </>
        )}
      </button>

      {mounted &&
        createPortal(
          <div
            ref={panelRef}
            className="pk-panel t-dropdown"
            data-state={state}
            data-origin={box?.origin ?? 'top-left'}
            style={{
              position: 'fixed',
              top: box?.top ?? -9999,
              left: box?.left ?? -9999,
              width: box?.width ?? 200,
              zIndex: 1250,
              visibility: box ? 'visible' : 'hidden',
            }}
          >
            <div className="pk-search">
              <Search size={13} />
              <input
                ref={searchRef}
                value={q}
                placeholder={onCreate ? '搜索或输入新建' : '搜索'}
                onChange={(e) => {
                  setQ(e.target.value)
                  setHi(0)
                }}
                /* 方向键 / 回车 / Esc 统一由面板的捕获监听处理，这里不再重复 */
                aria-label="筛选选项"
              />
              {q && (
                <button type="button" className="pk-clear" onClick={() => setQ('')} aria-label="清空输入">
                  <X size={11} />
                </button>
              )}
            </div>

            <div className="pk-list" role="listbox" aria-multiselectable={multiple || undefined} aria-label={ariaLabel ?? placeholder}>
              {list.map((o, i) => {
                const on = selected.includes(o.id)
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={cn('pk-opt', on && 'is-on', i === hi && 'is-hi')}
                    onPointerEnter={() => setHi(i)}
                    onClick={() => pick(o.id)}
                  >
                    {/* 多选：勾选框在左，保持列表对齐；单选：勾在右，符合「选一个」的读法 */}
                    {multiple && (
                      <span className="pk-tick is-box" aria-hidden>
                        {on && <Check size={11} strokeWidth={3} />}
                      </span>
                    )}
                    <span className="pk-label">
                      {o.color && o.color !== '#5B6573' && <span className="dot" style={{ background: o.color }} />}
                      <span className="ellipsis">{o.label}</span>
                    </span>
                    {!multiple && on && <Check size={13} strokeWidth={2.6} className="pk-check" aria-hidden />}
                  </button>
                )
              })}

              {canCreate && (
                <button
                  type="button"
                  className={cn('pk-opt pk-create', hi === list.length && 'is-hi')}
                  onPointerEnter={() => setHi(list.length)}
                  onClick={() => create(keyword)}
                >
                  <span className="pk-tick" aria-hidden>
                    <Plus size={11} strokeWidth={3} />
                  </span>
                  <span className="pk-label">
                    新建「<b>{keyword}</b>」
                  </span>
                </button>
              )}

              {rows === 0 && <p className="pk-empty">没有匹配的选项，换个词试试</p>}
            </div>

            {onClear && !multiple && selected.length > 0 && (
              <button
                type="button"
                className="pk-footer"
                onClick={() => {
                  onClear()
                  setOpen(false)
                }}
              >
                清除选择
              </button>
            )}
            {multiple && (
              <button type="button" className="pk-footer" onClick={() => setOpen(false)}>
                完成
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

/* -------------------- 单选 / 多选的字段级封装 -------------------- */

export function ChoiceField({
  options,
  value,
  multiple,
  readOnly,
  invalid,
  placeholder,
  onChange,
  onCreate,
}: {
  options: SelectOption[]
  value: string[] | string
  multiple?: boolean
  readOnly?: boolean
  invalid?: boolean
  placeholder?: string
  onChange: (next: string[] | string) => void
  onCreate?: (label: string) => string | void
}) {
  const ids = Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []

  const select = (id: string) => {
    if (multiple) {
      onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
    } else {
      onChange(id)
    }
  }

  const remove = (id: string) => {
    if (multiple) onChange(ids.filter((x) => x !== id))
    else onChange('')
  }

  return (
    <div className={cn('choice-field', multiple ? 'is-multi' : 'is-single')}>
      {multiple &&
        ids.map((id) => {
          const o = options.find((x) => x.id === id)
          return (
            <span key={id} className={cn('chip chip-opt', !o && 'dashed')} title={o ? o.label : '该选项已删除'}>
              {o?.color && o.color !== '#5B6573' && <span className="dot" style={{ background: o.color }} />}
              <span className="ellipsis">{o?.label ?? id}</span>
              {!readOnly && (
                <button className="chip-x" type="button" onClick={() => remove(id)} aria-label={`移除 ${o?.label ?? id}`}>
                  <X size={11} />
                </button>
              )}
            </span>
          )
        })}

      <ChoicePicker
        options={options}
        selected={ids}
        multiple={multiple}
        readOnly={readOnly}
        invalid={invalid}
        placeholder={placeholder ?? '选择'}
        addLabel={ids.length ? '添加' : '选择'}
        onCreate={onCreate}
        onSelect={select}
        onClear={() => onChange('')}
      />
    </div>
  )
}
