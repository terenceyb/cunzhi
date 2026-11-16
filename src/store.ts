import { create } from 'zustand'
import type {
  Anniversary,
  AttachmentData,
  AttachmentMeta,
  AuditEntry,
  ContactChannel,
  DataPackage,
  EmailValue,
  FieldDefinition,
  FilterNode,
  Group,
  Person,
  PersonRef,
  PhoneValue,
  Prefs,
  Profile,
  ReminderPolicy,
  SaveStatus,
  Settings,
  SmartView,
  Tag,
  TimelineEvent,
  Todo,
} from './types'
import {
  APP_VERSION,
  FREQUENCY_OPTIONS,
  buildDemoData,
  createDefaultFieldDefinitions,
  createDefaultGroups,
  createDefaultSettings,
} from './defaults'
import { normalizeChannels } from './lib/channels'
import {
  buildPackage,
  downloadText,
  encodePackageForWrite,
  ensureHandlePermission,
  humanizeFileError,
  hydratePackage,
  parsePackageText,
  pickPackageFile,
  savePackageAs,
  writeHandle,
  type DataSlots,
} from './lib/czdb'
import { PREFS_KEY, idbDel, idbGet, idbSet } from './lib/db'
import { exportCSV, toCSV, toVCard } from './lib/io'
import { fmtFileStamp, nowISO, deepClone, uid } from './lib/utils'
import type { DeriveCtx } from './lib/derive'

export interface PkgInfo {
  fileName: string | null
  status: SaveStatus
  lastSavedAt: string | null
  encrypted: boolean
  hasHandle: boolean
  error: string | null
}

export interface ConflictInfo {
  fileName: string
  localRevision: number
  localUpdatedAt: string
  remoteModified: number
  remoteSize: number
}

export interface SnapshotInfo {
  id: string
  at: string
  reason: string
  kind: 'auto' | 'manual' | 'field'
  personCount: number
  size: number
  fieldKey?: string
  fieldLabel?: string
}

interface PersistedSnapshot extends SnapshotInfo {
  data: unknown
}

export const DEFAULT_CHANNELS = ['电话', '见面', '微信', '邮件', '短信', '礼物']

export const DEFAULT_PREFS: Prefs = {
  viewMode: 'cards',
  dashboardLayout: {
    order: ['reminders', 'todos', 'anniversaries'],
    collapsed: [],
    cells: {
      reminders: { x: 0, y: 0, w: 2, h: 2 },
      todos: { x: 2, y: 0, w: 1, h: 2 },
      anniversaries: { x: 3, y: 0, w: 1, h: 2 },
    },
  },
  theme: 'system',
  highContrast: false,
  dashAccent: 'slate',
  dashMobileOrder: ['todos', 'reminders', 'anniversaries'],
  detailPanelWidth: 420,
  columnConfig: ['name', 'phones', 'company', 'groups', 'tags', 'city', 'lastInteraction'],
  showEmptyFields: false,
  sortMode: 'lastInteraction',
  networkMode: 'overview',
  searchHistory: [],
  recentViewed: [],
  lastBackupAt: null,
  pinLock: null,
  mapProvider: 'amap',
  landingSeen: false,
  channels: DEFAULT_CHANNELS,
}

export interface AppState {
  ready: boolean
  fieldDefinitions: FieldDefinition[]
  groups: Group[]
  tags: Tag[]
  persons: Person[]
  todos: Todo[]
  anniversaries: Anniversary[]
  timelineEvents: TimelineEvent[]
  attachments: Record<string, AttachmentData>
  settings: Settings
  revision: number
  pkgCreatedAt: string
  pkgUpdatedAt: string
  prefs: Prefs
  pkg: PkgInfo
  snapshots: SnapshotInfo[]
  readOnly: boolean
  conflict: ConflictInfo | null
  pendingUnlock: { text: string; fileName: string } | null
  locked: boolean
  lastBackupWarning: boolean

  init: () => Promise<void>
  setPrefs: (patch: Partial<Prefs>) => void
  commit: (patch: Partial<AppState>, opts?: { undo?: boolean }) => void
  undo: () => void

  createPerson: (fields: Record<string, unknown>, memo?: string) => string
  updatePerson: (id: string, fields: Record<string, unknown>) => void
  patchPerson: (id: string, patch: Partial<Person>) => void
  deletePerson: (id: string, mode: 'snapshot' | 'clear') => void
  mergePersons: (keepId: string, removeId: string, choice: Record<string, 'keep' | 'remove'>) => void

  addTimeline: (
    personId: string,
    type: TimelineEvent['type'],
    content: string,
    occurredAt?: string,
    channel?: string,
    extra?: Partial<TimelineEvent>,
  ) => string
  deleteTimeline: (ids: string[]) => void
  pinTimeline: (personId: string, eventId: string | null) => void

  markContacted: (personId: string, channel?: string) => void
  snoozeReminder: (personId: string, days: number) => void
  setFrequency: (personId: string, days: number | null) => void

  addTodo: (todo: Partial<Todo> & { title: string }) => string
  updateTodo: (id: string, patch: Partial<Todo>) => void
  toggleTodo: (id: string, syncInteraction: boolean) => void
  deleteTodo: (id: string) => void
  restoreTodo: (id: string) => void
  purgeTodo: (id: string) => void

  addAnniversary: (ann: Omit<Anniversary, 'id'>) => void
  deleteAnniversary: (id: string) => void

  /** 联系方式的下级通道：整体覆盖写，顺序即本级顺序 */
  setContactChannels: (list: ContactChannel[]) => void

  addField: (def: Omit<FieldDefinition, 'createdAt' | 'updatedAt'>) => void
  updateField: (key: string, patch: Partial<FieldDefinition>) => void
  deleteField: (key: string) => void
  reorderFields: (keys: string[]) => void
  restoreFieldSnapshot: (snapshotId: string) => void

  addGroup: (name: string, color: string) => string
  updateGroup: (id: string, patch: Partial<Group>) => void
  deleteGroup: (id: string) => void
  reorderGroups: (ids: string[]) => void

  addTag: (name: string) => string
  renameTag: (id: string, name: string) => void
  deleteTag: (id: string) => void

  saveSmartView: (view: SmartView) => void
  deleteSmartView: (id: string) => void

