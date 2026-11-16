import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Database,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Users,
} from 'lucide-react'
import { buildCtx, useStore } from './store'
import { useUI } from './ui'
import { Avatar, Logo, SavePill, ToastHost, ConfirmHost, PromptHost, useBreakpoint } from './components/ui'
import { IconSwap, TBadge } from './components/motion'
import { OverlayScrollbar } from './components/OverlayScrollbar'
import { UploadHost } from './components/UploadDialog'
import { GlobalSearch } from './components/GlobalSearch'
import { QuickNote } from './components/QuickNote'
import { PersonForm } from './components/PersonForm'
import { FilterPanel } from './components/FilterPanel'
import { ImportWizard } from './components/ImportWizard'
import { Dashboard } from './pages/Dashboard'
import { People } from './pages/People'
import { Settings } from './pages/Settings'
import { ProfilePage } from './pages/Profile'
import { ConflictDialog, LockScreen, UnlockDialog, Welcome } from './pages/Welcome'
import { applyFilter } from './lib/filter'
import { cn, relativeTime } from './lib/utils'

/** 明暗模式 + 主题色 + 对比度：只改 <html data-*>，CSS 变量接管一切 */
function ThemeSync() {
  const theme = useStore((s) => s.prefs.theme ?? 'system')
  const accent = useStore((s) => s.prefs.dashAccent ?? 'slate')
  const highContrast = useStore((s) => s.prefs.highContrast ?? false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
  useEffect(() => {
    document.documentElement.dataset.accent = accent
  }, [accent])
  useEffect(() => {
    document.documentElement.dataset.contrast = highContrast ? 'high' : 'normal'
  }, [highContrast])
  return null
}

export default function App() {
  const store = useStore()
  const ready = store.ready
  const init = store.init
  const route = useUI((s) => s.route)
  const navigate = useUI((s) => s.navigate)
  const prefs = store.prefs
  const [bootstrapped, setBootstrapped] = useState(false)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    if (!ready || bootstrapped) return
    setBootstrapped(true)
    if (!prefs.landingSeen) navigate('welcome')
  }, [ready, bootstrapped, prefs.landingSeen, navigate])

  // 首次进入的一次性备份提醒（替代原来常驻顶部的横幅）
  useEffect(() => {
    if (!ready || !bootstrapped) return
    if (useStore.getState().prefs.lastBackupAt) return
    if (useStore.getState().persons.length === 0) return
    const KEY = 'cunzhi.idbNoticeAt'
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < 6 * 3600 * 1000) return
    sessionStorage.setItem(KEY, String(Date.now()))
    const t = setTimeout(() => {
      useUI
        .getState()
        .toast('数据只存在这台设备的浏览器里，建议在「设置 → 数据包管理」导出一次数据包做兜底', 'info')
    }, 1400)
    return () => clearTimeout(t)
  }, [ready, bootstrapped])

  // 全局快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useUI.setState({ searchOpen: true })
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        useUI.setState({ quickNoteOpen: true })
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        useUI.getState().openPersonForm()
      } else if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault()
        useStore.getState().undo()
      } else if (e.key === 'Escape' && !typing) {
        const ui = useUI.getState()
        if (ui.detailOpen) ui.closePerson()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 注册 Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(() => undefined)
    }
  }, [])

  const ctx = useMemo(
    () => buildCtx(store),
    [store.persons, store.fieldDefinitions, store.groups, store.tags, store.timelineEvents, store.attachments],
  )

  const reminderCount = useMemo(() => {
    const days = store.settings.reminderPolicy.defaultFrequencyDays
    return store.persons.filter((p) => {
      const last = ctx.timelineEvents
        .filter((e) => e.personId === p.id)
        .map((e) => +new Date(e.occurredAt))
        .sort((a, b) => b - a)[0]
      const base = last ?? +new Date(p.createdAt)
      return (Date.now() - base) / 86400000 >= (p.reminderFrequencyDays ?? days)
    }).length
  }, [store.persons, store.settings.reminderPolicy.defaultFrequencyDays, ctx.timelineEvents])

  if (!ready) {
    return (
      <div className="welcome">
        <div className="welcome-inner" style={{ textAlign: 'center' }}>
          <div className="skeleton" style={{ width: 120, height: 120, borderRadius: 30, margin: '0 auto 18px' }} />
          <div className="skeleton" style={{ width: 260, height: 16, margin: '0 auto 10px' }} />
          <div className="skeleton" style={{ width: 180, height: 12, margin: '0 auto' }} />
        </div>
      </div>
    )
  }

  if (route === 'welcome') {
    return (
      <>
        <ThemeSync />
        <Welcome />
        <ToastHost />
        <ConfirmHost />
        <PromptHost />
        <UnlockDialog />
        <LockScreen />
      </>
    )
  }

  return (
    <>
      <ThemeSync />
      <div className="app">
        <Sidebar ctx={ctx} reminderCount={reminderCount} />
        <div className="main">
          <TopBar />
          <StatusBanners />
          <div className={cn('content', (route === 'people' || route === 'settings') && 'no-pad')}>
            {route === 'dashboard' && <Dashboard />}
            {route === 'people' && <People />}
            {route === 'settings' && <Settings />}
            {route === 'profile' && <ProfilePage />}
          </div>
        </div>
        <BottomTabs reminderCount={reminderCount} />
        <button className="fab" onClick={() => useUI.setState({ quickNoteOpen: true })} aria-label="速记">
          <Sparkles size={20} />
        </button>
      </div>

      <OverlayScrollbar />
      <UploadHost />
      <GlobalSearch />
      <QuickNoteHost />
      <FilterPanel ctx={ctx} />
      <ImportWizard />
      <PersonFormHost />
      <ToastHost />
      <ConfirmHost />
      <PromptHost />
      <UnlockDialog />
      <ConflictDialog />
      <LockScreen />
    </>
  )
}

