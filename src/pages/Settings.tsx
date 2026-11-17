import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  Bell,
  BookLock,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Database,
  Download,
  Eraser,
  Fingerprint,
  FolderClock,
  GripVertical,
  History,
  Import,
  Info,
  Lock,
  Plus,
  Radar,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Shield,
  Smartphone,
  Sun,
  MoonStar,
  Monitor,
  Trash2,
  Upload,
  UserRound,
  Users,
} from 'lucide-react'
import type { DashAccent, FieldDefinition, FieldType, SelectOption, SmartView } from '../types'
import { buildCtx, useStore } from '../store'
import { useUI } from '../ui'
import { useDragSort } from '../components/dragSort'
import { Avatar, Empty, Logo, Modal, PageHead, Switch, useBreakpoint } from '../components/ui'
import { ElasticPanelResize } from '../components/ElasticPanelResize'
import { PanelReveal } from '../components/motion'
import { ProfilePage } from './Profile'
import { Funnel, SaveViewDialog, fieldChoices } from '../components/FilterPanel'
import { computeFunnel } from '../lib/filter'
import { dedupeCandidates, exportCSV } from '../lib/io'
import { buildPersonMeta, personName, personEvents } from '../lib/derive'
import { cn, bytes, formatDateTime, relativeTime } from '../lib/utils'
import { FIELD_TYPE_META } from '../lib/fieldTypes'
import { normalizeChannels } from '../lib/channels'
import { cleanStorage, scanStorage, type StorageReport } from '../lib/storage'
import { downloadText } from '../lib/czdb'

const NAV = [
  { key: 'profile', label: '我的信息', icon: <UserRound size={15} /> },
  { key: 'appearance', label: '外观', icon: <Sun size={15} /> },
  { key: 'fields', label: '字段管理', icon: <Database size={15} /> },
  { key: 'package', label: '数据包管理', icon: <FolderClock size={15} /> },
  { key: 'io', label: '导入导出', icon: <Import size={15} /> },
  { key: 'reminders', label: '提醒策略', icon: <Bell size={15} /> },
  { key: 'views', label: '智能视图', icon: <Fingerprint size={15} /> },
  { key: 'health', label: '数据健康', icon: <Shield size={15} /> },
  { key: 'privacy', label: '隐私与安全', icon: <Lock size={15} /> },
  { key: 'about', label: '关于存知', icon: <Info size={15} /> },
]

const TAB_HINT: Record<string, string> = {
  profile: '昵称、头像、一句话介绍，作为「我」出现在关系网中心',
  appearance: '跟随系统、浅色或深色，即时生效',
  fields: '增删字段、改显示名、调整顺序与必填可见',
  package: '当前数据包、实时回写、加密与快照',
  io: 'CSV / vCard 导入，数据包与 JSON 导出',
  reminders: '默认走动频率、纪念日提前天数',
  views: '智能视图的筛选条件、颜色与提醒频率',
  health: '缺电话、缺头像、疑似重复等 7 项体检',
  privacy: '应用锁、数据清除、本地优先说明',
  about: '版本号、开发者与官网',
}

