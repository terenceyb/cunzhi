import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Database,
  History,
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
import { useUI, type RouteName } from './ui'
import { Avatar, Logo, SavePill, ToastHost, ConfirmHost, PromptHost, useBreakpoint } from './components/ui'
import { IconSwap, TBadge } from './components/motion'
import { GlassTabMenu } from './components/glass/GlassTabMenu'
import { GIcon } from './components/glass/GIcon'
import { OverlayScrollbar } from './components/OverlayScrollbar'
import { UploadHost } from './components/UploadDialog'
import { GlobalSearch } from './components/GlobalSearch'
import { QuickNote } from './components/QuickNote'
import { PersonForm } from './components/PersonForm'
import { FilterPanel } from './components/FilterPanel'
import { ImportWizard } from './components/ImportWizard'
import { Dashboard } from './pages/Dashboard'
import { People } from './pages/People'
import { Interactions } from './pages/Interactions'
import { Settings } from './pages/Settings'
import { ProfilePage } from './pages/Profile'
import { ConflictDialog, LockScreen, UnlockDialog, Welcome } from './pages/Welcome'
import { applyFilter } from './lib/filter'
import { cn, relativeTime } from './lib/utils'

/** 明暗模式 + 主题色 + 对比度：只改 <html data-*>，CSS 变量接管一切 */
function ThemeSync() {
  const theme = useStore((s) => s.prefs.theme ?? 'system')
  const accent = useStore((s) => s.prefs.dashAccent ?? 'mica')
  const accentCustom = useStore((s) => s.prefs.accentCustom ?? '#6f6659')
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
    const root = document.documentElement
    root.dataset.accent = accent
    /* 自定义色不进 CSS 预设表：直接写两个变量，其余规则照样生效 */
    if (accent === 'custom') {
      root.style.setProperty('--accent', accentCustom)
      root.style.setProperty('--accent-soft', `color-mix(in srgb, ${accentCustom} 14%, var(--surface))`)
    } else {
      root.style.removeProperty('--accent')
      root.style.removeProperty('--accent-soft')
    }
  }, [accent, accentCustom])
  useEffect(() => {
    document.documentElement.dataset.contrast = highContrast ? 'high' : 'normal'
  }, [highContrast])
  /* 把当前主题色算成两个 rgb 三元组交给玻璃组件：
     --gts-tint 是壳体白玻璃里掺的那点色，--gts-sel-rgb 是选中胶囊的底色。
     这两处以前写死 255,255,255，所以怎么换主题色导航都是纯白的。 */
  useEffect(() => {
    const root = document.documentElement
    const read = () => {
      const raw = getComputedStyle(root).getPropertyValue('--accent').trim()
      const hex = raw.replace('#', '')
      if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(hex)) return null
      const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
      return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
    }
    const mix = (a: number[], b: number[], t: number) =>
      a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')
    const apply = () => {
      const rgb = read()
      if (!rgb) return
      const dark = root.dataset.theme === 'dark'
      root.style.setProperty('--gts-tint', dark ? mix(rgb, [255, 255, 255], 0.72) : mix(rgb, [255, 255, 255], 0.94))
      root.style.setProperty('--gts-sel-rgb', dark ? mix(rgb, [255, 255, 255], 0.62) : mix(rgb, [255, 255, 255], 0.965))
    }
    apply()
    /* 深浅模式切换后 --accent 会变，重新算一次 */
    const mo = new MutationObserver(apply)
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] })
    return () => mo.disconnect()
  }, [theme, accent, accentCustom])
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
          <div className={cn('content', (route === 'people' || route === 'settings' || route === 'interactions') && 'no-pad')}>
            {route === 'dashboard' && <Dashboard />}
            {route === 'people' && <People />}
            {route === 'interactions' && <Interactions />}
            {route === 'settings' && <Settings />}
            {route === 'profile' && <ProfilePage />}
          </div>
        </div>
        <MobileGlassNav reminderCount={reminderCount} />
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
          <GIcon name="home" size={19} />
          <span>首页</span>
          {reminderCount > 0 && <span className="count">{reminderCount}</span>}
        </button>
        <button className={cn('nav-item', route === 'people' && 'active')} onClick={() => navigate('people')} title="人脉">
          <GIcon name="people" size={19} />
          <span>人脉</span>
          <span className="count">{ctx.persons.length}</span>
        </button>
        <button
          className={cn('nav-item', route === 'interactions' && 'active')}
          onClick={() => navigate('interactions')}
          title="互动"
        >
          <GIcon name="interactions" size={19} />
          <span>互动</span>
          <span className="count">{ctx.timelineEvents.length}</span>
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
          <GIcon name="settings" size={19} />
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
    route === 'dashboard' ? '首页' : route === 'people' ? '人脉' : route === 'interactions' ? '互动' : route === 'settings' ? '设置' : route === 'profile' ? '我的名片' : '存知'

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
      <button className="btn icon glass-icon" onClick={() => useUI.setState({ searchOpen: true })} aria-label="全局搜索">
        <GIcon name="search" size={19} />
      </button>
      <button className="btn icon glass-icon" onClick={() => useUI.setState({ quickNoteOpen: true })} aria-label="速记">
        <GIcon name="note" size={19} />
      </button>
      <button className="btn icon glass-icon" onClick={() => useUI.getState().openPersonForm()} aria-label="新建人脉">
        <GIcon name="plus" size={19} />
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