function QuickNoteHost() {
  // 详情页打开速记时，默认就把这条记录关联到当前联系人
  const detailOpen = useUI((s) => s.detailOpen)
  const selectedId = useUI((s) => s.selectedId)
  const route = useUI((s) => s.route)
  return <QuickNote presetPersonId={detailOpen && route === 'people' ? selectedId : null} />
}

function PersonFormHost() {
  const open = useUI((s) => s.personFormOpen)
  const editingId = useUI((s) => s.editingPersonId)
  const person = useStore((s) => (editingId ? s.persons.find((p) => p.id === editingId) : null))
  const close = useUI((s) => s.closePersonForm)
  return <PersonForm open={open} onClose={close} person={person} />
}

function Sidebar({ ctx, reminderCount }: { ctx: ReturnType<typeof buildCtx>; reminderCount: number }) {
  const route = useUI((s) => s.route)
  const navigate = useUI((s) => s.navigate)
  const collapsed = useUI((s) => s.sidebarCollapsed)
  const applySmartView = useUI((s) => s.applySmartView)
  const activeViewId = useUI((s) => s.activeSmartViewId)
  const profile = useStore((s) => s.settings.profile)
  const attachments = useStore((s) => s.attachments)
  const views = useStore((s) => s.settings.smartViews)
  const settingsTab = useUI((s) => s.settingsTab)
  const avatar = profile.avatarAttachmentId ? attachments[profile.avatarAttachmentId] : undefined

  const counts = useMemo(
    () => Object.fromEntries(views.map((v) => [v.id, applyFilter(ctx.persons, v.filter, ctx).length])),
    [views, ctx],
  )

  return (
    <aside className={cn('sidebar', 't-resize', collapsed && 'collapsed')} aria-label="主导航">
      <div className="sidebar-head">
        <button className="brand" onClick={() => navigate('dashboard')} style={{ flex: 1, textAlign: 'left' }}>
          <Logo size={26} />
          <span>存知</span>
        </button>
        <button
          className="btn icon sm sidebar-collapse-btn"
          onClick={() => useUI.setState({ sidebarCollapsed: !collapsed })}
          aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
        >
          <IconSwap
            open={!collapsed}
            a={<PanelLeftClose size={15} />}
            b={<PanelLeftOpen size={15} />}
          />
        </button>
      </div>

      <div className="sidebar-scroll">
        <button
          className={cn('nav-item', route === 'dashboard' && 'active')}
          onClick={() => navigate('dashboard')}
          title={`首页${reminderCount > 0 ? ` · ${reminderCount} 位待联系` : ''}`}
        >
          <LayoutDashboard size={16} />
          <span>首页</span>
          {reminderCount > 0 && <span className="count">{reminderCount}</span>}
        </button>
        <button className={cn('nav-item', route === 'people' && 'active')} onClick={() => navigate('people')} title="人脉">
          <Users size={16} />
          <span>人脉</span>
          <span className="count">{ctx.persons.length}</span>
        </button>

        <div className="nav-group">智能视图</div>
        {views.map((v) => (
          <button
            key={v.id}
            className={cn('nav-item', route === 'people' && activeViewId === v.id && 'active')}
            onClick={() => {
              applySmartView(v)
              navigate('people')
            }}
            title={v.name}
          >
            <span className="dot-mark" style={{ background: v.color ?? '#5B6573' }} />
            <span className="ellipsis">{v.name}</span>
            <span className="count">{counts[v.id] ?? 0}</span>
          </button>
        ))}

        <div className="nav-group">系统</div>
        <button
          className={cn('nav-item', route === 'settings' && 'active')}
          onClick={() => navigate('settings', { tab: settingsTab })}
          title="设置"
        >
          <SettingsIcon size={16} />
          <span>设置</span>
        </button>
      </div>

      <button className="sidebar-profile" onClick={() => navigate('profile')}>
        <Avatar name={profile.nickname || '我'} src={avatar?.data} size={30} color="#131619" />
        <span className="col grow" style={{ minWidth: 0 }}>
          <span className="name ellipsis" style={{ display: 'block' }}>
            {profile.nickname || '我'}
          </span>
          <span className="sub ellipsis" style={{ display: 'block' }}>
            {profile.company || '我的名片'}
          </span>
        </span>
      </button>
    </aside>
  )
}