export function Settings() {
  const tab = useUI((s) => s.settingsTab)
  const openTab = useUI((s) => s.openSettingsTab)
  const detail = useUI((s) => s.settingsDetail)
  const backToIndex = useUI((s) => s.backToSettingsIndex)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /* 每个分组的正文，桌面与移动端共用同一份 */
  const renderPanel = (key: string) => (
    <>
      {key === 'profile' && <ProfilePage />}
      {key === 'appearance' && <AppearanceSettings />}
      {key === 'fields' && <FieldsSettings />}
      {key === 'package' && <PackageSettings />}
      {key === 'io' && <IOSettings />}
      {key === 'reminders' && <ReminderSettings />}
      {key === 'views' && <ViewsSettings />}
      {key === 'health' && <HealthSettings />}
      {key === 'privacy' && <PrivacySettings />}
      {key === 'about' && <AboutSettings />}
    </>
  )

  /* 移动端：两级结构。
     一级是一张分组的清单（图标 + 名称 + 一句说明 + 右箭头），
     点哪一条进哪一页，页面顶部留返回；从底部导航进设置永远落回这张清单。 */
  if (isMobile) {
    if (!detail) {
      return (
        <div className="settings-index">
          <ul className="settings-list">
            {NAV.map((n) => (
              <li key={n.key}>
                <button className="settings-item" onClick={() => openTab(n.key)}>
                  <span className="settings-item-icon" aria-hidden="true">
                    {n.icon}
                  </span>
                  <span className="settings-item-text">
                    <span className="settings-item-label">{n.label}</span>
                    <span className="settings-item-hint">{TAB_HINT[n.key]}</span>
                  </span>
                  <ChevronRight size={17} className="settings-item-arrow" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )
    }

    return (
      <div className="settings-detail">
        {/* 标题交给正文自己出（各分页本来就有大标题），这里只放回上层的入口，
            否则「字段管理」会在同一屏出现两次 */}
        <div className="settings-detail-head">
          <button className="btn icon sm glass-icon" onClick={backToIndex} aria-label="返回设置清单">
            <ChevronLeft size={17} />
          </button>
          <button className="settings-detail-crumb" onClick={backToIndex}>
            设置
          </button>
        </div>
        <div className="settings-detail-body" key={tab}>
          {renderPanel(tab)}
        </div>
      </div>
    )
  }

  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="设置导航">
        {NAV.map((n) => (
          <button
            key={n.key}
            className={cn('nav-item', tab === n.key && 'active')}
            onClick={() => openTab(n.key)}
          >
            {n.icon}
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      <PanelReveal key={tab} className="settings-content">
        {renderPanel(tab)}
      </PanelReveal>
    </div>
  )
}

/* ================= 外观 ================= */
const ACCENTS: { key: DashAccent; label: string; color: string }[] = [
  { key: 'snow', label: '素白', color: '#dfe3ea' },
  { key: 'mica', label: '云母', color: '#6f6659' },
  { key: 'slate', label: '靛蓝', color: '#2f6feb' },
  { key: 'sand', label: '暖沙', color: '#a9772c' },
  { key: 'forest', label: '松绿', color: '#1e7a58' },
  { key: 'ocean', label: '远海', color: '#1c6ea6' },
  { key: 'plum', label: '梅紫', color: '#7b4a9d' },
  { key: 'coral', label: '珊瑚', color: '#b8553f' },
  { key: 'bamboo', label: '竹青', color: '#4f7a4a' },
]

const THEMES = [
  { key: 'system', label: '跟随系统', desc: '随手机或电脑的浅色 / 深色设置自动切换', icon: <Monitor size={18} /> },
  { key: 'light', label: '浅色', desc: '白底灰阶，白天与投屏时更清晰', icon: <Sun size={18} /> },
  { key: 'dark', label: '深色', desc: '墨底低调，夜里看不刺眼', icon: <MoonStar size={18} /> },
] as const

const DASH_LABEL: Record<string, string> = { todos: '待办事项', reminders: '走动提醒', anniversaries: '纪念日' }

function AppearanceSettings() {
  const isMobileLayout = useBreakpoint() === 'mobile'
  const theme = useStore((s) => s.prefs.theme ?? 'system')
  const accent = useStore((s) => s.prefs.dashAccent ?? 'mica')
  const accentCustom = useStore((s) => s.prefs.accentCustom ?? '#6f6659')
  const highContrast = useStore((s) => s.prefs.highContrast ?? false)
  const mobileOrder = useStore((s) => s.prefs.dashMobileOrder)
  const setPrefs = useStore((s) => s.setPrefs)
  const toast = useUI((s) => s.toast)
  const move = (i: number, dir: -1 | 1) => {
    const next = [...mobileOrder]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setPrefs({ dashMobileOrder: next })
  }
  return (
    <div className="settings-section">
      <h2>外观</h2>
      <p className="desc">模式只影响这台设备的显示，不改动任何数据；切换后立即生效。</p>
      <div className="set-card">
        <div className="theme-list">
          {THEMES.map((t) => (
            <button
              key={t.key}
              className={cn('theme-opt', theme === t.key && 'on')}
              aria-pressed={theme === t.key}
              title={t.desc}
              onClick={() => {
                setPrefs({ theme: t.key })
                toast(`已切换到${t.label}`, 'success')
              }}
            >
              <span className="theme-ico">{t.icon}</span>
              <span className="theme-label">{t.label}</span>
              <span className="theme-tick">{theme === t.key && <Check size={14} />}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="set-card" style={{ marginTop: 14 }}>
        <div className="set-card-head">
          <h3>主题色</h3>
          <span className="field-hint">全局强调色：按钮、选中态、图标、图表都跟着变</span>
        </div>
        <div className="accent-row">
          {ACCENTS.map((a) => (
            <button
              key={a.key}
              className={cn('accent-dot', accent === a.key && 'on')}
              aria-pressed={accent === a.key}
              aria-label={a.label}
              title={a.label}
              onClick={() => {
                setPrefs({ dashAccent: a.key })
                toast(`主题色已切换为${a.label}`, 'success')
              }}
            >
              <span style={{ background: a.color }} />
              {a.label}
            </button>
          ))}
          {/* 自定义：调色盘里给不出想要的色相时，直接取一个 */}
          <label
            className={cn('accent-dot accent-custom', accent === 'custom' && 'on')}
            title="自定义主题色"
          >
            <input
              type="color"
              value={accentCustom}
              aria-label="自定义主题色"
              onChange={(e) => {
                setPrefs({ dashAccent: 'custom', accentCustom: e.target.value })
              }}
            />
            <span style={{ background: accentCustom }} />
            自定义
          </label>
        </div>
        <p className="field-hint accent-hint">
          默认是「素白」——几乎无彩的冷灰，白底上最不抢内容；换任何颜色，按钮、选中态、图标、图表都会跟着走。
        </p>
      </div>

      {/* 提高对比度：把文字、描边、浅底都加深一档，强光下更好认 */}
      <div className="set-card" style={{ marginTop: 14 }}>
        <div className="set-card-body">
          <div className="set-row">
            <div>
              <div className="lbl">提高全局对比度</div>
              <div className="hint">文字更深、描边更实、浅底更灰；弱光或投影环境下层次更清楚</div>
            </div>
            <Switch
              on={highContrast}
              onChange={(v) => {
                setPrefs({ highContrast: v })
                toast(v ? '已提高全局对比度' : '已恢复默认对比度', 'success')
              }}
              label="提高全局对比度"
            />
          </div>
        </div>
      </div>

      {isMobileLayout && (
      <div className="set-card" style={{ marginTop: 14 }}>
        <div className="set-card-head">
          <h3>首页卡片顺序</h3>
          <span className="field-hint">只影响手机上首页的排列</span>
        </div>
        <div className="order-list">
          {mobileOrder.map((k, i) => (
            <div className="order-row" key={k}>
              <span className="order-index">{i + 1}</span>
              <span className="grow">{DASH_LABEL[k] ?? k}</span>
              <button className="btn icon sm" aria-label="上移" disabled={i === 0} onClick={() => move(i, -1)}>
                <ChevronUp size={14} />
              </button>
              <button
                className="btn icon sm"
                aria-label="下移"
                disabled={i === mobileOrder.length - 1}
                onClick={() => move(i, 1)}
              >
                <ChevronDown size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  )
}

/* ================= 字段管理 ================= */
function FieldsSettings() {
  const store = useStore()
  const ctx = useMemo(() => buildCtx(store), [store.persons, store.fieldDefinitions, store.groups, store.tags, store.timelineEvents, store.attachments])
  const updateField = store.updateField
  const deleteField = store.deleteField
  const reorderFields = store.reorderFields
  const [dialogDef, setDialogDef] = useState<FieldDefinition | null>(null)
  const [configDef, setConfigDef] = useState<FieldDefinition | null>(null)
  const [creating, setCreating] = useState(false)
  const ordered = useMemo(
    () => [...store.fieldDefinitions].sort((a, b) => a.sortOrder - b.sortOrder),
    [store.fieldDefinitions],
  )
  const { containerRef: fieldListRef, activeKey, gripProps } = useDragSort({
    keys: ordered.map((d) => d.key),
    onReorder: (from, to) => {
      const keys = ordered.map((d) => d.key)
      keys.splice(to, 0, keys.splice(from, 1)[0])
      reorderFields(keys)
    },
  })
  const toast = useUI((s) => s.toast)
  const askConfirm = useUI((s) => s.askConfirm)

  const usage = (key: string) => store.persons.filter((p) => {
    const v = p.fields[key]
    return v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
  }).length

  return (
    <div className="settings-section">
      <h2>字段管理</h2>
      <p className="desc">
        字段定义与字段值分离。14 个默认字段构成数据骨架，其中姓名、电话、互动记录、引荐人为锁定字段——不可删除、不可改类型与 `key`，但可以改显示名与展示顺序。
      </p>

      <div className="set-card">
        <div className="set-card-head">
          <h3>字段列表（{store.fieldDefinitions.length}）</h3>
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn sm"
              onClick={() => {
                const payload = {
                  magic: 'CZDB-FIELDS',
                  version: 1,
                  exportedAt: new Date().toISOString(),
                  fieldDefinitions: store.fieldDefinitions,
                }
                downloadText(JSON.stringify(payload, null, 2), `存知_字段定义_${Date.now()}.json`, 'application/json')
                toast('已导出字段定义清单（不含人脉数据）', 'success')
              }}
            >
              <Download size={13} /> 导出定义
            </button>
            <button className="btn sm primary" onClick={() => setCreating(true)}>
              <Plus size={13} /> 新增字段
            </button>
          </div>
        </div>
        <div ref={fieldListRef} className="fm-sort-list">
          {ordered.map((def) => (
              <React.Fragment key={def.key}>
              <div
                className={cn('field-manage-row', activeKey === def.key && 'dragging')}
                data-sort-key={def.key}
              >
                <span className="grip" role="button" title="按住拖动，调整详情页字段顺序" {...gripProps(def.key)}>
                  <GripVertical size={13} />
                </span>
                <div className="fm-info">
                  <div className="fm-name-line">
                    <input
                      className="cell-edit fm-name"
                      style={{ fontWeight: 500, width: `calc(${Math.max(2, def.label.length)}em + 1.6em)` }}
                      defaultValue={def.label}
                      readOnly={def.isLocked}
                      aria-readonly={def.isLocked}
                      title={def.isLocked ? '锁定字段不可修改名称' : '点击修改显示名'}
                      onBlur={(e) => {
                        if (def.isLocked) return
                        const v = e.target.value.trim()
                        if (v && v !== def.label) {
                          updateField(def.key, { label: v })
                          toast('显示名已更新，所有详情页即时生效', 'success')
                        }
                      }}
                    />
                    {def.isLocked && (
                      <span className="flag lock" title="锁定字段：名称、类型、key 均不可改">
                        锁定
                      </span>
                    )}
                    {def.disabled && <span className="flag">已禁用</span>}
                    {(def.key === 'phones' || def.type === 'select' || def.type === 'multiselect') && (
                      <button
                        type="button"
                        className="fm-manage-hint"
                        onClick={() => setConfigDef(def)}
                        title={def.key === 'phones' ? '管理联系方式的每个下级通道' : '集中管理这个字段的选项'}
                      >
                        {def.key === 'phones' ? '通道管理' : '选项管理'}
                      </button>
                    )}
                  </div>
                  <div className="ftype">
                    {FIELD_TYPE_META[def.type]?.label ?? def.type} · 使用 {usage(def.key)} 人
                  </div>
                </div>
                <div className={cn('fm-switches', def.isLocked && 'locked')}>
                  <label className="fm-switch">
                    <span>必填</span>
                    <Switch
                      small
                      on={def.required}
                      onChange={(v) => !def.isLocked && updateField(def.key, { required: v })}
                      label={`${def.label}必填`}
                    />
                  </label>
                  <label className="fm-switch">
                    <span>可见</span>
                    <Switch
                      small
                      on={def.visible}
                      onChange={(v) => !def.isLocked && updateField(def.key, { visible: v })}
                      label={`${def.label}可见`}
                    />
                  </label>
                </div>
                <div className="ops">
                  {/* 圆圈 i：承载「这个字段自己的那点东西」——联系方式的通道、单选多选的选项 */}
                  <button
                    className="btn icon sm fm-config-btn"
                    disabled={def.isLocked && def.key !== 'phones'}
                    onClick={() =>
                      def.key === 'phones' || def.type === 'select' || def.type === 'multiselect'
                        ? setConfigDef(def)
                        : setDialogDef(def)
                    }
                    title={
                      def.key === 'phones'
                        ? '联系方式：管理下级通道'
                        : def.type === 'select' || def.type === 'multiselect'
                          ? '管理选项'
                          : def.isLocked
                            ? '锁定字段不可编辑配置'
                            : '编辑字段配置'
                    }
                    aria-label={
                      def.key === 'phones'
                        ? '联系方式：管理下级通道'
                        : def.type === 'select' || def.type === 'multiselect'
                          ? '管理选项'
                          : '编辑字段配置'
                    }
                  >
                    <Info size={14} />
                  </button>
                  {/* 禁用态不加 tooltip：禁用按钮不在 tab 序列里，键盘/读屏拿不到说明，
                      原因写在上面那行的 ftype-note 里 */}
                  <button
                    className="btn icon sm"
                    disabled={def.isLocked}
                    aria-label={def.isLocked ? '锁定字段不可禁用' : def.disabled ? '启用字段' : '禁用字段（不删除数据）'}
                    onClick={() => {
                      if (def.isLocked) return
                      updateField(def.key, { disabled: !def.disabled })
                      toast(def.disabled ? '字段已启用' : '字段已禁用，数据保留', 'success')
                    }}
                  >
                    {def.disabled ? <RotateCcw size={13} /> : <Ban size={13} />}
                  </button>
                  <button
                    className="btn icon sm"
                    disabled={def.isLocked}
                    aria-label={def.isLocked ? '锁定字段不可删除' : '删除字段'}
                    onClick={() => {
                      if (def.isLocked) return
                      askConfirm({
                        title: `删除字段「${def.label}」？`,
                        message: `将影响 ${usage(def.key)} 条记录的该字段数据，数据会被永久删除。删除前会自动生成本地快照（保留 7 天）。建议优先选择「禁用字段」——不删数据、只隐藏。`,
                        confirmText: '仍然删除',
                        danger: true,
                        secondaryText: '改为禁用（推荐）',
                        onSecondary: () => {
                          updateField(def.key, { disabled: true })
                          toast('字段已禁用，数据保留', 'success')
                        },
                        onConfirm: () => {
                          deleteField(def.key)
                          toast('字段已删除，快照已生成', 'success')
                        },
                      })
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              </React.Fragment>
            ))}
        </div>
      </div>

      {(creating || dialogDef) && (
        <FieldDialog
          def={dialogDef}
          open
          onClose={() => {
            setCreating(false)
            setDialogDef(null)
          }}
        />
      )}
      <FieldConfigDialog def={configDef} onClose={() => setConfigDef(null)} />
    </div>
  )
}

/* 单选 / 多选的选项库：集中增删排序，详情页、新建弹窗、筛选共用同一份 */
function OptionsEditor({ def }: { def: FieldDefinition }) {
  const updateField = useStore((s) => s.updateField)
  const toast = useUI((s) => s.toast)
  const [draft, setDraft] = useState('')
  const options = def.config.options ?? []

  const write = (next: typeof options) => updateField(def.key, { config: { ...def.config, options: next } })
  const { containerRef, activeKey, gripProps } = useDragSort({
    keys: options.map((o) => o.id),
    onReorder: (from, to) => {
      const next = [...options]
      next.splice(to, 0, next.splice(from, 1)[0])
      write(next)
    },
  })

  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (options.some((o) => o.label.trim().toLowerCase() === v.toLowerCase())) {
      toast(`「${v}」已存在，无需重复添加`, 'info')
      return
    }
    write([...options, { id: `opt_${Date.now().toString(36)}`, label: v, color: '' }])
    toast(`已添加选项「${v}」`, 'success')
    setDraft('')
  }

  return (
    <div className="fm-sub-body fm-sub-body--flat fm-sort-list" ref={containerRef}>
      {options.length === 0 && <p className="field-hint">还没有选项，先添加几个，填写时就能直接选。</p>}
      {options.map((o) => (
        <div
          className={cn('fm-sub-row fm-opt-row', activeKey === o.id && 'dragging')}
          key={o.id}
          data-sort-key={o.id}
        >
          <span className="grip grip--sub" role="button" title="按住拖动调整选项顺序" {...gripProps(o.id)}>
            <GripVertical size={12} />
          </span>
          <span className="fm-opt-color" style={{ background: o.color || 'var(--line-strong)' }} aria-hidden />
          <input
            className="cell-edit fm-sub-name"
            defaultValue={o.label}
            aria-label={`选项 ${o.label}`}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (!v) {
                e.target.value = o.label
                return
              }
              if (v === o.label) return
              if (options.some((x) => x.id !== o.id && x.label.trim().toLowerCase() === v.toLowerCase())) {
                toast(`「${v}」已存在`, 'info')
                e.target.value = o.label
                return
              }
              write(options.map((x) => (x.id === o.id ? { ...x, label: v } : x)))
            }}
          />
          <div className="fm-sub-ops">
            <button
              className="btn icon sm"
              aria-label={`删除选项 ${o.label}`}
              disabled={def.isLocked}
              onClick={() => write(options.filter((x) => x.id !== o.id))}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ))}
      <div className="fm-opt-add">
        <input
          className="input sm"
          value={draft}
          placeholder="输入新选项后回车"
          aria-label="新选项名称"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button className="btn sm" onClick={add}>
          <Plus size={13} /> 添加
        </button>
      </div>
      <p className="field-hint fm-sub-tip">改动立刻反映到详情页、新建弹窗与筛选条件；重名会被拦下。</p>
    </div>
  )
}

/* 联系方式的下级通道：只在本级排序，不影响上级字段顺序 */
function ChannelsEditor() {
  const channels = useStore((s) => normalizeChannels(s.settings.contactChannels))
  const setChannels = useStore((s) => s.setContactChannels)
  const askPrompt = useUI((s) => s.askPrompt)
  const toast = useUI((s) => s.toast)

  const patch = (id: string, next: Partial<{ label: string; kind: 'tel' | 'im'; visible: boolean }>) =>
    setChannels(channels.map((c) => (c.id === id ? { ...c, ...next } : c)))
  const { containerRef, activeKey, gripProps } = useDragSort({
    keys: channels.map((c) => c.id),
    onReorder: (from, to) => {
      const next = [...channels]
      next.splice(to, 0, next.splice(from, 1)[0])
      setChannels(next)
    },
  })
  const add = () =>
    askPrompt({
      title: '新增联系方式通道',
      message: '例如：Line、Instagram、企业微信。新通道只出现在「联系方式」下面，不占用上级字段。',
      placeholder: '通道名称',
      confirmText: '添加',
      onSubmit: (v) => {
        const label = (v ?? '').trim()
        if (!label) return
        setChannels([
          ...channels,
          { id: `ch_${Date.now().toString(36)}`, label, kind: 'im', visible: true, hint: `填写${label}` },
        ])
        toast(`已添加「${label}」`, 'success')
      },
    })

  return (
    <div className="fm-sub-body fm-sub-body--flat fm-sort-list" ref={containerRef}>
      {channels.map((c) => (
        <div className={cn('fm-sub-row', activeKey === c.id && 'dragging')} key={c.id} data-sort-key={c.id}>
          <span className="grip grip--sub" role="button" title="按住拖动调整通道顺序" {...gripProps(c.id)}>
            <GripVertical size={12} />
          </span>
          <input
            className="cell-edit fm-sub-name"
            defaultValue={c.label}
            aria-label={`${c.label} 名称`}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== c.label) patch(c.id, { label: v })
            }}
          />
          <button
            className={cn('fm-sub-kind', c.kind === 'tel' && 'tel')}
            title="切换类型：电话类可拨号，网络通联类只能复制"
            onClick={() => patch(c.id, { kind: c.kind === 'tel' ? 'im' : 'tel' })}
          >
            {c.kind === 'tel' ? '电话' : '网络'}
          </button>
          <label className="fm-switch">
            <span>可见</span>
            <Switch small on={c.visible} onChange={(v) => patch(c.id, { visible: v })} label={`${c.label}可见`} />
          </label>
          <div className="fm-sub-ops">
            <button
              className="btn icon sm"
              aria-label={`删除${c.label}`}
              disabled={channels.length <= 1}
              onClick={() => setChannels(channels.filter((x) => x.id !== c.id))}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ))}
      <button className="btn sm ghost fm-sub-add" onClick={add}>
        <Plus size={13} /> 新增通道
      </button>
      <p className="field-hint fm-sub-tip">
        排序只作用于联系方式内部，不会改变「联系方式」在详情页的位置。默认只展示「手机」「微信」，其余填过才出现在名片上。
      </p>
    </div>
  )
}

/* 圆圈 i 打开的抽屉：联系方式 → 通道管理；单选/多选 → 选项管理 */
function FieldConfigDialog({ def, onClose }: { def: FieldDefinition | null; onClose: () => void }) {
  /* 弹窗打开后字段定义会被更新（增删选项、改顺序），必须跟着 store 取最新那份，
     否则界面一直显示打开瞬间的旧快照，看起来像"改了没生效" */
  const live = useStore((s) => (def ? s.fieldDefinitions.find((d) => d.key === def.key) : undefined))
  const current = live ?? def
  if (!current) return null
  const isPhones = current.key === 'phones'
  const isSelect = current.type === 'select' || current.type === 'multiselect'
  return (
    <Modal
      open
      onClose={onClose}
      title={isPhones ? '联系方式 · 下级通道' : `选项管理 · ${current.label}`}
      footer={
        <button className="btn primary" onClick={onClose}>
          完成
        </button>
      }
    >
      <p className="field-hint" style={{ marginBottom: 12 }}>
        {isPhones
          ? '每个通道都会成为「联系方式」下面的一行。改名字、切类型、调顺序都在这里，详情页与新建弹窗即时同步。'
          : '选项集中在这里维护。改动立刻反映到详情页、新建弹窗与筛选条件；重名会被拦下。'}
      </p>
      {isPhones ? <ChannelsEditor /> : isSelect ? <OptionsEditor def={current} /> : null}
    </Modal>
  )
}

const TYPE_ORDER: FieldType[] = [
  'text', 'longtext', 'select', 'multiselect', 'date', 'number', 'checkbox', 'link',
  'attachment', 'phone', 'email', 'address', 'barcode', 'personRef',
]

function FieldDialog({ def, open, onClose }: { def: FieldDefinition | null; open: boolean; onClose: () => void }) {
  const addField = useStore((s) => s.addField)
  const updateField = useStore((s) => s.updateField)
  const [type, setType] = useState<FieldType>(def?.type ?? 'text')
  const [label, setLabel] = useState(def?.label ?? '')
  const [step, setStep] = useState(def ? 2 : 1)
  const [options, setOptions] = useState<SelectOption[]>(def?.config.options ?? [])
  const [maxLength, setMaxLength] = useState(def?.config.maxLength ?? 200)
  const [decimals, setDecimals] = useState(def?.config.decimals ?? 0)
  const [unit, setUnit] = useState<'none' | 'percent' | 'custom'>(def?.config.unit ?? 'none')
  const [unitText, setUnitText] = useState(def?.config.unitText ?? '')
  const [dateFormat, setDateFormat] = useState(def?.config.dateFormat ?? 'YYYY-MM-DD')
  const [hasTime, setHasTime] = useState(def?.config.hasTime ?? false)
  const [multiple, setMultiple] = useState(def?.config.multiple ?? (type === 'personRef' ? false : true))
  const [required, setRequired] = useState(def?.required ?? false)
  const [visible, setVisible] = useState(def?.visible ?? true)
  const toast = useUI((s) => s.toast)
  const meta = FIELD_TYPE_META[type]

  const save = () => {
    if (!label.trim()) {
      toast('请填写字段名称', 'error')
      return
    }
    const config: FieldDefinition['config'] = {}
    if (type === 'text') config.maxLength = maxLength
    if (type === 'longtext') config.maxLength = maxLength
    if (type === 'select' || type === 'multiselect') config.options = options
    if (type === 'date') {
      config.dateFormat = dateFormat as FieldDefinition['config']['dateFormat']
      config.hasTime = hasTime
    }
    if (type === 'number') {
      config.decimals = decimals
      config.unit = unit
      config.unitText = unitText
    }
    if (type === 'personRef') config.multiple = multiple
    if (type === 'attachment') {
      config.multiple = multiple
      config.maxFiles = multiple ? 50 : 1
    }
    if (def) {
      updateField(def.key, { label: label.trim(), config: { ...def.config, ...config }, required, visible })
      toast('字段配置已更新', 'success')
    } else {
      addField({
        key: `custom_${Date.now().toString(36)}`,
        label: label.trim(),
        type,
        required,
        visible,
        sortOrder: 100 + Math.floor(Date.now() % 1000),
        isBuiltIn: false,
        isLocked: false,
        group: type === 'phone' || type === 'email' || type === 'address' ? 'contact' : 'custom',
        config,
      })
      toast('字段已创建', 'success')
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={def ? `字段配置：${def.label}` : '新增字段'}
      footer={
        <>
          {step === 2 && !def && (
            <button className="btn ghost left" onClick={() => setStep(1)}>
              上一步
            </button>
          )}
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={() => (step === 1 ? (label ? setStep(2) : toast('请填写名称', 'error')) : save())}>
            {step === 1 ? '下一步' : '保存'}
          </button>
        </>
      }
    >
      {step === 1 ? (
        <>
          <p className="field-hint" style={{ marginBottom: 12 }}>
            字段类型决定存储格式、校验方式、渲染形态、导出映射和筛选能力。创建后类型不可更改。
          </p>
          <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>
            {TYPE_ORDER.map((t) => {
              const m = FIELD_TYPE_META[t]
              return (
                <button
                  key={t}
                  className="card pad"
                  style={{
                    textAlign: 'left',
                    borderColor: type === t ? 'var(--accent)' : undefined,
                    boxShadow: type === t ? '0 0 0 2px rgba(47,111,235,.15)' : undefined,
                    cursor: 'pointer',
                  }}
                  onClick={() => setType(t)}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</div>
                  <div className="field-hint" style={{ lineHeight: 1.5, marginTop: 2 }}>{m.desc}</div>
                </button>
              )
            })}
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <span className="field-label">字段名称</span>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`例如：${meta.example}`} />
          </div>
        </>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          <div className="row between">
            <span className="chip accent">{meta.label}</span>
            <span className="field-hint">{def ? `key: ${def.key}（不可修改）` : '将自动生成稳定 key'}</span>
          </div>
          <div className="field">
            <span className="field-label">字段名称</span>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>

          {(type === 'select' || type === 'multiselect') && (
            <div className="field">
              <span className="field-label">选项</span>
              <div className="option-list">
                {options.map((o, i) => (
                  <div className="option-row" key={o.id}>
                    <input
                      type="color"
                      className="color-swatch"
                      value={o.color}
                      onChange={(e) => {
                        const next = [...options]
                        next[i] = { ...o, color: e.target.value }
                        setOptions(next)
                      }}
                      aria-label="选项颜色"
                    />
                    <input
                      className="input sm"
                      value={o.label}
                      onChange={(e) => {
                        const next = [...options]
                        next[i] = { ...o, label: e.target.value }
                        setOptions(next)
                      }}
                    />
                    <button className="btn icon sm" onClick={() => setOptions(options.filter((x) => x.id !== o.id))} aria-label="删除选项">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button
                  className="btn sm ghost"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() =>
                    setOptions([
                      ...options,
                      { id: `opt_${Date.now().toString(36)}`, label: '新选项', color: '#2F6FEB' },
                    ])
                  }
                >
                  <Plus size={13} /> 添加选项
                </button>
              </div>
              <span className="field-hint">删除已使用的选项后，已有数据会标记为「失效选项」并提示重选，数据不丢失。</span>
            </div>
          )}

          {(type === 'text' || type === 'longtext') && (
            <div className="field">
              <span className="field-label">最大长度</span>
              <input className="input" type="number" value={maxLength} onChange={(e) => setMaxLength(Number(e.target.value))} />
            </div>
          )}

          {type === 'date' && (
            <>
              <div className="field">
                <span className="field-label">日期格式（仅影响展示，存储始终为 ISO 8601）</span>
                <select className="input" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as never)}>
                  <option value="YYYY-MM-DD">2024-06-15</option>
                  <option value="YYYY年M月D日">2024年6月15日</option>
                  <option value="MM/DD/YYYY">06/15/2024</option>
                  <option value="DD/MM/YYYY">15/06/2024</option>
                </select>
              </div>
              <div className="set-row">
                <span className="lbl">包含时间</span>
                <Switch on={hasTime} onChange={setHasTime} />
              </div>
            </>
          )}

          {type === 'number' && (
            <>
              <div className="field">
                <span className="field-label">小数位（0–6）</span>
                <input className="input" type="number" min={0} max={6} value={decimals} onChange={(e) => setDecimals(Math.min(6, Math.max(0, Number(e.target.value))))} />
              </div>
              <div className="field">
                <span className="field-label">单位</span>
                <div className="row" style={{ gap: 6 }}>
                  <select className="input" style={{ maxWidth: 140 }} value={unit} onChange={(e) => setUnit(e.target.value as never)}>
                    <option value="none">无单位</option>
                    <option value="percent">百分比 %</option>
                    <option value="custom">自定义后缀</option>
                  </select>
                  {unit === 'custom' && (
                    <input className="input" style={{ maxWidth: 120 }} value={unitText} onChange={(e) => setUnitText(e.target.value)} placeholder="万元 / 人 / 年" />
                  )}
                </div>
              </div>
            </>
          )}

          {(type === 'personRef' || type === 'attachment') && (
            <div className="set-row">
              <div>
                <div className="lbl">允许多值</div>
                <div className="hint">{type === 'personRef' ? '可关联多个人脉（如「共同好友」）' : '单字段最多 50 个附件'}</div>
              </div>
              <Switch on={multiple} onChange={setMultiple} />
            </div>
          )}

          <div className="set-row">
            <div>
              <div className="lbl">必填</div>
              <div className="hint">新建人脉时未填写将阻止保存</div>
            </div>
            <Switch on={required} onChange={setRequired} />
          </div>
          <div className="set-row">
            <div>
              <div className="lbl">在详情页展示</div>
              <div className="hint">关闭后详情页与名片卡不再展示，数据保留</div>
            </div>
            <Switch on={visible} onChange={setVisible} />
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ================= 数据包管理 ================= */
function PackageSettings() {
  const store = useStore()
  const pkg = store.pkg
  const snapshots = store.snapshots
  const toast = useUI((s) => s.toast)
  const askConfirm = useUI((s) => s.askConfirm)
  const askPrompt = useUI((s) => s.askPrompt)
  const [busy, setBusy] = useState(false)
  const [tipsOpen, setTipsOpen] = useState(false)
  const size = useMemo(() => bytes(JSON.stringify(store.persons).length + JSON.stringify(store.attachments).length), [store.persons, store.attachments])

  return (
    <div className="settings-section">
      <h2>数据包管理</h2>

      {!pkg.hasHandle && (
        <div className="banner info" style={{ borderRadius: 12, border: '1px solid #cfdefa' }}>
          <Info size={14} />
          {typeof window !== 'undefined' && 'showOpenFilePicker' in window
            ? '当前未关联数据包文件，数据仅保存在浏览器 IndexedDB 中。建议打开或新建一个 .czdb 数据包，让数据成为可搬运的实体文件。'
            : '当前浏览器不支持 File System Access API，将以「导出覆盖」方式保存数据包。手机端定位为数据包的查看器与速记器。'}
        </div>
      )}

      <div className="set-card">
        <div className="set-card-head">
          <h3>当前数据包</h3>
          <span className={cn('save-pill', pkg.status === 'error' && 'error')}>
            <span className="led" />
            {pkg.status === 'saved' ? '已保存' : pkg.status === 'dirty' ? '有未保存更改' : pkg.status === 'saving' ? '保存中' : pkg.status === 'error' ? '保存失败' : '未关联文件'}
          </span>
        </div>
        <div className="set-card-body">
          <div className="kv-list">
            <div className="kv"><span className="k">文件名</span><span className="v">{pkg.fileName ?? '未关联'}</span></div>
            <div className="kv"><span className="k">修订号</span><span className="v">#{store.revision}</span></div>
            <div className="kv"><span className="k">最后保存</span><span className="v">{formatDateTime(pkg.lastSavedAt)}</span></div>
            <div className="kv"><span className="k">人脉数量</span><span className="v">{store.persons.length} 人</span></div>
            <div className="kv"><span className="k">数据体积</span><span className="v">约 {size}（含附件）</span></div>
            <div className="kv"><span className="k">格式版本</span><span className="v">v{store.pkg.encrypted ? '加密' : '1'} · {pkg.hasHandle ? '实时回写' : '导出覆盖'}</span></div>
          </div>
          {pkg.error && <div className="banner danger" style={{ borderRadius: 10 }}><AlertTriangle size={14} /> {pkg.error}</div>}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                const res = await store.openPackage()
                setBusy(false)
                if (res.ok) toast(res.message ?? '数据包已加载', 'success')
                else if (!res.needsPassword) toast(res.message ?? '未打开数据包', 'warn')
              }}
            >
              <FolderClock size={14} /> 打开数据包
            </button>
            <button
              className="btn"
              onClick={async () => {
                const ok = await store.savePackageAsFile()
                if (!ok) return
                const hasHandle = useStore.getState().pkg.hasHandle
                toast(hasHandle ? '数据包已保存到所选位置' : '已下载数据包文件，之后可用「打开数据包」继续编辑', 'success')
              }}
            >
              <Download size={14} /> 另存为
            </button>
            {pkg.fileName && (
              <button
                className="btn danger"
                onClick={() =>
                  askConfirm({
                    title: '关闭当前数据包？',
                    message: '关闭前会强制保存一次，随后清空工作副本并返回欢迎页。数据包文件本身不会被删除。',
                    confirmText: '关闭',
                    onConfirm: async () => {
                      await store.closePackage()
                      useUI.getState().navigate('welcome')
                    },
                  })
                }
              >
                关闭数据包
              </button>
            )}
            {pkg.hasHandle && pkg.fileName && (
              <button className="btn" onClick={async () => {
                const ok = await store.reauthorize()
                toast(ok ? '已重新授权' : '授权未完成', ok ? 'success' : 'warn')
              }}>
                <RefreshCw size={14} /> 重新授权
              </button>
            )}
          </div>
          <button
            className="pkg-tips-toggle"
            onClick={() => setTipsOpen((v) => !v)}
            aria-expanded={tipsOpen}
          >
            * 点击查看数据包管理须知
          </button>
          <div className="pkg-tips" data-open={tipsOpen ? 'true' : 'false'}>
            <div className="pkg-tips-inner">
              <p>
                `.czdb` 是 UTF-8 JSON 文本文件，可被任何文本编辑器打开检查。加载后它成为数据真源，IndexedDB 作为工作副本，所有修改 2 秒防抖回写。
              </p>
              <p>
                多标签页同时打开同一数据包时，后打开的标签页会自动进入只读模式。保存前会比对文件修改时间与大小，检测到外部改动时不会静默覆盖。
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="set-card">
        <div className="set-card-head">
          <h3>加密</h3>
        </div>
        <div className="set-card-body">
          <div className="set-row">
            <div>
              <div className="lbl">口令加密数据包</div>
              <div className="hint">
                启用后使用 AES-GCM 加密，外层仅保留最小明文头。口令不存储在设备上，忘记口令无法恢复。加密后文件无法被文本编辑器直接查看，因此默认关闭。
              </div>
            </div>
            <Switch
              on={pkg.encrypted}
              onChange={(v) => {
                if (v) {
                  askPrompt({
                    title: '设置数据包口令',
                    message: '请牢记口令，丢失后数据无法恢复。',
                    type: 'password',
                    placeholder: '至少 6 位',
                    onSubmit: async (password) => {
                      if (password.length < 6) {
                        toast('口令至少 6 位', 'error')
                        return
                      }
                      await store.toggleEncryption(password)
                      toast('已启用加密并写盘', 'success')
                    },
                  })
                } else {
                  askPrompt({
                    title: '关闭加密',
                    message: '请输入当前口令以解密数据包。',
                    type: 'password',
                    onSubmit: async (password) => {
                      await store.toggleEncryption(null)
                      toast('已关闭加密', 'success')
                    },
                  })
                }
              }}
            />
          </div>
        </div>
      </div>

      <div className="set-card">
        <div className="set-card-head">
          <h3>快照（{snapshots.length}）</h3>
          <button className="btn sm" onClick={() => store.createSnapshot('手动快照', 'manual')}>
            <Plus size={13} /> 立即快照
          </button>
        </div>
        <div className="snap-list">
          {snapshots.length === 0 ? (
            <Empty icon={<FolderClock size={18} />} title="还没有快照" desc="每次加载数据包超过 24 小时会自动生成快照，最多保留 5 份。" />
          ) : (
            snapshots.map((s) => {
              const isField = s.kind === 'field'
              return (
                <div key={s.id} className="snap-row">
                  <span className={cn('snap-icon', isField && 'is-field')} aria-hidden>
                    {isField ? <History size={14} /> : <FolderClock size={14} />}
                  </span>
                  <div className="snap-info">
                    <div className="snap-title">
                      <span className="ellipsis">{isField ? s.fieldLabel ?? s.reason : s.reason}</span>
                      <span className={cn('snap-tag', isField && 'field')}>
                        {s.kind === 'auto' ? '自动' : isField ? '字段' : '手动'}
                      </span>
                    </div>
                    <div className="snap-sub">
                      {formatDateTime(s.at)} · {s.personCount} {isField ? '条数据' : '人'} · {bytes(s.size)}
                    </div>
                  </div>
                  <button
                    className="btn sm snap-act"
                    onClick={() =>
                      askConfirm({
                        title: isField ? '恢复字段数据？' : '恢复此快照？',
                        message: isField
                          ? '该字段被删除前的数据会写回对应联系人。'
                          : '当前未保存的修改将丢失。恢复后可通过撤销（⌘/Ctrl+Z）回退最近一次操作。',
                        confirmText: '恢复',
                        onConfirm: async () => {
                          await store.restoreSnapshot(s.id)
                          toast(isField ? '字段数据已恢复' : '已恢复到快照', 'success')
                        },
                      })
                    }
                  >
                    恢复
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>

      <AuditLogCard />
    </div>
  )
}

/* ================= 导入导出 ================= */
function IOSettings() {
  const store = useStore()
  const ctx = useMemo(() => buildCtx(store), [store.persons, store.fieldDefinitions, store.groups, store.tags, store.timelineEvents, store.attachments])
  const toast = useUI((s) => s.toast)
  const [cardbook, setCardbook] = useState(false)

  return (
    <div className="settings-section">
      <h2>导入导出</h2>
      <p className="desc">数据包是存知自身的完整载体；CSV 面向表格工具，vCard 面向通讯录。所有导出都在设备本地生成，不经服务器。</p>

      <div className="set-card">
        <div className="set-card-head">
          <h3>导入</h3>
        </div>
        <div className="set-card-body">
          <div className="set-row">
            <div>
              <div className="lbl">导入 CSV / vCard</div>
              <div className="hint">三步向导：上传预览 → 字段映射 → 冲突处理。单次上限 2000 条。</div>
            </div>
            <button className="btn primary" onClick={() => useUI.setState({ importOpen: true })}>
              <Upload size={14} /> 开始导入
            </button>
          </div>
          <div className="set-row">
            <div>
              <div className="lbl">合并导入数据包</div>
              <div className="hint">导入 .czdb 或 JSON 快照，按记录级合并，冲突项逐字段确认，永不静默覆盖。</div>
            </div>
            <label className="btn">
              选择文件
              <input
                type="file"
                hidden
                accept=".czdb,.json,application/json"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (!f) return
                  const text = await f.text()
                  try {
                    const { parsePackageText, mergePackages } = await import('../lib/czdb').then(async (m) => ({
                      parsePackageText: m.parsePackageText,
                      mergePackages: (await import('../lib/io')).mergePackages,
                    }))
                    const parsed = await parsePackageText(text)
                    if (parsed.needsPassword) {
                      toast('该数据包已加密，请先在数据包管理中打开', 'error')
                      return
                    }
                    const st = useStore.getState()
                    const localPkg = {
                      magic: 'CZDB' as const,
                      formatVersion: 1,
                      appVersion: '1.0.0',
                      createdAt: st.pkgCreatedAt,
                      updatedAt: st.pkgUpdatedAt,
                      revision: st.revision,
                      fieldDefinitions: st.fieldDefinitions,
                      groups: st.groups,
                      tags: st.tags,
                      persons: st.persons,
                      todos: st.todos,
                      anniversaries: st.anniversaries,
                      timelineEvents: st.timelineEvents,
                      attachments: st.attachments,
                      settings: st.settings,
                    }
                    const { merged, conflicts } = mergePackages(localPkg, parsed.pkg)
                    useUI.getState().askConfirm({
                      title: '确认合并导入？',
                      message: `将合并 ${parsed.pkg.persons.length} 条人脉记录，其中 ${conflicts.length} 条存在字段级冲突（默认保留较新版本，可在导入后核对）。`,
                      confirmText: '合并导入',
                      onConfirm: () => {
                        useStore.getState().importPackageData(merged)
                        toast('已合并导入', 'success')
                      },
                    })
                  } catch (err) {
                    toast((err as Error).message, 'error')
                  }
                }}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="set-card">
        <div className="set-card-head">
          <h3>导出</h3>
        </div>
        <div className="set-card-body">
          {[
            { k: 'czdb', t: '完整数据包 .czdb', d: '全部数据，含字段定义、附件、设置；用于多端迁移', action: () => store.savePackageAsFile() },
            { k: 'csv', t: 'CSV 表格', d: '列顺序按字段排序，列名使用字段显示名；可重新导入', action: () => store.exportCSVFile() },
            { k: 'json', t: 'JSON 完整快照', d: '字段定义 + 人脉 + 分组标签 + 待办 + 纪念日 + 时间线', action: () => store.exportJSON() },
            { k: 'vcf', t: 'vCard', d: '姓名、电话、邮箱、公司、地址、备注，照片 base64 内嵌', action: () => store.exportVCardFile() },
          ].map((item) => (
            <div className="set-row" key={item.k}>
              <div>
                <div className="lbl">{item.t}</div>
                <div className="hint">{item.d}</div>
              </div>
              <button className="btn" onClick={() => { void item.action(); toast('已开始导出', 'success') }}>
                <Download size={14} /> 导出
              </button>
            </div>
          ))}
          <div className="set-row">
            <div>
              <div className="lbl">名片册打印</div>
              <div className="hint">每页 6 张卡片，首页为我的名片封面，适合线下活动前打印</div>
            </div>
            <button className="btn" onClick={() => setCardbook(true)}>
              <Smartphone size={14} /> 生成名片册
            </button>
          </div>
        </div>
      </div>

      <CardbookDialog open={cardbook} onClose={() => setCardbook(false)} ctx={ctx} />
    </div>
  )
}

function CardbookDialog({ open, onClose, ctx }: { open: boolean; onClose: () => void; ctx: ReturnType<typeof buildCtx> }) {
  const persons = useStore((s) => s.persons)
  const profile = useStore((s) => s.settings.profile)
  const toast = useUI((s) => s.toast)
  const print = () => {
    const win = window.open('', '_blank')
    if (!win) {
      toast('浏览器拦截了弹窗，请允许后重试', 'error')
      return
    }
    const cards = persons
      .map((p) => {
        const meta = buildPersonMeta(p, ctx)
        const phone = ((p.fields.phones as { number: string }[]) ?? [])[0]?.number ?? ''
        return `<div class="card"><div class="n">${meta.name}</div><div class="c">${String(p.fields.company ?? '')}</div><div class="p">${phone}</div></div>`
      })
      .join('')
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>存知名片册</title>
      <style>
      body{font-family:-apple-system,"PingFang SC",sans-serif;margin:0;padding:16px;background:#fff}
      .cover{height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;page-break-after:always}
      .cover h1{font-size:34px;margin:0;letter-spacing:-.03em}
      .cover p{color:#666;font-size:13px;margin:2px}
      .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
      .card{border:1px solid #ddd;border-radius:12px;padding:12px;height:98px;page-break-inside:avoid}
      .card .n{font-size:15px;font-weight:600}
      .card .c{font-size:11px;color:#666;margin-top:2px}
      .card .p{font-size:11px;color:#333;margin-top:8px;font-family:monospace}
      @media print{.grid{grid-template-columns:repeat(2,1fr)}}
      </style></head><body>
      <div class="cover"><h1>${profile.nickname || '我'}</h1><p>${profile.bio || ''}</p><p>${profile.company || ''} ${profile.phone?.number || ''}</p><p style="margin-top:20px;color:#999">存知 · 人脉名片册 · ${persons.length} 张</p></div>
      <div class="grid">${cards}</div>
      <script>window.onload=()=>{setTimeout(()=>window.print(),300)}<\/script>
      </body></html>`)
    win.document.close()
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="导出名片册"
      narrow
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={print}>生成并打印</button>
        </>
      }
    >
      <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-2)' }}>
        将生成一份打印友好的名片册：首页为「我的名片」封面，之后每页 6 张卡片（2 列 × 3 行），共 {persons.length} 张。在新窗口的打印对话框中选择「另存为 PDF」即可导出 PDF。
      </p>
    </Modal>
  )
}

/* ================= 提醒策略 ================= */
function ReminderSettings() {
  const policy = useStore((s) => s.settings.reminderPolicy)
  const updatePolicy = useStore((s) => s.updatePolicy)
  const pushNotify = async () => {
    if (!('Notification' in window)) return false
    const res = await Notification.requestPermission()
    return res === 'granted'
  }
  return (
    <div className="settings-section">
      <h2>提醒策略</h2>
      <p className="desc">提醒不以「记录了多少人」为标准，而以「维持了多少关系」为标准。频率优先级：个人级 &gt; 智能视图级 &gt; 全局默认。</p>

      <div className="set-card">
        <div className="set-card-body">
          <div className="set-row">
            <div>
              <div className="lbl">默认联系频率</div>
              <div className="hint">新添加人脉的初始值，也可被智能视图覆盖</div>
            </div>
            <select
              className="input"
              style={{ width: 150 }}
              value={pol(policy.defaultFrequencyDays)}
              onChange={(e) => updatePolicy({ defaultFrequencyDays: Number(e.target.value) })}
            >
              {[7, 14, 30, 60, 90, 180, 365].map((d) => (
                <option key={d} value={d}>{d} 天</option>
              ))}
            </select>
          </div>
          <div className="set-row">
            <div>
              <div className="lbl">每日提醒时间</div>
              <div className="hint">应用内角标与顶部通知条会在此时间后提示</div>
            </div>
            <input
              className="input"
              type="time"
              style={{ width: 120 }}
              value={policy.pushTime}
              onChange={(e) => updatePolicy({ pushTime: e.target.value })}
            />
          </div>
          <div className="set-row">
            <div>
              <div className="lbl">纪念日提前提醒</div>
              <div className="hint">生日、合作周年等提前 N 天进入工作台</div>
            </div>
            <select
              className="input"
              style={{ width: 110 }}
              value={policy.anniversaryAdvanceDays}
              onChange={(e) => updatePolicy({ anniversaryAdvanceDays: Number(e.target.value) })}
            >
              {[1, 2, 3, 5, 7].map((d) => (
                <option key={d} value={d}>{d} 天</option>
              ))}
            </select>
          </div>
          <div className="set-row">
            <div>
              <div className="lbl">连续忽略降低权重</div>
              <div className="hint">连续两次忽略同一人的提醒，第三次降低其排序权重，避免提醒疲劳</div>
            </div>
            <Switch on={policy.ignoreDecayEnabled} onChange={(v) => updatePolicy({ ignoreDecayEnabled: v })} />
          </div>
          <div className="set-row">
            <div>
              <div className="lbl">浏览器系统通知</div>
              <div className="hint">需显式授权；未授权时降级为应用内提示，不重复弹窗</div>
            </div>
            <button
              className="btn sm"
              onClick={async () => {
                const ok = await pushNotify()
                useUI.getState().toast(ok ? '已开启系统通知' : '未获得通知权限，将使用应用内提示', ok ? 'success' : 'warn')
              }}
            >
              <Bell size={13} /> 申请授权
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const pol = (d: number) => ([7, 14, 30, 60, 90, 180, 365].includes(d) ? d : 30)

/* ================= 智能视图 ================= */
function ViewsSettings() {
  const store = useStore()
  const ctx = useMemo(() => buildCtx(store), [store.persons, store.fieldDefinitions, store.groups, store.tags, store.timelineEvents, store.attachments])
  const applySmartView = useUI((s) => s.applySmartView)
  const navigate = useUI((s) => s.navigate)
  const [editing, setEditing] = useState<SmartView | null>(null)
  const toast = useUI((s) => s.toast)
  const overlap = useMemo(() => {
    const enabled = store.settings.smartViews.filter((v) => v.reminderEnabled)
    const out: Record<string, number> = {}
    for (const v of enabled) {
      out[v.id] = store.persons.filter(
        (p) =>
          enabled.some((o) => o.id !== v.id && computeFunnel(o.filter, { ...ctx, persons: [p] }).total > 0) &&
          computeFunnel(v.filter, { ...ctx, persons: [p] }).total > 0,
      ).length
    }
    return out
  }, [store.settings.smartViews, store.persons, ctx])

  return (
    <div className="settings-section">
      <h2>智能视图</h2>
      <p className="desc">规则结构在此只读展示。编辑入口统一在筛选栏的「添加条件组」，避免出现第二个编辑入口。</p>
      <div className="set-card">
        <div>
          {store.settings.smartViews.map((v) => {
            const count = computeFunnel(v.filter, { ...ctx }).total
            return (
              <div key={v.id} className="field-manage-row" style={{ alignItems: 'flex-start', padding: '12px 14px' }}>
                <span
                  className="legend-dot"
                  style={{ background: v.color ?? '#5B6573', marginTop: 7, width: 9, height: 9 }}
                />
                <div className="grow">
                  <div className="row" style={{ gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{v.name}</span>
                    {v.isSystem && <span className="flag">系统</span>}
                    <span className="chip sm">{count} 人</span>
                    {v.reminderEnabled && (
                      <span className="chip sm accent">用于提醒 · {v.reminderFrequencyDays} 天</span>
                    )}
                    {overlap[v.id] > 0 && (
                      <span className="chip sm" style={{ color: 'var(--warn)' }}>与其它视图重叠 {overlap[v.id]} 人</span>
                    )}
                  </div>
                  <div className="field-hint" style={{ marginTop: 3 }}>
                    {v.filter.kind === 'group' && v.filter.children.length === 0
                      ? '无筛选条件（全部人脉）'
                      : `${v.filter.kind === 'group' ? v.filter.children.length : 1} 个顶层条件 · 层级 ${
                          v.filter.kind === 'group' ? Math.max(1, v.filter.children.length) : 1
                        }`}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Switch
                    small
                    on={v.reminderEnabled}
                    onChange={(on) => {
                      if (v.isSystem) {
                        toast('系统视图不可用于走动提醒', 'warn')
                        return
                      }
                      store.saveSmartView({ ...v, reminderEnabled: on, reminderFrequencyDays: on ? v.reminderFrequencyDays ?? 14 : undefined })
                    }}
                    label="用于走动提醒"
                  />
                  <button
                    className="btn sm"
                    onClick={() => {
                      applySmartView(v)
                      navigate('people')
                    }}
                  >
                    查看
                  </button>
                  <button className="btn sm" disabled={v.isSystem} onClick={() => setEditing(v)}>
                    编辑
                  </button>
                  <button
                    className="btn icon sm"
                    disabled={v.isSystem}
                    onClick={() => {
                      store.deleteSmartView(v.id)
                      toast('视图已删除', 'success')
                    }}
                    aria-label="删除视图"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {editing && (
        <SaveViewDialog
          open
          existing={editing}
          filter={editing.filter}
          onClose={() => setEditing(null)}
          onSaved={(v) => {
            store.saveSmartView(v)
            toast('视图已更新', 'success')
          }}
        />
      )}
    </div>
  )
}

/* ================= 系统存储体检 ================= */
type ScanPhase = 'idle' | 'scanning' | 'done'

/* 体检过程里轮换的阶段文案：读起来像真的在逐项过数据 */
const SCAN_STAGES: [number, string][] = [
  [0, '读取字段定义与人脉索引'],
  [14, '比对重复记录与失效引用'],
  [30, '统计头像与附件体积'],
  [47, '检查缓存、临时文件与索引'],
  [63, '核对最近备份与安全边界'],
  [81, '汇总体检报告'],
]

function stageText(pct: number): string {
  let text = SCAN_STAGES[0][1]
  for (const [at, label] of SCAN_STAGES) if (pct >= at) text = label
  return text
}

/* 报告缓存：切走再回来不用重扫 8 秒 */
let cachedReport: StorageReport | null = null

function StorageScanCard({ onDone }: { onDone: (r: StorageReport) => void }) {
  const toast = useUI((s) => s.toast)
  const [phase, setPhase] = useState<ScanPhase>(cachedReport ? 'done' : 'idle')
  const [pct, setPct] = useState(cachedReport ? 100 : 0)
  const [report, setReport] = useState<StorageReport | null>(cachedReport)
  const [cleaning, setCleaning] = useState(false)
  const [freed, setFreed] = useState<number | null>(null)
  const rafRef = useRef(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  /** 进度条：6 秒走到 99%，再用 2 秒补到 100%，然后才揭晓明细 */
  const run = async () => {
    if (phase === 'scanning') return
    setPhase('scanning')
    setPct(0)
    setFreed(null)
    const job = scanStorage().catch(() => null)
    const t0 = performance.now()
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (!alive.current) {
          resolve()
          return
        }
        const t = performance.now() - t0
        if (t >= 8000) {
          setPct(100)
          resolve()
          return
        }
        setPct(t < 6000 ? 99 * (1 - Math.pow(1 - t / 6000, 1.45)) : 99 + (t - 6000) / 2000)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    })
    const r = await job
    if (!alive.current) return
    setReport(r)
    setPhase('done')
    cachedReport = r
    if (r) onDone(r)
  }

  const doClean = async () => {
    if (cleaning) return
    setCleaning(true)
    const n = await cleanStorage(report)
    await new Promise((r) => setTimeout(r, 520))
    const next = await scanStorage().catch(() => null)
    if (!alive.current) return
    setCleaning(false)
    setFreed(n)
    if (next) {
      setReport(next)
      cachedReport = next
      onDone(next)
    }
    toast(n > 0 ? `已清理 ${bytes(n)} 缓存` : '已清理，没有可回收的缓存', 'success')
  }

  return (
    <div className={cn('scan-card', phase === 'done' && 'is-done')}>
      <div className="scan-top">
        <span className="scan-ico" aria-hidden>
          <Radar size={17} />
        </span>
        <div className="scan-copy">
          <div className="scan-title">系统存储体检</div>
          <div className="scan-desc">数据完整性、重复记录与本地缓存一次扫完，顺带算出能回收多少空间。</div>
        </div>
        <button className="btn primary sm scan-run" onClick={run} disabled={phase === 'scanning'}>
          {phase === 'idle' && (
            <>
              <ScanSearch size={14} /> 开始体检
            </>
          )}
          {phase === 'scanning' && (
            <>
              <RefreshCw size={14} className="spin" /> 体检中
            </>
          )}
          {phase === 'done' && (
            <>
              <RotateCcw size={14} /> 重新体检
            </>
          )}
        </button>
      </div>

      {phase !== 'idle' && (
        <div className="scan-progress">
          <div className="scan-bar">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="scan-line">
            <span className="scan-stage">{phase === 'done' ? '体检完成，报告已生成' : stageText(pct)}</span>
            <span className="scan-pct">{Math.round(pct)}%</span>
          </div>
        </div>
      )}

      {phase === 'scanning' && (
        <div className="scan-skeleton" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="scan-sk-row" style={{ ['--d' as string]: `${i * 120}ms` }} />
          ))}
        </div>
      )}

      {phase === 'done' && report && (
        <div className="scan-result">
          <div className="scan-kpis">
            <div className="scan-kpi">
              <span className="sk-num">{bytes(report.dataBytes)}</span>
              <span className="sk-lab">人脉数据</span>
            </div>
            <div className="scan-kpi">
              <span className="sk-num">{bytes(report.cacheBytes)}</span>
              <span className="sk-lab">可清理缓存</span>
            </div>
            <div className="scan-kpi">
              <span className="sk-num">{report.cacheEntries + report.sessionKeys}</span>
              <span className="sk-lab">缓存条目</span>
            </div>
            <div className="scan-kpi">
              <span className="sk-num">{report.quota > 0 ? `${Math.round((report.usage / report.quota) * 100)}%` : '—'}</span>
              <span className="sk-lab">配额占用</span>
            </div>
          </div>
          <div className="scan-actions">
            <span className="scan-note">
              {freed !== null
                ? `上次清理释放 ${bytes(freed)}`
                : '只清离线缓存与临时状态，人脉数据不动，下次联网自动重建'}
            </span>
            <button className="btn sm" onClick={doClean} disabled={cleaning}>
              <Eraser size={13} /> {cleaning ? '清理中…' : '清理缓存'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ================= 数据健康 ================= */
function HealthSettings() {
  const store = useStore()
  const ctx = useMemo(() => buildCtx(store), [store.persons, store.fieldDefinitions, store.groups, store.tags, store.timelineEvents, store.attachments])
  const setFilter = useUI((s) => s.setFilter)
  const navigate = useUI((s) => s.navigate)
  const toast = useUI((s) => s.toast)
  /* 体检跑完才揭晓明细：上一次的报告还在就直接展开，不用重扫 */
  const [scanned, setScanned] = useState(!!cachedReport)

  const items = useMemo(() => {
    const noPhone = store.persons.filter((p) => {
      const arr = (p.fields.phones as { number: string }[]) ?? []
      return arr.filter((x) => x.number?.trim()).length === 0
    })
    const emailDef = store.fieldDefinitions.find((d) => d.type === 'email')
    const noEmail = emailDef ? store.persons.filter((p) => !((p.fields[emailDef.key] as unknown[]) ?? []).length) : []
    const noAvatar = store.persons.filter((p) => !((p.fields.avatar as unknown[]) ?? []).length)
    const dups = dedupeCandidates(store.persons)
    const cold = store.persons.filter((p) => {
      const ev = personEvents(p.id, store.timelineEvents)
      return ev.length === 0 || (() => {
        const last = buildPersonMeta(p, ctx).lastInteractionAt
        return !last || Date.now() - new Date(last).getTime() > 90 * 86400000
      })()
    })
    const birthdaySoon = store.persons.filter((p) => {
      const b = p.fields.birthday as { value: string } | undefined
      if (!b?.value) return false
      const d = new Date(b.value)
      const now = new Date()
      let next = new Date(now.getFullYear(), d.getMonth(), d.getDate())
      if (next.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
        next = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate())
      }
      const days = Math.round((next.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000)
      const hasAnn = store.anniversaries.some((a) => a.personId === p.id && a.type === 'birthday')
      return days <= 30 && !hasAnn
    })
    const brokenRefs = store.persons.filter((p) =>
      Object.entries(p.fields).some(([, v]) =>
        Array.isArray(v) ? v.some((x) => typeof x === 'object' && x && (x as { deleted?: boolean }).deleted) : typeof v === 'object' && v && (v as { deleted?: boolean }).deleted,
      ),
    )
    return [
      { key: 'phone', label: '缺少电话', desc: '锁定字段「电话」为空', list: noPhone, color: '#E4574C', go: () => applyPhoneEmpty() },
      { key: 'email', label: '缺少邮箱', desc: '没有邮箱字段或字段为空', list: noEmail, color: '#B4530A', go: () => applyEmailEmpty() },
      { key: 'avatar', label: '缺少头像', desc: '名片卡显示姓名首字', list: noAvatar, color: '#7C4DFF', go: () => setFilter({ kind: 'group', id: 'g_avatar', logic: 'and', children: [{ kind: 'condition', id: 'c_avatar', fieldKey: 'avatar', operator: 'isEmpty' }] }) },
      { key: 'dup', label: '疑似重复', desc: '姓名或电话相同，建议合并', list: dups.map((d) => d.a), color: '#0F9D8F', go: () => toast('可在下方逐条查看疑似重复记录', 'info') },
      { key: 'cold', label: '超过 90 天无互动', desc: '关系正在冷却', list: cold, color: '#2F6FEB', go: () => setFilter({ kind: 'group', id: 'g_cold', logic: 'and', children: [{ kind: 'condition', id: 'c_cold', fieldKey: '__lastInteraction', operator: 'inactiveOver', value: 90 }] }) },
      { key: 'birthday', label: '生日 30 天内但未设纪念日', desc: '一键创建后即可提醒', list: birthdaySoon, color: '#C2185B', go: () => {
        let n = 0
        for (const p of birthdaySoon) {
          const b = p.fields.birthday as { value: string }
          store.addAnniversary({ personId: p.id, type: 'birthday', label: '生日', date: b.value.slice(5), advanceDays: 3 })
          n++
        }
        toast(`已创建 ${n} 个生日纪念日`, 'success')
      } },
      { key: 'ref', label: '引用了已删除联系人', desc: '字段保留了姓名快照', list: brokenRefs, color: '#5B6573', go: () => toast('打开对应人脉详情即可重选引荐人', 'info') },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.persons, store.timelineEvents, store.anniversaries, store.fieldDefinitions, ctx])

  const duplicates = useMemo(() => dedupeCandidates(store.persons), [store.persons])

  function applyPhoneEmpty() {
    setFilter({
      kind: 'group',
      id: 'g_phone',
      logic: 'and',
      children: [{ kind: 'condition', id: 'c_phone', fieldKey: 'phones', operator: 'isEmpty' }],
    })
    navigate('people')
  }
  function applyEmailEmpty() {
    const emailDef = store.fieldDefinitions.find((d) => d.type === 'email')
    if (!emailDef) {
      toast('当前没有邮箱类型字段，可在字段管理中新增', 'warn')
      return
    }
    setFilter({
      kind: 'group',
      id: 'g_email',
      logic: 'and',
      children: [{ kind: 'condition', id: 'c_email', fieldKey: emailDef.key, operator: 'isEmpty' }],
    })
    navigate('people')
  }

  return (
    <div className="settings-section">
      <h2>数据健康</h2>
      <p className="desc">把联系人管理从「录入」推进到「维护」：先跑一次系统体检，扫出缺项、重复与可回收的缓存，再逐项处理。</p>

      <StorageScanCard onDone={() => setScanned(true)} />

      {!scanned && <p className="field-hint scan-empty">体检报告生成后，下面会出现逐项明细与处理入口。</p>}

      {scanned && (
        <>
          <div className="stack scan-details" style={{ gap: 8 }}>
        {items.map((item) => (
          <button
            key={item.key}
            className="health-item"
            onClick={() => {
              item.go()
              if (item.key !== 'dup') navigate('people')
            }}
          >
            <span className="hic" style={{ background: `${item.color}16`, color: item.color }}>
              <AlertTriangle size={16} />
            </span>
            <span style={{ textAlign: 'left' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{item.label}</span>
              <span className="hdesc">{item.desc}</span>
            </span>
            <span className="hnum" style={{ color: item.list.length ? 'var(--text)' : 'var(--text-3)' }}>
              {item.list.length}
            </span>
          </button>
        ))}
      </div>

      {duplicates.length > 0 && (
        <div className="set-card">
          <div className="set-card-head">
            <h3>疑似重复联系人（{duplicates.length} 组）</h3>
          </div>
          <div>
            {duplicates.map(({ a, b, reason }, i) => (
              <div key={i} className="field-manage-row">
                <div className="grow">
                  <div className="row" style={{ gap: 6, fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{personName(a)}</span>
                    <span className="muted">↔</span>
                    <span style={{ fontWeight: 600 }}>{personName(b)}</span>
                    <span className="chip sm">{reason}</span>
                  </div>
                  <div className="ftype">
                    {String(a.fields.company ?? '—')} / {String(b.fields.company ?? '—')}
                  </div>
                </div>
                <button
                  className="btn sm"
                  onClick={() => {
                    useUI.getState().openPerson(a.id)
                    useUI.getState().toast('在详情页菜单中选择「与其他人脉合并」', 'info')
                  }}
                >
                  去合并
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}

/* ================= 字段变更审计（并入数据包管理） ================= */
function AuditLogCard() {
  const log = useStore((s) => s.settings.auditLog)
  const [all, setAll] = useState(false)
  const shown = all ? log : log.slice(0, 6)
  return (
    <div className="set-card">
      <div className="set-card-head">
        <div>
          <h3>字段变更审计</h3>
          <span className="field-hint">删除 / 禁用字段、锁定字段改名都会留痕，保留最近 200 条</span>
        </div>
        {log.length > 6 && (
          <button className="btn sm ghost" onClick={() => setAll((v) => !v)}>
            {all ? '收起' : `全部 ${log.length} 条`}
          </button>
        )}
      </div>
      <div>
        {log.length === 0 ? (
          <Empty
            icon={<History size={18} />}
            title="还没有审计记录"
            desc="删除或禁用字段、改名锁定字段后，这里会留下可追溯的记录。"
          />
        ) : (
          shown.map((e) => (
            <div key={e.id} className="audit-row">
              <span className="audit-dot" aria-hidden />
              <div className="audit-info">
                <div className="audit-title">
                  <span className="ellipsis">{e.target}</span>
                  <span className="audit-act">{e.action}</span>
                </div>
                <div className="audit-sub">
                  {formatDateTime(e.at)} · {e.detail} · 影响 {e.affected} 条
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/* ================= 隐私与安全 ================= */
function PrivacySettings() {
  const store = useStore()
  const toast = useUI((s) => s.toast)
  const askConfirm = useUI((s) => s.askConfirm)
  const askPrompt = useUI((s) => s.askPrompt)
  const prefs = store.prefs

  return (
    <div className="settings-section">
      <h2>隐私与安全</h2>
      <p className="desc">所有结构化数据默认存于你的设备，不上传服务器，无需账号。这是产品的硬约束，不是可选项。</p>

      <div className="set-card">
        <div className="set-card-body">
          <div className="set-row">
            <div>
              <div className="lbl">数据存储位置</div>
              <div className="hint">IndexedDB 工作副本 + 你持有的 .czdb 数据包文件</div>
            </div>
            <span className="chip sm">本地</span>
          </div>
          <div className="set-row">
            <div>
              <div className="lbl">锁定应用（PIN）</div>
              <div className="hint">离开工位时一键锁定，解锁前不渲染任何人脉数据（防肩窥，非安全边界）</div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              {prefs.pinLock ? (
                <>
                  <button className="btn sm" onClick={() => store.lockApp(null)}>
                    取消 PIN
                  </button>
                  <button className="btn sm primary" onClick={() => store.lockApp(prefs.pinLock!)}>
                    立即锁定
                  </button>
                </>
              ) : (
                <button
                  className="btn sm"
                  onClick={() =>
                    askPrompt({
                      title: '设置 4 位 PIN',
                      type: 'password',
                      placeholder: '4 位数字',
                      onSubmit: (v) => {
                        if (!/^\d{4}$/.test(v)) {
                          toast('请输入 4 位数字', 'error')
                          return
                        }
                        store.lockApp(v)
                        toast('已设置 PIN', 'success')
                      },
                    })
                  }
                >
                  设置 PIN
                </button>
              )}
            </div>
          </div>
          <div className="set-row">
            <div>
              <div className="lbl">备份提醒</div>
              <div className="hint">
                {prefs.lastBackupAt ? `上次备份：${relativeTime(prefs.lastBackupAt)}` : '尚未备份。IndexedDB 可能被浏览器清理，导出备份是唯一可靠兜底。'}
              </div>
            </div>
            <span className={cn('chip sm', store.lastBackupWarning && 'dashed')}>
              {prefs.lastBackupAt ? '已备份' : '未备份'}
            </span>
          </div>
        </div>
      </div>

      <div className="set-card">
        <div className="set-card-head">
          <h3 style={{ color: 'var(--danger)' }}>危险操作</h3>
        </div>
        <div className="set-card-body">
          <p className="field-hint">
            一键清除所有数据将清空 IndexedDB、Cache Storage 与 localStorage 中全部存知数据，且不可恢复。操作前请确认已导出备份。
          </p>
          <button
            className="btn danger"
            style={{ width: 'fit-content' }}
            onClick={() =>
              askPrompt({
                title: '清除所有数据',
                message: '请输入「删除所有数据」以确认。',
                placeholder: '删除所有数据',
                confirmText: '确认清除',
                onSubmit: async (v) => {
                  if (v.trim() !== '删除所有数据') {
                    toast('确认短语不正确', 'error')
                    return
                  }
                  await store.resetAll()
                  const { clearAllCunzhiStorage } = await import('../lib/db')
                  await clearAllCunzhiStorage()
                  toast('已清除所有本地数据', 'success')
                  setTimeout(() => window.location.reload(), 600)
                },
              })
            }
          >
            <Trash2 size={14} /> 清除所有数据
          </button>
        </div>
      </div>

      <div className="set-card">
        <div className="set-card-head">
          <h3>安全边界说明</h3>
        </div>
        <div className="set-card-body">
          <div className="kv-list">
            <div className="kv"><span className="k">加密</span><span className="v">{store.pkg.encrypted ? '已启用 AES-GCM' : '未启用（数据包为可读 JSON）'}</span></div>
            <div className="kv"><span className="k">网络请求</span><span className="v">无业务数据上传；仅浏览器层面的静态资源加载</span></div>
            <div className="kv"><span className="k">多标签页</span><span className="v">BroadcastChannel 写锁，后开标签页只读</span></div>
            <div className="kv"><span className="k">文件冲突</span><span className="v">保存前比对 mtime 与 size，永不静默覆盖</span></div>
          </div>
        </div>
      </div>

      {/* 版本与开发者挪到独立的「关于存知」分页，与「隐私与安全」并列 */}
    </div>
  )
}

/* ================= 关于存知 ================= */
function AboutSettings() {
  return (
    <div className="settings-section">
      <h2>关于存知</h2>
      <p className="desc">这个工作台由一个人写完并持续维护。版本、开发者与反馈渠道都放在这里。</p>

      <div className="set-card about-card">
        <div className="set-card-head">
          <h3>版本信息</h3>
          <span className="chip sm">Beta V1.0 · 浏览器版</span>
        </div>
        <div className="set-card-body">
          <div className="about-brand">
            <Logo size={38} />
            <div className="about-brand-text">
              <div className="about-name">存知</div>
              <div className="about-tag">本地优先的人脉管理工作台</div>
            </div>
          </div>
          <div className="kv-list">
            <div className="kv">
              <span className="k">版本号</span>
              <span className="v">Beta V1.0（浏览器版）</span>
            </div>
            <div className="kv">
              <span className="k">开发者</span>
              <span className="v">Evan</span>
            </div>
            <div className="kv">
              <span className="k">联系方式</span>
              <span className="v">
                <a className="about-link" href="mailto:evanbob@163.com">
                  evanbob@163.com
                </a>
              </span>
            </div>
            <div className="kv">
              <span className="k">软件官网</span>
              <span className="v">
                <a className="about-link" href="https://blog.evanhub.cn/cunzhi" target="_blank" rel="noreferrer noopener">
                  blog.evanhub.cn/cunzhi
                </a>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 弹性面板缩放的独立样张：与人脉详情页的左边缘是同一套引擎 */}
      <div className="set-card">
        <div className="set-card-head">
          <h3>交互样张 · 弹性面板缩放</h3>
          <span className="field-hint">把鼠标放到右侧面板的左边缘，或直接 Tab 过去用方向键</span>
        </div>
        <div className="set-card-body" style={{ paddingTop: 0 }}>
          <ElasticPanelResize height={340} />
        </div>
      </div>

      <div className="set-card">
        <div className="set-card-head">
          <h3>数据与隐私</h3>
        </div>
        <div className="set-card-body">
          <p className="field-hint" style={{ margin: 0 }}>
            存知没有账号体系，也不会上传任何联系人数据。所有内容只存在这台设备的 IndexedDB 与你持有的
            <b>.czdb</b> 文件里，随时可以带走、检查、删除。详见「隐私与安全」。
          </p>
        </div>
      </div>
    </div>
  )
}
