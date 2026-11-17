/**
 * 存知 · 数据模型（与 PRD 第 15 章对齐）
 */

export type FieldType =
  | 'text'
  | 'longtext'
  | 'select'
  | 'multiselect'
  | 'date'
  | 'attachment'
  | 'number'
  | 'checkbox'
  | 'link'
  | 'phone'
  | 'email'
  | 'address'
  | 'barcode'
  | 'personRef'
  | 'timeline'

export type FieldGroup = 'basic' | 'contact' | 'custom'

export type DateFormat = 'YYYY-MM-DD' | 'YYYY年M月D日' | 'MM/DD/YYYY' | 'DD/MM/YYYY'

export interface SelectOption {
  id: string
  label: string
  color: string
}

export interface FieldConfig {
  maxLength?: number
  options?: SelectOption[]
  dateFormat?: DateFormat
  hasTime?: boolean
  decimals?: number
  unit?: 'none' | 'percent' | 'custom'
  unitText?: string
  multiple?: boolean
  /** barcode 字段的数据来源：personCard = 由本人资料就地生成，不存链接 */
  source?: 'personCard'
  maxFiles?: number
  acceptedMimeTypes?: string
  min?: number
  max?: number
}

export interface FieldDefinition {
  key: string
  label: string
  type: FieldType
  required: boolean
  visible: boolean
  defaultValue?: unknown
  sortOrder: number
  isBuiltIn: boolean
  isLocked: boolean
  group: FieldGroup
  disabled?: boolean
  config: FieldConfig
  createdAt: string
  updatedAt: string
}

export interface AttachmentMeta {
  id: string
  name: string
  mime: string
  size: number
  width?: number
  height?: number
  uploadedAt: string
}

export interface AttachmentData extends AttachmentMeta {
  thumbnail?: string
  data: string
}

export interface PhoneValue {
  label: string
  number: string
}
export interface EmailValue {
  label: string
  address: string
}
export interface AddressValue {
  label: string
  country?: string
  province?: string
  city?: string
  district?: string
  detail: string
}
export interface DateValue {
  value: string
  hasTime: boolean
}
export interface LinkValue {
  url: string
  displayText?: string
}
export interface BarcodeValue {
  format: string
  rawValue: string
}
export interface RefSnapshot {
  refId: string
  snapshotName: string
  deleted: true
}
export type PersonRef = string | RefSnapshot

export interface Person {
  id: string
  createdAt: string
  updatedAt: string
  fields: Record<string, unknown>
  /** 个人级联系频率（天）。undefined/null 表示未显式设置 */
  reminderFrequencyDays?: number | null
  ignoredReminders?: number
  snoozeUntil?: string | null
  pinnedTimelineId?: string | null
  /** 关系备忘：自由文本，参与全局搜索，不占用字段位 */
  memo?: string
}

export interface Group {
  id: string
  name: string
  color: string
  sortOrder: number
}

export interface Tag {
  id: string
  name: string
  usageCount: number
}

export type TodoPriority = 'normal' | 'important'
export interface Todo {
  id: string
  title: string
  personId?: string | null
  dueDate: string
  priority: TodoPriority
  done: boolean
  createdAt: string
  completedAt?: string | null
  /** 软删除：进回收站，可在待办中心恢复或彻底清除 */
  deletedAt?: string | null
}

export type AnniversaryType = 'birthday' | 'work' | 'cooperation' | 'custom'
export interface Anniversary {
  id: string
  personId: string
  type: AnniversaryType
  label: string
  date: string
  advanceDays: number
}

export type TimelineType =
  | 'note'
  | 'todo_completed'
  | 'reach_out'
  | 'gift'
  | 'anniversary'
  | 'import'
  | 'field_change'

export interface TimelineEvent {
  id: string
  personId: string
  type: TimelineType
  content: string
  occurredAt: string
  sourceFieldKey?: string
  channel?: string
  /** 礼物记录：内容与价值（元） */
  gift?: { item: string; value?: number }
}

export type FilterOperator =
  | 'contains'
  | 'equals'
  | 'notEquals'
  | 'in'
  | 'gt'
  | 'lt'
  | 'between'
  | 'before'
  | 'after'
  | 'isEmpty'
  | 'notEmpty'
  | 'hasAny'
  | 'hasAll'
  | 'hasNone'
  | 'activeWithin'
  | 'inactiveOver'
  | 'never'
  | 'birthdayMonth'

export type FilterNode =
  | {
      kind: 'condition'
      id: string
      fieldKey: string
      operator: FilterOperator
      value?: unknown
      negated?: boolean
    }
  | { kind: 'group'; id: string; logic: 'and' | 'or'; children: FilterNode[] }