function TopBar() {
  const mobile = useBreakpoint() === 'mobile'
  const route = useUI((s) => s.route)
  const navigate = useUI((s) => s.navigate)
  const profile = useStore((s) => s.settings.profile)
  const attachments = useStore((s) => s.attachments)
  const avatar = profile.avatarAttachmentId ? attachments[profile.avatarAttachmentId] : undefined
  const title =
    route === 'dashboard' ? '首页' : route === 'people' ? '人脉' : route === 'settings' ? '设置' : route === 'profile' ? '我的名片' : '存知'

  return (
    <header className="topbar">
      <button className="avatar-btn" onClick={() => navigate('profile')} aria-label="我的名片" style={{ display: 'none' }}>
        <Avatar name={profile.nickname || '我'} src={avatar?.data} size={30} color="#131619" />
      </button>
      {mobile && route === 'dashboard' ? (
        <div className="topbar-brand">
          <Logo size={22} />
          <span>存知</span>
        </div>
      ) : (
        <h1>{title}</h1>
      )}
      <div className="spacer" />
      <div className="topbar-status">
        <SavePill />
      </div>
      <button className="btn icon" onClick={() => useUI.setState({ searchOpen: true })} aria-label="全局搜索">
        <Search size={16} />
      </button>
      <button className="btn icon" onClick={() => useUI.setState({ quickNoteOpen: true })} aria-label="速记">
        <Sparkles size={16} />
      </button>
      <button className="btn icon" onClick={() => useUI.getState().openPersonForm()} aria-label="新建人脉">
        <Plus size={17} />
      </button>
    </header>
  )
}

function StatusBanners() {
  const pkg = useStore((s) => s.pkg)
  const readOnly = useStore((s) => s.readOnly)
  const reauthorize = useStore((s) => s.reauthorize)
  const saveAsFile = useStore((s) => s.savePackageAsFile)

  if (pkg.status === 'error' && pkg.error && !pkg.error.includes('外部修改')) {
    return (
      <div className="banner danger">
        <AlertTriangle size={14} />
        <span className="grow">{pkg.error}</span>
        <button className="btn" onClick={() => void reauthorize()}>
          重试 / 重新授权
        </button>
        <button className="btn" onClick={() => void saveAsFile()}>
          另存为
        </button>
      </div>
    )
  }
  if (readOnly) {
    return (
      <div className="banner">
        <AlertTriangle size={14} />
        <span className="grow">该数据包已在其他标签页打开，当前为只读模式。关闭其他标签页即可恢复写入。</span>
      </div>
    )
  }
  if (pkg.status === 'no-file' && pkg.fileName) {
    return (
      <div className="banner info">
        <AlertTriangle size={14} />
        <span className="grow">本次会话未关联文件：修改已保存在本地，需要手动导出覆盖原数据包。</span>
        <button className="btn" onClick={() => void saveAsFile()}>
          导出覆盖
        </button>
      </div>
    )
  }
  return null
}

