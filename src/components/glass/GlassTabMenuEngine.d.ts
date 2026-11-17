/**
 * GlassTabMenuEngine.d.ts
 * 与 GlassTabMenuEngine.js 一一对应的类型声明。
 */

export interface GlassTabItem {
  /** 图标键：calendar | notes | people | folder | note | checklist | photo | scan | voice | sketch */
  key: string
  /** 无障碍名称（标签栏不显示文字） */
  label: string
}

export interface GlassMenuItem {
  key: string
  label: string
  /** 触发 glass-tab-action 时带出的英文名，缺省用 key */
  action?: string
}

export interface GlassTabMenuOptions {
  /** 宿主元素：引擎会在它上面挂 ShadowRoot */
  container: HTMLElement
  items?: GlassTabItem[]
  menuItems?: GlassMenuItem[]
  /** 初始选中的标签下标 */
  value?: number
  /** 场景高度（px）；不传时按内容自动计算 */
  height?: number
  /** 覆盖系统「减少动态效果」偏好；不传则读 matchMedia */
  reducedMotion?: boolean
  /** 舞台对齐方式：居中（设计稿默认）或贴底（当导航栏用） */
  align?: 'center' | 'bottom'
  /** 缩放基准：min 取宽高较小值；width 只按宽度 */
  fit?: 'min' | 'width'
  /** 贴底时圆按钮距容器底部的距离 */
  padBottom?: number
  /** 透明背景：集成到真实页面时不要那块浅灰紫画布 */
  transparent?: boolean
  fabLabelOpen?: string
  fabLabelClose?: string
  ariaLabel?: string
  /** 选中项变化 */
  onChange?: (index: number, item: GlassTabItem) => void
  /** 点击菜单项 */
  onAction?: (action: string, item: GlassMenuItem) => void
  /** 自定义事件名，默认 glass-tab-action */
  actionEvent?: string
}

export interface GlassTabMenuState {
  open: boolean
  value: number
  opening: number
  selection: number
  compression: number
  press: number
  content: number
}

export interface GlassTabMenuInstance {
  host: HTMLElement
  scene: HTMLElement
  stage: HTMLElement
  group: HTMLElement
  getState(): GlassTabMenuState
  setValue(index: number, animate?: boolean): void
  setOpen(open: boolean): void
  toggle(): void
  setOptions(next: Partial<GlassTabMenuOptions>): void
  refresh(): void
  destroy(): void
  destroyed: boolean
}

export declare const DEFAULT_ITEMS: GlassTabItem[]
export declare const DEFAULT_MENU: GlassMenuItem[]

export declare function createGlassTabMenu(options: GlassTabMenuOptions): GlassTabMenuInstance
export default createGlassTabMenu