export interface SmartView {
  id: string
  name: string
  icon?: string
  color?: string
  filter: FilterNode
  reminderEnabled: boolean
  reminderFrequencyDays?: number
  isSystem?: boolean
  createdAt: string
  updatedAt: string
}

export interface Profile {
  nickname: string
  avatarAttachmentId?: string | null
  bio?: string
  phone?: PhoneValue | null
  email?: EmailValue | null
  address?: AddressValue | null
  company?: string
  city?: string
}

export interface ReminderPolicy {
  defaultFrequencyDays: number
  pushTime: string
  anniversaryAdvanceDays: number
  ignoreDecayEnabled: boolean
  sortMode: 'lastInteraction' | 'namePinyin' | 'createdAt' | 'urgency'
}

export type AuditAction =
  | 'field_delete'
  | 'field_disable'
  | 'field_rename'
  | 'field_create'
  | 'person_merge'
  | 'import'

export interface AuditEntry {
  id: string
  action: AuditAction
  target: string
  detail: string
  affected: number
  at: string
}

/** 联系方式下的通联通道：仅作为「联系方式」字段的下级条目，本级排序 */
export interface ContactChannel {
  id: string
  label: string
  /** tel=电话类（可拨号/短信），im=网络通联（只能复制） */
  kind: 'tel' | 'im'
  visible: boolean
  /** 输入提示，如「微信号」 */
  hint?: string
  isBuiltIn?: boolean
}

export interface Settings {
  profile: Profile
  smartViews: SmartView[]
  reminderPolicy: ReminderPolicy
  auditLog: AuditEntry[]
  lastBackupAt: string | null
  /** 联系方式的下级通道，顺序即详情页与字段管理里的本级顺序 */
  contactChannels: ContactChannel[]
}

export interface DataPackage {
  magic: 'CZDB'
  formatVersion: number
  appVersion: string
  createdAt: string
  updatedAt: string
  revision: number
  fieldDefinitions: FieldDefinition[]
  groups: Group[]
  tags: Tag[]
  persons: Person[]
  todos: Todo[]
  anniversaries: Anniversary[]
  timelineEvents: TimelineEvent[]
  attachments: Record<string, AttachmentData>
  settings: Settings
}

/** 端无关界面偏好，按设备存储 */
export interface Prefs {
  viewMode: 'cards' | 'grid' | 'table' | 'network'
  /** 工作台宫格：cells 用网格单元记位置与尺寸，w/h 可带小数（无极缩放） */
  dashboardLayout: {
    order: string[]
    collapsed: string[]
    cells: Record<string, { x: number; y: number; w: number; h: number }>
  }
  /** 明暗模式：跟随系统 / 浅色 / 深色 */
  theme: ThemeMode
  /** 提高全局对比度：加深文字与描边，弱光/强光环境下更清楚 */
  highContrast?: boolean
  /** 工作台主题色（卡片标题与强调色的一层薄着色） */
  dashAccent: DashAccent
  /** 自定义主题色的色值（dashAccent === 'custom' 时生效） */
  accentCustom?: string
  /** 主题色方案版本：老数据迁移用，4 起默认靛蓝（云母 / 暖沙已移除） */
  accentV?: number
  /** 移动端工作台卡片顺序：待办 → 走动提醒 → 纪念日 为默认 */
  dashMobileOrder: string[]
  detailPanelWidth: number
  columnConfig: string[]
  showEmptyFields: boolean
  sortMode: 'lastInteraction' | 'namePinyin' | 'createdAt' | 'urgency'
  networkMode: 'overview' | 'referral' | 'between'
  searchHistory: string[]
  recentViewed: string[]
  lastBackupAt: string | null
  pinLock?: string | null
  mapProvider: 'amap' | 'baidu' | 'google'
  landingSeen?: boolean
  /** 正处于「示例数据体验」态：首页显示「结束体验，正式使用」 */
  demoMode?: boolean
  /** 是否已经做过首次「挂载本地文件夹」引导（弹过一次就不再打扰） */
  mountHintSeen?: boolean
  /** 互动方式：内置 + 用户自定义，详情页与速记共用一份 */
  channels: string[]
}

export type ThemeMode = 'system' | 'light' | 'dark'

export type DashAccent = 'snow' | 'slate' | 'forest' | 'ocean' | 'plum' | 'coral' | 'bamboo' | 'teal' | 'rose' | 'custom'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'dirty' | 'error' | 'no-file'

export interface ReminderItem {
  person: Person
  frequencyDays: number
  lastInteractionAt: string | null
  overdueDays: number
  sourceViewName?: string
  sourceViewId?: string
  suggestion?: string
  weight: number
}