function BottomTabs({ reminderCount }: { reminderCount: number }) {
  const route = useUI((s) => s.route)
  const navigate = useUI((s) => s.navigate)
  const items = [
    { key: 'dashboard', label: '首页', icon: <LayoutDashboard size={19} />, badge: reminderCount },
    { key: 'people', label: '人脉', icon: <Users size={19} />, badge: 0 },
    { key: 'settings', label: '设置', icon: <SettingsIcon size={19} />, badge: 0 },
  ] as const
  const isOn = (key: string) => route === key || (key === 'settings' && route === 'profile')
  const activeIdx = Math.max(0, items.findIndex((i) => isOn(i.key)))

  const navRef = useRef<HTMLElement>(null)
  /** 拖动中：指示块的浮点位置（可以为 0.37 这种小数，所以是「无极」的） */
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  /** 按住时那一下折射：key 变化即重播动画 */
  const [lens, setLens] = useState<{ x: number; k: number } | null>(null)
  const drag = useRef({ active: false, startX: 0, moved: false, pointerId: -1 })
  const lensTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (lensTimer.current) window.clearTimeout(lensTimer.current)
    },
    [],
  )

  /** 把屏幕 x 换算成「第几个格子」，小数即格与格之间的位置 */
  const posAt = (clientX: number) => {
    const el = navRef.current
    if (!el) return activeIdx
    const r = el.getBoundingClientRect()
    const inner = Math.max(1, r.width - 10)
    const raw = ((clientX - r.left - 5) / inner) * items.length - 0.5
    return Math.min(items.length - 1, Math.max(0, raw))
  }

  const fireRefract = (clientX: number) => {
    const r = navRef.current?.getBoundingClientRect()
    if (!r) return
    setLens({ x: clientX - r.left, k: Date.now() })
    if (lensTimer.current) window.clearTimeout(lensTimer.current)
    lensTimer.current = window.setTimeout(() => setLens(null), 640)
  }

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { active: true, startX: e.clientX, moved: false, pointerId: e.pointerId }
    navRef.current?.setPointerCapture?.(e.pointerId)
    setDragIdx(posAt(e.clientX))
    fireRefract(e.clientX)
  }

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return
    if (Math.abs(e.clientX - drag.current.startX) > 5) drag.current.moved = true
    setDragIdx(posAt(e.clientX))
  }

  const onUp = (e: React.PointerEvent) => {
    if (!drag.current.active) return
    const target = posAt(e.clientX)
    drag.current.active = false
    navRef.current?.releasePointerCapture?.(drag.current.pointerId)
    setDragIdx(null)
    const next = items[Math.round(target)]
    if (next) navigate(next.key)
  }

  return (
    <nav
      ref={navRef}
      className="bottom-tabs"
      aria-label="底部导航"
      data-drag={dragIdx !== null ? 'true' : 'false'}
      style={{ ['--i' as string]: dragIdx ?? activeIdx, ['--c' as string]: items.length }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {/* 液态玻璃：一层高光膜 + 一层随指针走的折射透镜（都裁在玻璃边缘内） */}
      <span className="tab-glass" aria-hidden>
        <span className="tab-glass-shine" />
        {lens && <span key={lens.k} className="tab-lens" style={{ ['--lx' as string]: `${lens.x}px` }} />}
      </span>
      <span className="tab-pill" aria-hidden />
      {items.map((item, i) => {
        const on = isOn(item.key)
        return (
          <button
            key={item.key}
            className={cn('tab', on && 'active')}
            aria-current={on ? 'page' : undefined}
            onClick={() => {
              // 拖完松手时浏览器还会补一个 click，落在起点那个 tab 上，这里吞掉
              if (drag.current.moved) {
                drag.current.moved = false
                return
              }
              navigate(item.key)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                navigate(item.key)
              }
            }}
            data-on={on ? 'true' : 'false'}
            style={{ ['--ti' as string]: i }}
          >
            <span className="tab-ico">
              {item.icon}
              <TBadge count={item.badge} dotOnly label={item.badge > 0 ? `${item.badge} 位待联系` : undefined} />
            </span>
            <span className="tab-label">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
