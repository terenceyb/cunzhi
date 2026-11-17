import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, CheckCircle2, Copy, Info, TriangleAlert, X, XCircle } from 'lucide-react'
import { useUI } from '../ui'
import { cn, initials } from '../lib/utils'
import { GIcon } from './glass/GIcon'
import { usePresence } from '../lib/motion'
import { IconSwap } from './motion'
import { useStore } from '../store'


/* ---------------- 品牌标记 ---------------- */
export function Logo({ size = 28 }: { size?: number }) {
  // 直接用应用图标（public/logo.svg），网页 tab 与站内标识保持一致
  return <img className="logo-mark" src="./logo.svg" width={size} height={size} alt="存知" draggable={false} />
}

/* ---------------- 头像 ---------------- */
export function Avatar({
  name,
  src,
  size = 36,
  color,
  className,
  fallbackClass,
}: {
  name: string
  src?: string
  size?: number
  color?: string
  className?: string
  fallbackClass?: string
}) {
  return (
    <span
      className={cn('avatar', className, fallbackClass)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.32)),
        background: src ? undefined : color || '#5B6573',
      }}
      aria-hidden
    >
      {src ? <img src={src} alt="" loading="lazy" /> : initials(name)}
    </span>
  )
}

/* ---------------- 开关 ---------------- */
export function Switch({
  on,
  onChange,
  small,
  label,
}: {
  on: boolean
  onChange: (v: boolean) => void
  small?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={cn('switch', on && 'on', small && 'sm')}
      onClick={() => onChange(!on)}
    />
  )
}

/* ---------------- 复制 ---------------- */
/**
 * 复制按钮：成功后原地换成对勾（1.4s 复原），不弹全局通知。
 * 反馈要贴着触发器出现，而不是飘到屏幕角落。
 */
export function CopyButton({
  text,
  label,
  variant = 'icon',
  className,
  iconSize = 13,
  icon,
  children,
}: {
  text: string
  label: string
  variant?: 'icon' | 'text' | 'row' | 'btn'
  className?: string
  iconSize?: number
  icon?: React.ReactNode
  children?: React.ReactNode
}) {
  const [done, setDone] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setDone(false), 1400)
    } catch {
      useUI.getState().toast('复制失败，请手动选择', 'error')
    }
  }

  if (variant === 'btn') {
    return (
      <button className={cn('btn', className)} onClick={copy}>
        {done ? (
          <span className="copy-done">
            <Check size={14} strokeWidth={3} /> 已复制
          </span>
        ) : (
          <>
            {icon}
            {children}
          </>
        )}
      </button>
    )
  }

  if (variant === 'row') {
    return (
      <button className={cn('btn ghost', className)} style={{ justifyContent: 'flex-start', height: 40 }} onClick={copy}>
        {done ? (
          <span className="copy-done">
            <Check size={15} strokeWidth={3} /> 已复制
          </span>
        ) : (
          <>
            {icon}
            {children}
          </>
        )}
      </button>
    )
  }

  if (variant === 'text') {
    return (
      <button className={cn('link-btn', className)} onClick={copy} aria-label={label}>
        {done ? (
          <span className="copy-done">
            <Check size={11} strokeWidth={3} /> 已复制
          </span>
        ) : (
          children ?? label
        )}
      </button>
    )
  }

  return (
    <button className={cn('btn icon sm', className)} onClick={copy} aria-label={label}>
      {/* transitions.dev · icon swap：对勾与复制交叉淡入，占位不变 */}
      <IconSwap open={done} a={<Check size={iconSize} strokeWidth={3} />} b={<Copy size={iconSize} />} />
    </button>
  )
}