/** 移动端四个标签：图标用灰阶立体 SVG，无可见文字，靠 aria-label 说明 */
const GLASS_ITEMS = [
  { key: 'home', label: '首页' },
  { key: 'people', label: '人脉' },
  { key: 'interactions', label: '互动记录' },
  { key: 'settings', label: '设置' },
]
const GLASS_ROUTES: RouteName[] = ['dashboard', 'people', 'interactions', 'settings']

/** 右下角圆钮展开的六格：存知里真正会用的动作 */
const GLASS_MENU = [
  { key: 'note', label: '速记', action: 'note' },
  { key: 'people', label: '新建人脉', action: 'person' },
  { key: 'checklist', label: '新建待办', action: 'todo' },
  { key: 'sketch', label: '记录互动', action: 'interaction' },
  { key: 'folder', label: '导入数据', action: 'import' },
  { key: 'scan', label: '全局搜索', action: 'search' },
]

function MobileGlassNav({ reminderCount }: { reminderCount: number }) {
  const route = useUI((s) => s.route)
  const navigate = useUI((s) => s.navigate)
  const effective = route === 'profile' ? 'settings' : route
  const idx = Math.max(0, GLASS_ROUTES.indexOf(effective as RouteName))

  /* 提醒数挂在首页图标上：原来的红点没有丢，只是换成了角标数字语义 */
  void reminderCount

  const runAction = (action: string) => {
    switch (action) {
      case 'note':
        useUI.setState({ quickNoteOpen: true })
        break
      case 'person':
        useUI.getState().openPersonForm()
        break
      case 'todo':
        navigate('dashboard')
        useUI.setState({ todoFormOpen: true })
        break
      case 'interaction':
        navigate('interactions')
        break
      case 'import':
        useUI.setState({ importOpen: true })
        break
      case 'search':
        useUI.setState({ searchOpen: true })
        break
      default:
        break
    }
  }

  return (
    <div className="glass-nav">
      <GlassTabMenu
        items={GLASS_ITEMS}
        menuItems={GLASS_MENU}
        value={idx}
        align="bottom"
        fit="width"
        padBottom={8}
        transparent
        ariaLabel="主导航"
        onChange={(i) => {
          const next = GLASS_ROUTES[i]
          if (next) navigate(next)
        }}
        onAction={runAction}
      />
    </div>
  )
}