  updateProfile: (patch: Partial<Profile>) => void
  updatePolicy: (patch: Partial<ReminderPolicy>) => void
  addAttachments: (personId: string, fieldKey: string, files: File[]) => Promise<void>
  /** 只处理并存入附件实体，由调用方决定写回哪个字段（用于表单草稿） */
  addAttachmentFile: (file: File) => Promise<AttachmentData>
  uploadProfileAvatar: (file: File) => Promise<void>

  bulkAddPersons: (persons: Person[], mode: 'skip' | 'overwrite' | 'new') => { added: number; skipped: number; overwritten: number }
  deleteMany: (ids: string[]) => void
  bulkPatch: (ids: string[], fields: Record<string, unknown>) => void

  loadDemo: () => void
  openPackage: () => Promise<{ ok: boolean; needsPassword?: boolean; message?: string }>
  unlockPending: (password: string) => Promise<{ ok: boolean; message?: string }>
  savePackageAsFile: (name?: string) => Promise<boolean>
  closePackage: () => Promise<void>
  reauthorize: () => Promise<boolean>
  resolveConflict: (action: 'reload' | 'overwrite' | 'saveAs') => Promise<void>
  toggleEncryption: (password: string | null) => Promise<void>

  createSnapshot: (reason: string, kind?: SnapshotInfo['kind']) => Promise<void>
  restoreSnapshot: (id: string) => Promise<void>
  exportJSON: () => void
  exportCSVFile: (ids?: string[]) => void
  exportVCardFile: (ids?: string[]) => void
  importPackageData: (pkg: DataPackage) => void
  resetAll: () => Promise<void>
  lockApp: (pin: string | null) => void
  unlockApp: (pin: string) => boolean
}

let undoStack: DataSlots[] = []
let persistTimer: ReturnType<typeof setTimeout> | null = null
let fileTimer: ReturnType<typeof setTimeout> | null = null
let lastFileWrite: { lastModified: number; size: number } | null = null
let fileHandle: any = null
let pkgPassword: string | null = null
let broadcast: BroadcastChannel | null = null
let heartbeat: ReturnType<typeof setInterval> | null = null

const MAX_UNDO = 30
const MAX_AUTO_SNAPSHOTS = 5

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

const slotsOf = (s: AppState): DataSlots => ({
  fieldDefinitions: s.fieldDefinitions,
  groups: s.groups,
  tags: s.tags,
  persons: s.persons,
  todos: s.todos,
  anniversaries: s.anniversaries,
  timelineEvents: s.timelineEvents,
  attachments: s.attachments,
  settings: s.settings,
})

const emptySlots = (): DataSlots => ({
  fieldDefinitions: createDefaultFieldDefinitions(),
  // 「从零开始」= 真正的空库：群组与标签全部由用户自建，不预置任何业务数据
  groups: [],
  tags: [],
  persons: [],
  todos: [],
  anniversaries: [],
  timelineEvents: [],
  attachments: {},
  settings: createDefaultSettings(),
})

export const REF_KEY = '__ref__'

function pushRefSnapshot(refs: PersonRef[], removedId: string, name: string, mode: 'snapshot' | 'clear'): PersonRef[] {
  if (mode === 'clear') return refs.filter((r) => (typeof r === 'string' ? r : r.refId) !== removedId)
  return refs.map((r) => (typeof r === 'string' && r === removedId ? { refId: removedId, snapshotName: name, deleted: true } : r))
}

