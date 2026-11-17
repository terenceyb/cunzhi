import { create } from 'zustand'
import type { FilterNode, SmartView } from './types'
import { emptyFilter } from './lib/filter'
import { deepClone } from './lib/utils'

export type RouteName = 'welcome' | 'dashboard' | 'people' | 'interactions' | 'settings' | 'profile'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  secondaryText?: string
  onSecondary?: () => void
}
export interface PromptOptions {
  title: string
  message?: string
  placeholder?: string
  type?: 'text' | 'password'
  defaultValue?: string
  confirmText?: string
  onSubmit: (value: string) => void
}

export interface ToastItem {
  id: number
  text: string
  kind: 'success' | 'error' | 'warn' | 'info'
}

interface UIState {
  route: RouteName
  settingsTab: string
  settingsDetail: boolean
  selectedId: string | null
  detailOpen: boolean
  searchOpen: boolean
  quickNoteOpen: boolean
  uploadOpen: boolean
  newPersonOpen: boolean
  personFormOpen: boolean
  editingPersonId: string | null
  importOpen: boolean
  smartViewDialogOpen: boolean
  sidebarCollapsed: boolean
  filterOpen: boolean
  filterMode: 'panel' | 'inline'
  filterDraft: FilterNode
  filter: FilterNode
  activeSmartViewId: string | null
  smartViewDraft: SmartView | null
  toasts: ToastItem[]
  confirm: ConfirmOptions | null
  prompt: PromptOptions | null
  peopleView: 'cards' | 'grid' | 'table' | 'network'
  networkMode: 'overview' | 'referral' | 'between'
  mobileDetail: boolean

  navigate: (route: RouteName, opts?: { tab?: string }) => void
  openPerson: (id: string) => void
  openPersonForm: (id?: string | null) => void
  closePersonForm: () => void
  closePerson: () => void
  openSettingsTab: (tab: string) => void
  backToSettingsIndex: () => void
  setFilter: (f: FilterNode) => void
  openFilter: (mode?: 'panel' | 'inline') => void
  closeFilter: (apply: boolean) => void
  setDraft: (f: FilterNode) => void
  clearFilter: () => void
  applySmartView: (view: SmartView) => void
  setPeopleView: (v: UIState['peopleView']) => void
  setNetworkMode: (m: UIState['networkMode']) => void
  toast: (text: string, kind?: ToastItem['kind']) => void
  dismissToast: (id: number) => void
  askConfirm: (opts: ConfirmOptions) => void
  closeConfirm: () => void
  askPrompt: (opts: PromptOptions) => void
  closePrompt: () => void
}

let toastSeq = 0
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>()

export const useUI = create<UIState>((set, get) => ({
  route: 'dashboard',
  settingsTab: 'profile',
  settingsDetail: false,
  selectedId: null,
  detailOpen: false,
  searchOpen: false,
  quickNoteOpen: false,
  uploadOpen: false,
  newPersonOpen: false,
  personFormOpen: false,
  editingPersonId: null,
  importOpen: false,
  smartViewDialogOpen: false,
  sidebarCollapsed: false,
  filterOpen: false,
  filterMode: 'panel',
  filterDraft: emptyFilter(),
  filter: emptyFilter(),
  activeSmartViewId: null,
  smartViewDraft: null,
  toasts: [],
  confirm: null,
  prompt: null,
  peopleView: 'cards',
  networkMode: 'overview',
  mobileDetail: false,

  navigate: (route, opts) =>
    set({
      route,
      ...(opts?.tab ? { settingsTab: opts.tab } : {}),
      // 移动端：带 tab 进入 = 直接看某个分页；不带 tab = 停在设置索引
      ...(route === 'settings' ? { settingsDetail: !!opts?.tab } : {}),
      detailOpen: false,
      filterOpen: false,
      searchOpen: false,
    }),

  openPerson: (id) =>
    set((st) => ({
      selectedId: id,
      detailOpen: true,
      mobileDetail: true,
      // 从工作台/关系网/搜索等任意位置打开都要能落到人脉页的详情面板
      route: st.route === 'welcome' ? st.route : 'people',
    })),
  openPersonForm: (id) => set({ personFormOpen: true, editingPersonId: id ?? null }),
  closePersonForm: () => set({ personFormOpen: false, editingPersonId: null }),
  closePerson: () => set({ detailOpen: false, mobileDetail: false }),

  openSettingsTab: (tab) => set({ settingsTab: tab, settingsDetail: true }),
  backToSettingsIndex: () => set({ settingsDetail: false }),
  setFilter: (f) => set({ filter: f }),
  openFilter: (mode = 'panel') =>
    set({ filterOpen: true, filterMode: mode, filterDraft: deepClone(get().filter) }),
  closeFilter: (apply) => {
    set(apply ? { filter: deepClone(get().filterDraft), filterOpen: false } : { filterOpen: false })
  },
  setDraft: (f) => set({ filterDraft: f }),
  clearFilter: () => set({ filter: emptyFilter(), filterDraft: emptyFilter(), activeSmartViewId: null }),

  applySmartView: (view) =>
    set({ filter: deepClone(view.filter), filterDraft: deepClone(view.filter), activeSmartViewId: view.id }),

  setPeopleView: (v) => set({ peopleView: v }),
  setNetworkMode: (m) => set({ networkMode: m }),

  toast: (text, kind = 'info') => {
    const id = ++toastSeq
    set({ toasts: [...get().toasts, { id, text, kind }] })
    const timer = setTimeout(() => get().dismissToast(id), 2800)
    toastTimers.set(id, timer)
  },
  dismissToast: (id) => {
    const t = toastTimers.get(id)
    if (t) clearTimeout(t)
    toastTimers.delete(id)
    set({ toasts: get().toasts.filter((x) => x.id !== id) })
  },
  askConfirm: (opts) => set({ confirm: opts }),
  closeConfirm: () => set({ confirm: null }),
  askPrompt: (opts) => set({ prompt: opts }),
  closePrompt: () => set({ prompt: null }),
}))
