import React, { useMemo } from 'react'
import { cn } from '../lib/utils'
import { buildDigitParts, useDigitPulse, useRevealState } from '../lib/motion'

/* transitions.dev recipe 的 React 封装：只负责写 data-state，动效全在 CSS 里 */

/** number pop-in：数字变化时逐位换鼓 */
export function TNumber({ value, className }: { value: number | string; className?: string }) {
  const str = String(value)
  const { state, from, seq } = useDigitPulse(str)
  const parts = useMemo(() => buildDigitParts(from, str), [from, str])

  return (
    <>
      <span key={seq} className={cn('t-digit-group', className)} data-state={state} aria-hidden="true">
        {parts.map((p, i) =>
          p.same ? (
            <span key={i} className="t-digit" data-same="">
              {p.ch}
            </span>
          ) : (
            <span key={i} className="t-digit-slot" data-stagger={p.stagger ? String(p.stagger) : undefined}>
              {p.old !== null && (
                <span className="t-digit-old" aria-hidden="true">
                  {p.old}
                </span>
              )}
              <span className="t-digit">{p.ch}</span>
            </span>
          ),
        )}
      </span>
      <span className="sr-only">{str}</span>
    </>
  )
}

/** notification badge：数字 > 0 时斜向滑入并弹一下，触发器本身不动 */
export function TBadge({
  count,
  inline,
  className,
  dotOnly,
  label,
}: {
  count: number
  inline?: boolean
  className?: string
  dotOnly?: boolean
  label?: string
}) {
  return (
    <span className={cn('t-badge', inline && 'is-inline', className)} data-state={count > 0 ? 'open' : 'closed'}>
      <span className="t-badge-dot" aria-label={label} role={label ? 'status' : undefined}>
        {dotOnly ? '' : count > 0 ? count : ''}
      </span>
    </span>
  )
}

/** icon swap：同一槽位里两个图标交叉淡入 + 缩放 + 2px 模糊 */
export function IconSwap({
  open,
  a,
  b,
  className,
}: {
  open: boolean
  a: React.ReactNode
  b: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn('t-icon-swap', className)} data-state={open ? 'open' : 'closed'} aria-hidden="true">
      <span className="t-icon" data-icon="a">
        {a}
      </span>
      <span className="t-icon" data-icon="b">
        {b}
      </span>
    </span>
  )
}

/** panel reveal：容器挂载后位移 + 淡入 + 去模糊 */
export function PanelReveal({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const state = useRevealState()
  return (
    <div className={cn('t-panel-slide', className)} data-state={state}>
      {children}
    </div>
  )
}