export const useStore = create<AppState>((set, get) => {
  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      void flushDb()
      const now = Date.now()
      scheduleFileWrite(now - (get().pkg.lastSavedAt ? new Date(get().pkg.lastSavedAt as string).getTime() : 0) > 30000)
    }, 700)
  }

  const flushDb = async () => {
    const s = get()
    try {
      await idbSet(
        'data',
        buildPackage(slotsOf(s), {
          revision: s.revision,
          createdAt: s.pkgCreatedAt,
          updatedAt: s.pkgUpdatedAt,
        }),
      )
    } catch (e) {
      set({ pkg: { ...s.pkg, status: 'error', error: `本地保存失败：${humanizeFileError(e)}` } })
    }
  }

  const scheduleFileWrite = (immediate = false) => {
    if (!fileHandle) {
      set((s) => ({ pkg: { ...s.pkg, status: 'no-file' } }))
      return
    }
    if (fileTimer) clearTimeout(fileTimer)
    fileTimer = setTimeout(() => void writeToFile(), immediate ? 0 : 2000)
  }

  const writeToFile = async (force = false): Promise<boolean> => {
    if (!fileHandle) return false
    const s = get()
    if (s.readOnly) return true
    const granted = await ensureHandlePermission(fileHandle)
    if (!granted) {
      set({ pkg: { ...s.pkg, status: 'error', error: '文件写入权限已失效，请点击「重新授权」' } })
      return false
    }
    try {
      if (!force && lastFileWrite) {
        const file = await fileHandle.getFile()
        if (file.lastModified !== lastFileWrite.lastModified || file.size !== lastFileWrite.size) {
          set({
            conflict: {
              fileName: file.name,
              localRevision: s.revision,
              localUpdatedAt: s.pkgUpdatedAt,
              remoteModified: file.lastModified,
              remoteSize: file.size,
            },
            pkg: { ...s.pkg, status: 'error', error: '检测到文件被外部修改' },
          })
          return false
        }
      }
      set({ pkg: { ...get().pkg, status: 'saving' } })
      const pkg = buildPackage(slotsOf(get()), {
        revision: get().revision,
        createdAt: get().pkgCreatedAt,
        updatedAt: get().pkgUpdatedAt,
      })
      const text = await encodePackageForWrite(pkg, s.pkg.encrypted ? pkgPassword : null)
      const meta = await writeHandle(fileHandle, text)
      lastFileWrite = meta
      set({
        pkg: { ...get().pkg, status: 'saved', lastSavedAt: nowISO(), error: null },
      })
      return true
    } catch (e) {
      const msg = humanizeFileError(e)
      set({ pkg: { ...get().pkg, status: 'error', error: `写盘失败：${msg}` } })
      try {
        await idbSet('emergency', buildPackage(slotsOf(get()), { revision: get().revision }))
      } catch {
        /* ignore */
      }
      return false
    }
  }

  const applySlots = (slots: DataSlots, meta: { revision: number; createdAt: string; updatedAt: string }) =>
    set({
      ...slots,
      revision: meta.revision,
      pkgCreatedAt: meta.createdAt,
      pkgUpdatedAt: meta.updatedAt,
    })

  const commit = (patch: Partial<AppState>, opts: { undo?: boolean } = {}) => {
    const s = get()
    if (opts.undo !== false) {
      undoStack.push(deepClone(slotsOf(s)))
      if (undoStack.length > MAX_UNDO) undoStack.shift()
    }
    set({
      ...patch,
      revision: s.revision + 1,
      pkgUpdatedAt: nowISO(),
      pkg: { ...s.pkg, status: 'dirty' },
    } as Partial<AppState>)
    schedulePersist()
  }

  const audit = (entry: Omit<AuditEntry, 'id' | 'at'>) => {
    const s = get()
    const list = [{ ...entry, id: uid('audit'), at: nowISO() }, ...s.settings.auditLog].slice(0, 200)
    return { ...s.settings, auditLog: list }
  }

  return {
    ready: false,
    ...emptySlots(),
    revision: 1,
    pkgCreatedAt: nowISO(),
    pkgUpdatedAt: nowISO(),
    prefs: { ...DEFAULT_PREFS },
    pkg: { fileName: null, status: 'saved', lastSavedAt: null, encrypted: false, hasHandle: false, error: null },
    snapshots: [],
    readOnly: false,
    conflict: null,
    pendingUnlock: null,
    locked: false,
    lastBackupWarning: false,

    init: async () => {
      const prefs = loadPrefs()
      const stored = await idbGet<DataPackage>('data')
      const storedHandle = await idbGet<any>('handle')
      const snapshotList = (await idbGet<PersistedSnapshot[]>('snapshots')) ?? []
      const handleMeta = await idbGet<{ fileName: string; lastModified: number; size: number }>('handleMeta')
      let slots: DataSlots = emptySlots()
      let revision = 1
      let createdAt = nowISO()
      let updatedAt = nowISO()
      if (stored && stored.magic === 'CZDB') {
        try {
          const hydrated = hydratePackage(stored)
          slots = {
            fieldDefinitions: hydrated.pkg.fieldDefinitions,
            groups: hydrated.pkg.groups,
            tags: hydrated.pkg.tags,
            persons: hydrated.pkg.persons,
            todos: hydrated.pkg.todos,
            anniversaries: hydrated.pkg.anniversaries,
            timelineEvents: hydrated.pkg.timelineEvents,
            attachments: hydrated.pkg.attachments,
            settings: { ...hydrated.pkg.settings, contactChannels: normalizeChannels(hydrated.pkg.settings?.contactChannels) },
          }
          revision = hydrated.pkg.revision
          createdAt = hydrated.pkg.createdAt
          updatedAt = hydrated.pkg.updatedAt
        } catch {
          /* 损坏则回退空态 */
        }
      }
      let hasHandle = false
      let fileName = handleMeta?.fileName ?? null
      if (storedHandle) {
        fileHandle = storedHandle
        try {
          const perm = await storedHandle.queryPermission({ mode: 'readwrite' })
          hasHandle = perm === 'granted'
          const f = await storedHandle.getFile()
          lastFileWrite = { lastModified: f.lastModified, size: f.size }
          fileName = f.name
        } catch {
          hasHandle = false
        }
      }
      const auto = snapshotList.filter((s) => s.kind === 'auto').sort((a, b) => +new Date(b.at) - +new Date(a.at))[0]
      const needBackup = !auto || Date.now() - new Date(auto.at).getTime() > 86400000
      set({
        ...slots,
        ready: true,
        revision,
        pkgCreatedAt: createdAt,
        pkgUpdatedAt: updatedAt,
        prefs,
        snapshots: snapshotList.map(({ data: _data, ...rest }) => rest),
        pkg: {
          fileName,
          status: stored ? 'saved' : 'idle',
          lastSavedAt: stored ? updatedAt : null,
          encrypted: false,
          hasHandle,
          error: null,
        },
        lastBackupWarning: !auto || Date.now() - new Date(auto.at).getTime() > 3 * 86400000,
      })
      if (needBackup && stored) void get().createSnapshot('自动快照', 'auto')
      // 多标签页写锁
      try {
        broadcast = new BroadcastChannel('cunzhi-pkg-lock')
        broadcast.postMessage({ type: 'claim', at: Date.now() })
        broadcast.onmessage = (ev) => {
          if (!fileHandle) return
          if (ev.data?.type === 'claim') {
            set({ readOnly: true, pkg: { ...get().pkg, error: '该数据包已在其他标签页打开，当前为只读模式' } })
            broadcast?.postMessage({ type: 'occupied', at: Date.now() })
          } else if (ev.data?.type === 'release') {
            set({ readOnly: false })
          }
        }
      } catch {
        /* ignore */
      }
      if (heartbeat) clearInterval(heartbeat)
      heartbeat = setInterval(async () => {
        if (!fileHandle) return
        try {
          const f = await fileHandle.getFile()
          if (lastFileWrite && f.lastModified !== lastFileWrite.lastModified) {
            set({ pkg: { ...get().pkg, error: '数据包文件已在外部被修改' } })
          }
        } catch {
          /* ignore */
        }
      }, 300000)
      window.addEventListener('beforeunload', (ev) => {
        const s = get()
        if (s.pkg.status === 'dirty' || s.pkg.status === 'saving') {
          ev.preventDefault()
          ev.returnValue = ''
        }
      })
    },

    setPrefs: (patch) => {
      const prefs = { ...get().prefs, ...patch }
      set({ prefs })
      savePrefs(prefs)
    },

    commit,

    undo: () => {
      const prev = undoStack.pop()
      if (!prev) return
      set({ ...prev, revision: get().revision + 1, pkgUpdatedAt: nowISO(), pkg: { ...get().pkg, status: 'dirty' } })
      schedulePersist()
    },

    createPerson: (fields, memo = '') => {
      const defs = get().fieldDefinitions
      const base: Record<string, unknown> = {}
      for (const d of defs) {
        if (d.type === 'timeline') continue
        if (d.defaultValue !== undefined && d.defaultValue !== null && typeof d.defaultValue === 'object') continue
      }
      const person: Person = {
        id: uid('person'),
        createdAt: nowISO(),
        updatedAt: nowISO(),
        fields: { ...base, ...fields },
        reminderFrequencyDays: null,
        ignoredReminders: 0,
        snoozeUntil: null,
        pinnedTimelineId: null,
        memo,
      }
      commit({ persons: [...get().persons, person] })
      return person.id
    },

    updatePerson: (id, fields) => {
      const persons = get().persons.map((p) =>
        p.id === id ? { ...p, fields: { ...p.fields, ...fields }, updatedAt: nowISO() } : p,
      )
      commit({ persons })
    },

    patchPerson: (id, patch) => {
      commit({ persons: get().persons.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: nowISO() } : p)) })
    },

    deletePerson: (id, mode) => {
      const s = get()
      const target = s.persons.find((p) => p.id === id)
      if (!target) return
      const name = String(target.fields.name ?? '未命名')
      const persons = s.persons
        .filter((p) => p.id !== id)
        .map((p) => {
          const fields = { ...p.fields }
          for (const [key, value] of Object.entries(fields)) {
            const def = s.fieldDefinitions.find((d) => d.key === key)
            if (def?.type !== 'personRef') continue
            if (Array.isArray(value)) fields[key] = pushRefSnapshot(value as PersonRef[], id, name, mode)
            else if (typeof value === 'string' && value === id) {
              fields[key] = mode === 'snapshot' ? { refId: id, snapshotName: name, deleted: true } : ''
            }
          }
          return { ...p, fields }
        })
      commit({
        persons,
        todos: s.todos.filter((t) => t.personId !== id),
        anniversaries: s.anniversaries.filter((a) => a.personId !== id),
        timelineEvents: s.timelineEvents.filter((e) => e.personId !== id),
        settings: audit({ action: 'person_merge', target: name, detail: mode === 'snapshot' ? '删除并保留引用快照' : '删除并清除引用', affected: 1, at: nowISO() } as never),
      })
    },

    mergePersons: (keepId, removeId, choice) => {
      const s = get()
      const keep = s.persons.find((p) => p.id === keepId)
      const remove = s.persons.find((p) => p.id === removeId)
      if (!keep || !remove) return
      const fields = { ...keep.fields }
      for (const [key, side] of Object.entries(choice)) {
        if (side === 'remove') fields[key] = remove.fields[key]
        else fields[key] = keep.fields[key]
      }
      for (const key of Object.keys(remove.fields)) {
        if (!(key in fields) || fields[key] === '' || fields[key] === undefined) fields[key] = remove.fields[key]
      }
      const remap = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map((x) => (x === removeId ? keepId : x))
        if (v === removeId) return keepId
        return v
      }
      const persons = s.persons
        .filter((p) => p.id !== removeId)
        .map((p) => {
          const f = { ...p.fields }
          for (const [key, value] of Object.entries(f)) {
            const def = s.fieldDefinitions.find((d) => d.key === key)
            if (def?.type === 'personRef') f[key] = remap(value)
          }
          return p.id === keepId ? { ...p, fields, updatedAt: nowISO() } : { ...p, fields: f }
        })
      commit({
        persons,
        timelineEvents: s.timelineEvents.map((e) => (e.personId === removeId ? { ...e, personId: keepId } : e)),
        todos: s.todos.map((t) => (t.personId === removeId ? { ...t, personId: keepId } : t)),
        anniversaries: s.anniversaries.map((a) => (a.personId === removeId ? { ...a, personId: keepId } : a)),
        settings: audit({
          action: 'person_merge',
          target: String(keep.fields.name ?? ''),
          detail: `合并了「${String(remove.fields.name ?? '')}」`,
          affected: 1,
          at: nowISO(),
        } as never),
      })
    },

    addTimeline: (personId, type, content, occurredAt, channel, extra) => {
      const ev: TimelineEvent = {
        id: uid('ev'),
        personId,
        type,
        content,
        occurredAt: occurredAt ?? nowISO(),
        channel,
        ...extra,
      }
      const persons = get().persons.map((p) =>
        p.id === personId ? { ...p, ignoredReminders: 0, updatedAt: nowISO() } : p,
      )
      commit({ timelineEvents: [...get().timelineEvents, ev], persons })
      return ev.id
    },

    deleteTimeline: (ids) => {
      const set_ = new Set(ids)
      commit({ timelineEvents: get().timelineEvents.filter((e) => !set_.has(e.id)) })
    },

    pinTimeline: (personId, eventId) => {
      commit({ persons: get().persons.map((p) => (p.id === personId ? { ...p, pinnedTimelineId: eventId } : p)) })
    },

    markContacted: (personId, channel = '电话') => {
      const person = get().persons.find((p) => p.id === personId)
      if (!person) return
      const ev: TimelineEvent = {
        id: uid('ev'),
        personId,
        type: 'reach_out',
        content: `已联系（${channel}）`,
        occurredAt: nowISO(),
        channel,
      }
      commit({
        timelineEvents: [...get().timelineEvents, ev],
        persons: get().persons.map((p) =>
          p.id === personId ? { ...p, ignoredReminders: 0, snoozeUntil: null, updatedAt: nowISO() } : p,
        ),
      })
    },

    snoozeReminder: (personId, days) => {
      const until = new Date(Date.now() + days * 86400000).toISOString()
      commit({
        persons: get().persons.map((p) =>
          p.id === personId ? { ...p, snoozeUntil: until, ignoredReminders: (p.ignoredReminders ?? 0) + 1 } : p,
        ),
      })
    },

    setFrequency: (personId, days) => {
      commit({ persons: get().persons.map((p) => (p.id === personId ? { ...p, reminderFrequencyDays: days } : p)) })
    },

    addTodo: (todo) => {
      const item: Todo = {
        id: uid('todo'),
        title: todo.title,
        personId: todo.personId ?? null,
        dueDate: todo.dueDate ?? new Date().toISOString().slice(0, 10),
        priority: todo.priority ?? 'normal',
        done: false,
        createdAt: nowISO(),
        completedAt: null,
      }
      commit({ todos: [...get().todos, item] })
      return item.id
    },

    updateTodo: (id, patch) => {
      commit({ todos: get().todos.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
    },

    toggleTodo: (id, syncInteraction) => {
      const s = get()
      const todo = s.todos.find((t) => t.id === id)
      if (!todo) return
      const done = !todo.done
      const todos = s.todos.map((t) => (t.id === id ? { ...t, done, completedAt: done ? nowISO() : null } : t))
      let timelineEvents = s.timelineEvents
      if (done && syncInteraction && todo.personId) {
        timelineEvents = [
          ...timelineEvents,
          {
            id: uid('ev'),
            personId: todo.personId,
            type: 'todo_completed',
            content: `完成待办：${todo.title}`,
            occurredAt: nowISO(),
          },
        ]
      }
      commit({ todos, timelineEvents })
    },

    // 删除只是挪进回收站，误删可在待办中心恢复
    deleteTodo: (id) =>
      commit({ todos: get().todos.map((t) => (t.id === id ? { ...t, deletedAt: nowISO() } : t)) }),
    restoreTodo: (id) =>
      commit({ todos: get().todos.map((t) => (t.id === id ? { ...t, deletedAt: null } : t)) }),
    purgeTodo: (id) => commit({ todos: get().todos.filter((t) => t.id !== id) }),

    addAnniversary: (ann) => {
      commit({ anniversaries: [...get().anniversaries, { ...ann, id: uid('ann') }] })
    },

    deleteAnniversary: (id) => commit({ anniversaries: get().anniversaries.filter((a) => a.id !== id) }),

    addField: (def) => {
      const s = get()
      if (s.fieldDefinitions.some((d) => d.key === def.key)) return
      const next: FieldDefinition = { ...def, createdAt: nowISO(), updatedAt: nowISO() }
      commit({
        fieldDefinitions: [...s.fieldDefinitions, next].sort((a, b) => a.sortOrder - b.sortOrder),
        settings: audit({
          action: 'field_create',
          target: def.label,
          detail: `新增字段（${def.type}）`,
          affected: 0,
          at: nowISO(),
        } as never),
      })
    },

    updateField: (key, patch) => {
      const s = get()
      const def = s.fieldDefinitions.find((d) => d.key === key)
      if (!def) return
      const locked = def.isLocked
      const safe: Partial<FieldDefinition> = { ...patch }
      if (locked) {
        delete safe.type
        delete safe.key
        delete safe.required
        delete safe.visible
        delete safe.config
        delete safe.isLocked
        delete safe.group
      }
      const nextDefs = s.fieldDefinitions.map((d) =>
        d.key === key ? { ...d, ...safe, updatedAt: nowISO() } : d,
      )
      let settings = s.settings
      if (patch.label && patch.label !== def.label) {
        settings = audit({
          action: 'field_rename',
          target: def.label,
          detail: `重命名为「${patch.label}」`,
          affected: s.persons.length,
          at: nowISO(),
        } as never)
      }
      commit({
        fieldDefinitions: nextDefs.sort((a, b) => a.sortOrder - b.sortOrder),
        settings,
      })
    },

    deleteField: (key) => {
      const s = get()
      const def = s.fieldDefinitions.find((d) => d.key === key)
      if (!def || def.isLocked) return
      const values: Record<string, unknown> = {}
      for (const p of s.persons) if (p.fields[key] !== undefined) values[p.id] = p.fields[key]
      void appendSnapshot({
        id: uid('snap'),
        at: nowISO(),
        reason: `删除字段「${def.label}」前快照`,
        kind: 'field',
        personCount: Object.keys(values).length,
        size: JSON.stringify(values).length,
        fieldKey: key,
        fieldLabel: def.label,
        data: { key, label: def.label, values },
      })
      const persons = s.persons.map((p) => {
        const fields = { ...p.fields }
        delete fields[key]
        return { ...p, fields }
      })
      commit({
        fieldDefinitions: s.fieldDefinitions.filter((d) => d.key !== key),
        persons,
        settings: audit({
          action: 'field_delete',
          target: def.label,
          detail: `删除字段，影响 ${Object.keys(values).length} 条记录`,
          affected: Object.keys(values).length,
          at: nowISO(),
        } as never),
      })
    },

    reorderFields: (keys) => {
      const s = get()
      const defs = s.fieldDefinitions.map((d) => {
        const idx = keys.indexOf(d.key)
        return idx >= 0 ? { ...d, sortOrder: idx } : d
      })
      commit({ fieldDefinitions: defs.sort((a, b) => a.sortOrder - b.sortOrder) })
    },

    restoreFieldSnapshot: async (snapshotId) => {
      const list = (await idbGet<PersistedSnapshot[]>('snapshots')) ?? []
      const snap = list.find((x) => x.id === snapshotId)
      if (!snap || snap.kind !== 'field') return
      const payload = snap.data as { key: string; label: string; values: Record<string, unknown> }
      const s = get()
      const persons = s.persons.map((p) =>
        payload.values[p.id] !== undefined ? { ...p, fields: { ...p.fields, [payload.key]: payload.values[p.id] } } : p,
      )
      commit({ persons })
      const rest = list.filter((x) => x.id !== snapshotId)
      await idbSet('snapshots', rest)
      set({ snapshots: rest.map(({ data: _d, ...x }) => x) })
    },

    addGroup: (name, color) => {
      const s = get()
      const existing = s.groups.find((g) => g.name.trim() === name.trim())
      if (existing) return existing.id
      const group: Group = { id: uid('grp'), name: name.trim(), color, sortOrder: s.groups.length }
      commit({ groups: [...s.groups, group] })
      return group.id
    },

    updateGroup: (id, patch) => {
      commit({ groups: get().groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) })
    },

    deleteGroup: (id) => {
      const s = get()
      const persons = s.persons.map((p) =>
        p.fields.groups === id ? { ...p, fields: { ...p.fields, groups: '' } } : p,
      )
      commit({ groups: s.groups.filter((g) => g.id !== id), persons })
    },

    reorderGroups: (ids) => {
      commit({
        groups: get().groups.map((g) => ({ ...g, sortOrder: ids.indexOf(g.id) >= 0 ? ids.indexOf(g.id) : g.sortOrder })),
      })
    },

    addTag: (name) => {
      const s = get()
      const existing = s.tags.find((t) => t.name === name.trim())
      if (existing) return existing.id
      const tag: Tag = { id: uid('tag'), name: name.trim(), usageCount: 0 }
      commit({ tags: [...s.tags, tag] })
      return tag.id
    },

    renameTag: (id, name) => {
      commit({ tags: get().tags.map((t) => (t.id === id ? { ...t, name } : t)) })
    },

    deleteTag: (id) => {
      const s = get()
      const persons = s.persons.map((p) => {
        const tags = (p.fields.tags as string[]) ?? []
        if (!tags.includes(id)) return p
        return { ...p, fields: { ...p.fields, tags: tags.filter((t) => t !== id) } }
      })
      commit({ tags: s.tags.filter((t) => t.id !== id), persons })
    },

    saveSmartView: (view) => {
      const s = get()
      const exists = s.settings.smartViews.some((v) => v.id === view.id)
      const smartViews = exists
        ? s.settings.smartViews.map((v) => (v.id === view.id ? { ...view, updatedAt: nowISO() } : v))
        : [...s.settings.smartViews, { ...view, createdAt: nowISO(), updatedAt: nowISO() }]
      commit({ settings: { ...s.settings, smartViews } })
    },

    deleteSmartView: (id) => {
      const s = get()
      const view = s.settings.smartViews.find((v) => v.id === id)
      if (view?.isSystem) return
      commit({ settings: { ...s.settings, smartViews: s.settings.smartViews.filter((v) => v.id !== id) } })
    },

    updateProfile: (patch) => {
      const s = get()
      commit({ settings: { ...s.settings, profile: { ...s.settings.profile, ...patch } } })
    },

    updatePolicy: (patch) => {
      const s = get()
      commit({ settings: { ...s.settings, reminderPolicy: { ...s.settings.reminderPolicy, ...patch } } })
    },

    setContactChannels: (list) => {
      const s = get()
      commit({ settings: { ...s.settings, contactChannels: list } })
    },

    addAttachments: async (personId, fieldKey, files) => {
      const s = get()
      const attachments = { ...s.attachments }
      const def = s.fieldDefinitions.find((d) => d.key === fieldKey)
      const person = s.persons.find((p) => p.id === personId)
      if (!person) return
      const current = (person.fields[fieldKey] as AttachmentMeta[]) ?? []
      const limit = def?.config.maxFiles ?? 50
      const added: AttachmentMeta[] = []
      for (const file of files.slice(0, Math.max(0, limit - current.length))) {
        const processed = await processFile(file)
        attachments[processed.id] = processed
        added.push(processed)
      }
      const next = def?.config.multiple === false ? added.slice(0, 1) : [...current, ...added]
      get().updatePerson(personId, { [fieldKey]: next })
    },

    addAttachmentFile: async (file) => {
      const processed = await processFile(file)
      commit({ attachments: { ...get().attachments, [processed.id]: processed } })
      return processed
    },

    uploadProfileAvatar: async (file) => {
      const processed = await processFile(file)
      const s = get()
      const attachments = { ...s.attachments, [processed.id]: processed }
      commit({
        attachments,
        settings: {
          ...s.settings,
          profile: { ...s.settings.profile, avatarAttachmentId: processed.id },
        },
      })
    },

    bulkAddPersons: (incoming, mode) => {
      const s = get()
      const persons = [...s.persons]
      const keyOf = (p: Person) =>
        `${String(p.fields.name ?? '').trim()}|${(p.fields.phones as PhoneValue[])?.[0]?.number?.replace(/\D/g, '') ?? ''}`
      const existingMap = new Map(persons.map((p) => [keyOf(p), p]))
      let added = 0
      let skipped = 0
      let overwritten = 0
      for (const p of incoming) {
        const key = keyOf(p)
        const existing = existingMap.get(key)
        if (existing) {
          if (mode === 'skip') {
            skipped++
            continue
          }
          if (mode === 'overwrite') {
            const idx = persons.findIndex((x) => x.id === existing.id)
            persons[idx] = { ...existing, fields: { ...existing.fields, ...p.fields }, updatedAt: nowISO() }
            overwritten++
            continue
          }
        }
        const fresh = { ...p, id: mode === 'new' ? uid('person') : p.id }
        persons.push(fresh)
        existingMap.set(keyOf(fresh), fresh)
        added++
      }
      commit({
        persons,
        settings: audit({
          action: 'import',
          target: '批量导入',
          detail: `新增 ${added}，覆盖 ${overwritten}，跳过 ${skipped}`,
          affected: added + overwritten,
          at: nowISO(),
        } as never),
      })
      return { added, skipped, overwritten }
    },

    deleteMany: (ids) => {
      const s = get()
      const set_ = new Set(ids)
      commit({
        persons: s.persons.filter((p) => !set_.has(p.id)),
        todos: s.todos.filter((t) => !t.personId || !set_.has(t.personId)),
        anniversaries: s.anniversaries.filter((a) => !set_.has(a.personId)),
        timelineEvents: s.timelineEvents.filter((e) => !set_.has(e.personId)),
      })
    },

    bulkPatch: (ids, fields) => {
      const s = get()
      const set_ = new Set(ids)
      commit({
        persons: s.persons.map((p) =>
          set_.has(p.id) ? { ...p, fields: { ...p.fields, ...fields }, updatedAt: nowISO() } : p,
        ),
      })
    },

    loadDemo: () => {
      const demo = buildDemoData()
      const s = get()
      const defs = [...s.fieldDefinitions.filter((d) => !demo.extraFields.some((e) => e.key === d.key)), ...demo.extraFields].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      )
      commit({
        groups: demo.groups,
        persons: demo.persons,
        todos: demo.todos,
        anniversaries: demo.anniversaries,
        timelineEvents: demo.timelineEvents,
        tags: demo.tags,
        fieldDefinitions: defs,
        settings: {
          ...s.settings,
          profile: {
            ...s.settings.profile,
            nickname: '林知远',
            bio: '做产品，也做投资。喜欢长跑和手冲咖啡。',
            company: '存知科技',
            city: '深圳',
            phone: { label: '手机', number: '13800138000' },
            email: { label: '工作', address: 'hi@cunzhi.app' },
          },
        },
      })
      set({ prefs: { ...get().prefs, landingSeen: true } })
      savePrefs(get().prefs)
    },

    openPackage: async () => {
      const picked = await pickPackageFile()
      if (!picked) return { ok: false, message: '已取消' }
      const parsed = await parsePackageText(picked.text)
      if (parsed.needsPassword) {
        fileHandle = picked.handle ?? null
        set({ pendingUnlock: { text: picked.text, fileName: picked.name } })
        return { ok: false, needsPassword: true, message: '该数据包已加密，请输入口令' }
      }
      applySlots(pkgToSlots(parsed.pkg), {
        revision: parsed.pkg.revision,
        createdAt: parsed.pkg.createdAt,
        updatedAt: parsed.pkg.updatedAt,
      })
      // 没有拿到文件句柄（浏览器不支持 File System Access，或用户拒绝了授权）
      // → 只能把数据包当只读来源，改动保存在浏览器工作副本里
      if (!picked.handle) {
        fileHandle = null
        lastFileWrite = null
        await idbDel('handle')
        await idbDel('handleMeta')
        set({
          pkg: {
            fileName: picked.name,
            status: 'no-file',
            lastSavedAt: nowISO(),
            encrypted: false,
            hasHandle: false,
            error: null,
          },
          readOnly: false,
        })
        broadcast?.postMessage({ type: 'release' })
        await flushDb()
        return {
          ok: true,
          message: parsed.migrated ? '数据包已迁移到当前版本，改动保存在浏览器工作副本' : '数据包已加载，改动保存在浏览器工作副本',
        }
      }
      fileHandle = picked.handle
      lastFileWrite = { lastModified: picked.lastModified, size: picked.size }
      await idbSet('handle', picked.handle)
      await idbSet('handleMeta', {
        fileName: picked.name,
        lastModified: picked.lastModified,
        size: picked.size,
      })
      set({
        pkg: {
          fileName: picked.name,
          status: 'saved',
          lastSavedAt: nowISO(),
          encrypted: false,
          hasHandle: true,
          error: null,
        },
        pendingUnlock: null,
        readOnly: false,
      })
      await flushDb()
      return { ok: true, message: parsed.migrated ? '数据包已迁移到当前版本' : undefined }
    },

    unlockPending: async (password) => {
      const pending = get().pendingUnlock
      if (!pending) return { ok: false }
      try {
        const parsed = await parsePackageText(pending.text, password)
        applySlots(pkgToSlots(parsed.pkg), {
          revision: parsed.pkg.revision,
          createdAt: parsed.pkg.createdAt,
          updatedAt: parsed.pkg.updatedAt,
        })
        pkgPassword = password
        if (fileHandle) {
          const f = await fileHandle.getFile()
          lastFileWrite = { lastModified: f.lastModified, size: f.size }
          await idbSet('handle', fileHandle)
          await idbSet('handleMeta', { fileName: pending.fileName, lastModified: f.lastModified, size: f.size })
        }
        set({
          pkg: {
            fileName: pending.fileName,
            status: fileHandle ? 'saved' : 'no-file',
            lastSavedAt: nowISO(),
            encrypted: true,
            hasHandle: !!fileHandle,
            error: null,
          },
          pendingUnlock: null,
        })
        await flushDb()
        return { ok: true }
      } catch (e) {
        return { ok: false, message: `口令错误或文件损坏：${humanizeFileError(e)}` }
      }
    },

    savePackageAsFile: async (name) => {
      const s = get()
      const pkg = buildPackage(slotsOf(s), {
        revision: s.revision,
        createdAt: s.pkgCreatedAt,
        updatedAt: s.pkgUpdatedAt,
      })
      const text = await encodePackageForWrite(pkg, s.pkg.encrypted ? pkgPassword : null)
      const stamp = new Date()
      const suggested = name ?? `存知数据包_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}.czdb`
      try {
        const res = await savePackageAs(text, suggested)
        if (!res) return false
        if (res.handle) {
          fileHandle = res.handle
          lastFileWrite = { lastModified: res.lastModified, size: res.size }
          await idbSet('handle', res.handle)
          await idbSet('handleMeta', { fileName: res.name, lastModified: res.lastModified, size: res.size })
          set({
            pkg: {
              ...get().pkg,
              fileName: res.name,
              hasHandle: true,
              status: 'saved',
              lastSavedAt: nowISO(),
              error: null,
            },
          })
        } else {
          set({ pkg: { ...get().pkg, fileName: res.name, status: 'no-file', lastSavedAt: nowISO() } })
        }
        await flushDb()
        return true
      } catch (e) {
        if ((e as Error).name === 'AbortError') return false
        set({ pkg: { ...get().pkg, status: 'error', error: humanizeFileError(e) } })
        return false
      }
    },

    closePackage: async () => {
      await writeToFile()
      fileHandle = null
      lastFileWrite = null
      pkgPassword = null
      await idbDel('handle')
      await idbDel('handleMeta')
      set({
        pkg: { fileName: null, status: 'idle', lastSavedAt: null, encrypted: false, hasHandle: false, error: null },
        readOnly: false,
      })
      broadcast?.postMessage({ type: 'release' })
    },

    reauthorize: async () => {
      if (!fileHandle) return false
      const ok = await ensureHandlePermission(fileHandle)
      if (ok) {
        set({ pkg: { ...get().pkg, status: 'saved', error: null } })
        await writeToFile()
      }
      return ok
    },

    resolveConflict: async (action) => {
      const conflict = get().conflict
      if (!conflict) return
      if (action === 'reload') {
        if (!fileHandle) return
        const file = await fileHandle.getFile()
        const text = await file.text()
        const parsed = await parsePackageText(text, pkgPassword ?? undefined)
        applySlots(pkgToSlots(parsed.pkg), {
          revision: parsed.pkg.revision,
          createdAt: parsed.pkg.createdAt,
          updatedAt: parsed.pkg.updatedAt,
        })
        lastFileWrite = { lastModified: file.lastModified, size: file.size }
        set({ conflict: null, pkg: { ...get().pkg, status: 'saved', error: null, lastSavedAt: nowISO() } })
        await flushDb()
      } else if (action === 'overwrite') {
        set({ conflict: null })
        await writeToFile(true)
      } else {
        set({ conflict: null })
        await get().savePackageAsFile()
      }
    },

    toggleEncryption: async (password) => {
      const s = get()
      pkgPassword = password
      set({ pkg: { ...s.pkg, encrypted: !!password } })
      if (fileHandle) {
        await writeToFile(true)
      } else {
        await get().savePackageAsFile()
      }
    },

    createSnapshot: async (reason, kind = 'manual') => {
      const s = get()
      const pkg = buildPackage(slotsOf(s), {
        revision: s.revision,
        createdAt: s.pkgCreatedAt,
        updatedAt: s.pkgUpdatedAt,
      })
      const text = JSON.stringify(pkg)
      const snap: PersistedSnapshot = {
        id: uid('snap'),
        at: nowISO(),
        reason,
        kind,
        personCount: s.persons.length,
        size: text.length,
        data: pkg,
      }
      const list = (await idbGet<PersistedSnapshot[]>('snapshots')) ?? []
      let next = [snap, ...list]
      const autos = next.filter((x) => x.kind === 'auto')
      if (autos.length > MAX_AUTO_SNAPSHOTS) {
        const drop = new Set(autos.slice(MAX_AUTO_SNAPSHOTS).map((x) => x.id))
        next = next.filter((x) => !drop.has(x.id))
      }
      next = next.filter((x) => x.kind !== 'field' || Date.now() - new Date(x.at).getTime() < 7 * 86400000)
      await idbSet('snapshots', next)
      set({ snapshots: next.map(({ data: _d, ...rest }) => rest) })
    },

    restoreSnapshot: async (id) => {
      const list = (await idbGet<PersistedSnapshot[]>('snapshots')) ?? []
      const snap = list.find((x) => x.id === id)
      if (!snap) return
      if (snap.kind === 'field') {
        await get().restoreFieldSnapshot(id)
        return
      }
      const pkg = snap.data as DataPackage
      applySlots(pkgToSlots(pkg), {
        revision: pkg.revision,
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt,
      })
      set({ pkg: { ...get().pkg, status: 'dirty' } })
      schedulePersist()
    },

    exportJSON: () => {
      const s = get()
      const pkg = buildPackage(slotsOf(s), {
        revision: s.revision,
        createdAt: s.pkgCreatedAt,
        updatedAt: s.pkgUpdatedAt,
      })
      const stamp = fmtFileStamp()
      downloadText(JSON.stringify(pkg, null, 2), `存知_快照_${stamp}.json`, 'application/json')
      const at = nowISO()
      const prefs = { ...s.prefs, lastBackupAt: at }
      savePrefs(prefs)
      set({
        prefs,
        lastBackupWarning: false,
        settings: { ...s.settings, lastBackupAt: at },
      })
    },

    exportCSVFile: (ids) => {
      const s = get()
      const ctx = buildCtx({ ...s, ...{ fieldDefinitions: s.fieldDefinitions } } as AppState)
      const list = ids ? s.persons.filter((p) => ids.includes(p.id)) : s.persons
      const { text } = exportCSV(list, s.fieldDefinitions, ctx)
      downloadText(text, `存知_导出_${fmtFileStamp()}.csv`, 'text/csv;charset=utf-8')
      set({ prefs: { ...s.prefs, lastBackupAt: nowISO() }, settings: { ...s.settings, lastBackupAt: nowISO() } })
    },

    exportVCardFile: (ids) => {
      const s = get()
      const ctx = buildCtx(s)
      const list = ids ? s.persons.filter((p) => ids.includes(p.id)) : s.persons
      const text = toVCard(list, s.fieldDefinitions, ctx, s.attachments)
      downloadText(text, `存知_名片_${fmtFileStamp()}.vcf`, 'text/vcard;charset=utf-8')
    },

    importPackageData: (pkg) => {
      applySlots(pkgToSlots(pkg), {
        revision: pkg.revision,
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt,
      })
      set({ pkg: { ...get().pkg, status: 'dirty' } })
      schedulePersist()
    },

    resetAll: async () => {
      undoStack = []
      set({
        ...emptySlots(),
        revision: 1,
        pkgCreatedAt: nowISO(),
        pkgUpdatedAt: nowISO(),
        snapshots: [],
        pkg: { fileName: null, status: 'idle', lastSavedAt: null, encrypted: false, hasHandle: false, error: null },
      })
      fileHandle = null
      lastFileWrite = null
      pkgPassword = null
      await idbDel('handle')
      await idbDel('handleMeta')
      await idbSet('data', buildPackage(slotsOf(get()), { revision: 1 }))
      await idbDel('snapshots')
    },

    lockApp: (pin) => {
      set({ locked: !!pin, prefs: { ...get().prefs, pinLock: pin } })
      savePrefs({ ...get().prefs, pinLock: pin })
    },

    unlockApp: (pin) => {
      if (get().prefs.pinLock === pin) {
        set({ locked: false })
        return true
      }
      return false
    },
  }
})