/* ---------------- 弹窗 ---------------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  narrow,
  hideHeader,
  formId,
  onSubmit,
  focusOnTouch,
}: {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
  narrow?: boolean
  hideHeader?: boolean
  /** 传了就是表单弹窗：正文包成 <form>，回车即可提交 */
  formId?: string
  onSubmit?: () => void
  /** 触摸端也主动聚焦输入框：只给「打开就是为了打字」的场景（如速记） */
  focusOnTouch?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  // transitions.dev · modal：关闭不立即卸载，先把 data-state 置 closed 再等 --modal-close-dur
  const { mounted, state } = usePresence(open, '--modal-close-dur', 150)
  // onClose 每次都可能是新函数，用 ref 承接，避免输入触发重渲染时副作用重跑、焦点被抢走
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
      if (e.key === 'Tab' && ref.current) {
        const nodes = ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (nodes.length === 0) return
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => {
      const box = ref.current
      if (!box) return
      // 触摸设备默认不主动聚焦输入框：一聚焦就弹键盘，会把弹窗内容顶到屏幕外
      const touch = window.matchMedia('(pointer: coarse)').matches && !focusOnTouch
      const el = touch
        ? box.querySelector<HTMLElement>('.modal-footer .btn.primary, .modal-footer .btn')
        : box.querySelector<HTMLElement>('[data-autofocus]') ??
          box.querySelector<HTMLElement>('.modal-body textarea, .modal-body input:not([type="hidden"]), .modal-body select') ??
          box.querySelector<HTMLElement>('.modal-footer .btn.primary, .modal-footer .btn')
      el?.focus()
    }, 40)
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
    }
  }, [open, focusOnTouch])

  if (!mounted) return null
  return createPortal(
    <div
      className="overlay t-scrim"
      data-state={state}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn('modal t-modal', wide && 'wide', narrow && 'narrow')}
        data-state={state}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        {!hideHeader && (
          <div className="modal-header">
            <h2>{title}</h2>
            <button className="btn icon sm glass-icon" onClick={onClose} aria-label="关闭">
              <GIcon name="close" size={15} />
            </button>
          </div>
        )}
        {onSubmit ? (
          <form
            id={formId}
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault()
              onSubmit()
            }}
          >
            {children}
          </form>
        ) : (
          <div className="modal-body">{children}</div>
        )}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  if (!open) return null
  return createPortal(
    <div className="overlay bottom" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        {title && (
          <div className="modal-header">
            <h2>{title}</h2>
            <button className="btn icon sm glass-icon" onClick={onClose} aria-label="关闭">
              <GIcon name="close" size={15} />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ---------------- 空态 ---------------- */
export function Empty({
  icon,
  title,
  desc,
  action,
}: {
  icon?: React.ReactNode
  title: string
  desc?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h4>{title}</h4>
      {desc && <p>{desc}</p>}
      {action}
    </div>
  )
}

/* ---------------- 下拉菜单 ---------------- */
export function Menu({
  trigger,
  items,
  align = 'right',
}: {
  trigger: (open: () => void, isOpen: boolean) => React.ReactNode
  items: (React.ReactNode | { label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean })[]
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number; origin: string } | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  // transitions.dev · dropdown：menu 从触发器方向生长，关闭时先缩回再卸载
  const { mounted, state } = usePresence(open, '--dropdown-close-dur', 150)

  // 菜单挂在 body 上，按触发元素位置定位：避免被表格/滚动容器裁切
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect()
      if (!a) return
      const box = boxRef.current
      const w = box?.offsetWidth ?? 200
      const h = box?.offsetHeight ?? 0
      const gap = 6
      let left = align === 'right' ? a.right - w : a.left
      left = Math.min(Math.max(8, left), window.innerWidth - w - 8)
      let top = a.bottom + gap
      // 下方空间不够就向上翻转，transform-origin 跟着换到触发器那一侧
      const flipped = !!h && top + h > window.innerHeight - 8
      if (flipped) top = Math.max(8, a.top - h - gap)
      setPos({
        top,
        left,
        minWidth: Math.max(150, a.width),
        origin: `${flipped ? 'bottom' : 'top'}-${align}`,
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, align, items.length])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (boxRef.current?.contains(t) || anchorRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      {/* 规范：dropdown 在 press 时就打开（pointerdown），不等 click 抬手的延迟；
          click 用捕获阶段吃掉，避免再 toggle 一次 */}
      <div
        style={{ display: 'inline-flex' }}
        ref={anchorRef}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          setOpen((v) => !v)
        }}
        onClickCapture={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // 捕获阶段吃掉了 click，键盘 Enter / 空格要单独放行，否则键盘用户打不开菜单
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((v) => !v)
          }
        }}
      >
        {trigger(() => setOpen((v) => !v), open)}
      </div>
      {mounted &&
        createPortal(
          <div
            ref={boxRef}
            className="menu t-dropdown"
            role="menu"
            data-state={state}
            data-origin={pos?.origin ?? 'top-right'}
            style={{
              position: 'fixed',
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              minWidth: pos?.minWidth,
              zIndex: 1200,
              visibility: pos ? 'visible' : 'hidden',
            }}
            onClick={() => setOpen(false)}
          >
            {items.map((item, i) =>
              React.isValidElement(item) ? (
                <React.Fragment key={i}>{item}</React.Fragment>
              ) : (
                <button
                  key={i}
                  role="menuitem"
                  className={(item as { danger?: boolean }).danger ? 'danger' : ''}
                  onClick={(item as { onClick: () => void }).onClick}
                >
                  {(item as { icon?: React.ReactNode }).icon}
                  {(item as { label: string }).label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

export function MenuSeparator() {
  return <div className="sep" />
}
export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="menu-label">{children}</div>
}

/* ---------------- 全局反馈 ---------------- */
export function ToastHost() {
  const toasts = useUI((s) => s.toasts)
  const dismiss = useUI((s) => s.dismissToast)
  if (toasts.length === 0) return null
  const icon = (kind: string) => {
    if (kind === 'success') return <CheckCircle2 size={15} />
    if (kind === 'error') return <XCircle size={15} />
    if (kind === 'warn') return <TriangleAlert size={15} />
    return <Info size={15} />
  }
  return createPortal(
    <div className="toast-wrap" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cn('toast', t.kind)} onClick={() => dismiss(t.id)}>
          {icon(t.kind)}
          <span>{t.text}</span>
        </div>
      ))}
    </div>,
    document.body,
  )
}

export function ConfirmHost() {
  const confirm = useUI((s) => s.confirm)
  const close = useUI((s) => s.closeConfirm)
  if (!confirm) return null
  return (
    <Modal
      open
      narrow
      title={confirm.title}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            {confirm.cancelText ?? '取消'}
          </button>
          {confirm.secondaryText && (
            <button
              className="btn"
              onClick={() => {
                confirm.onSecondary?.()
                close()
              }}
            >
              {confirm.secondaryText}
            </button>
          )}
          <button
            className={cn('btn', confirm.danger ? 'danger' : 'primary')}
            onClick={() => {
              confirm.onConfirm()
              close()
            }}
          >
            {confirm.confirmText ?? '确定'}
          </button>
        </>
      }
    >
      {confirm.message && <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.7 }}>{confirm.message}</p>}
    </Modal>
  )
}