function pkgToSlots(pkg: DataPackage): DataSlots {
  return {
    fieldDefinitions: pkg.fieldDefinitions,
    groups: pkg.groups,
    tags: pkg.tags,
    persons: pkg.persons,
    todos: pkg.todos,
    anniversaries: pkg.anniversaries,
    timelineEvents: pkg.timelineEvents,
    attachments: pkg.attachments,
    settings: { ...pkg.settings, contactChannels: normalizeChannels(pkg.settings?.contactChannels) },
  }
}

export function buildCtx(s: AppState): DeriveCtx {
  return {
    fieldDefinitions: s.fieldDefinitions,
    groups: s.groups,
    tags: s.tags,
    persons: s.persons,
    timelineEvents: s.timelineEvents,
    attachments: s.attachments,
  }
}

export function defaultFrequencyLabel(days: number): string {
  const hit = FREQUENCY_OPTIONS.find((o) => o.days === days)
  return hit ? hit.label : `${days} 天`
}

async function appendSnapshot(snap: PersistedSnapshot): Promise<void> {
  const list = (await idbGet<PersistedSnapshot[]>('snapshots')) ?? []
  const next = [snap, ...list]
  await idbSet('snapshots', next)
  useStore.setState({ snapshots: next.map(({ data: _d, ...rest }) => rest) })
}

/* 图片压缩：长边 ≤2048，生成 200px 缩略图 */
async function processFile(file: File): Promise<AttachmentData> {
  const id = uid('att')
  const base: AttachmentMeta = {
    id,
    name: file.name,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    uploadedAt: nowISO(),
  }
  if (!file.type.startsWith('image/')) {
    const data = await readAsDataURL(file)
    return { ...base, data }
  }
  try {
    const img = await loadImage(file)
    const scale = Math.min(1, 2048 / Math.max(img.width, img.height))
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unavailable')
    ctx.drawImage(img, 0, 0, w, h)
    const data = canvas.toDataURL('image/jpeg', 0.86)
    const tScale = Math.min(1, 200 / Math.max(w, h))
    const tw = Math.max(1, Math.round(w * tScale))
    const th = Math.max(1, Math.round(h * tScale))
    const tc = document.createElement('canvas')
    tc.width = tw
    tc.height = th
    tc.getContext('2d')?.drawImage(img, 0, 0, tw, th)
    const thumbnail = tc.toDataURL('image/jpeg', 0.7)
    return { ...base, width: w, height: h, data, thumbnail, size: Math.round(data.length * 0.75) }
  } catch {
    const data = await readAsDataURL(file)
    return { ...base, data }
  }
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}