export function PromptHost() {
  const prompt = useUI((s) => s.prompt)
  const close = useUI((s) => s.closePrompt)
  const [value, setValue] = useState('')
  useEffect(() => {
    if (prompt) setValue(prompt.defaultValue ?? '')
  }, [prompt])
  if (!prompt) return null
  return (
    <Modal
      open
      narrow
      title={prompt.title}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            取消
          </button>
          <button
            className="btn primary"
            onClick={() => {
              prompt.onSubmit(value)
              close()
            }}
          >
            {prompt.confirmText ?? '确定'}
          </button>
        </>
      }
    >
      {prompt.message && <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{prompt.message}</p>}
      <input
        className="input"
        type={prompt.type ?? 'text'}
        value={value}
        placeholder={prompt.placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            prompt.onSubmit(value)
            close()
          }
        }}
      />
    </Modal>
  )
}

/* ---------------- 保存状态 ---------------- */
export function SavePill() {
  const pkg = useStore((s) => s.pkg)
  const prefs = useStore((s) => s.prefs)
  const navigate = useUI((s) => s.navigate)
  const setPrefs = useStore((s) => s.setPrefs)
  const label = () => {
    switch (pkg.status) {
      case 'saving':
        return '保存中…'
      case 'dirty':
        return '有未保存更改'
      case 'saved':
        return pkg.fileName ? '已保存到数据包' : '已保存到本地'
      case 'no-file':
        return '未关联本地数据包'
      case 'error':
        return pkg.error || '保存失败'
      default:
        return '本地工作台'
    }
  }
  const cls = cn(
    'save-pill',
    pkg.status === 'dirty' && 'dirty',
    pkg.status === 'error' && 'error',
    pkg.status === 'no-file' && 'no-file',
  )
  return (
    <button
      className={cls}
      title={pkg.fileName ? `${pkg.fileName}${pkg.error ? ` · ${pkg.error}` : ''}` : '当前未关联数据包文件'}
      onClick={() => {
        if (!pkg.fileName) setPrefs({ landingSeen: true })
        navigate('settings', { tab: 'package' })
      }}
    >
      <span className="led" />
      <span>{label()}</span>
    </button>
  )
}

/* ---------------- 分段控件 ---------------- */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: { value: T; label: string; icon?: React.ReactNode }[]
  onChange: (v: T) => void
  ariaLabel?: string
}) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------- 高亮命中片段 ---------------- */
export function Highlight({ text, keyword }: { text: string; keyword: string }) {
  const q = keyword.trim()
  if (!q) return <>{text}</>
  const lower = text.toLowerCase()
  const ql = q.toLowerCase()
  const parts: React.ReactNode[] = []
  let cursor = 0
  let idx = lower.indexOf(ql)
  let key = 0
  while (idx >= 0 && key < 12) {
    parts.push(text.slice(cursor, idx))
    parts.push(<mark key={key++}>{text.slice(idx, idx + q.length)}</mark>)
    cursor = idx + q.length
    idx = lower.indexOf(ql, cursor)
  }
  parts.push(text.slice(cursor))
  return <>{parts}</>
}

export function useBreakpoint(): 'mobile' | 'tablet' | 'desktop' {
  const [bp, setBp] = useState<'mobile' | 'tablet' | 'desktop'>(() =>
    typeof window === 'undefined' ? 'desktop' : window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1200 ? 'tablet' : 'desktop',
  )
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth
      setBp(w < 768 ? 'mobile' : w < 1200 ? 'tablet' : 'desktop')
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return bp
}

export function PageHead({
  title,
  desc,
  actions,
}: {
  title: string
  desc?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="dash-hero">
      <div className="grow">
        <div className="hello">{title}</div>
        {desc && <div className="sub">{desc}</div>}
      </div>
      {actions}
    </div>
  )
}
