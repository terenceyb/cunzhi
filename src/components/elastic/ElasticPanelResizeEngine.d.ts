/**
 * ElasticPanelResizeEngine.d.ts
 * 与 ElasticPanelResizeEngine.js 一一对应的类型声明。
 */

export interface ElasticPanelMetrics {
  /** 面板左边缘相对 host 的 x（px），含橡皮筋位移 */
  left: number
  /** 面板宽度（px） */
  width: number
  /** 名义宽度百分比：100 × (1 - left / 容器宽度) */
  percent: number
}

export interface ElasticPanelOptions {
  /** 容器：作为定位与测量基准，需要 position: relative */
  host: HTMLElement
  /** 面板：右边缘固定，宽度由引擎写入 */
  panel?: HTMLElement | null
  /** 比例模式：左边缘最小 / 最大占容器宽度的比例（越小面板越宽） */
  minRatio?: number
  maxRatio?: number
  initialRatio?: number
  /** 像素模式：给 minWidth / maxWidth 后按 px 计算边界，比例参数失效 */
  minWidth?: number
  maxWidth?: number
  initialWidth?: number
  /** 面板右边缘距容器右边的距离 */
  rightGap?: number
  /** 覆盖系统「减少动态效果」偏好；不传则读取 matchMedia */
  reducedMotion?: boolean
  ariaLabel?: string
  /** 每帧回调：适合直接写 CSS 变量，不要在里面对 React 做 setState */
  onChange?: (metrics: ElasticPanelMetrics) => void
  /** 松手 / 键盘调整 / 取消时回调：适合在这里落库 */
  onCommit?: (metrics: ElasticPanelMetrics) => void
}

export interface ElasticPanelInstance {
  el: HTMLElement
  setWidth(px: number): void
  setPosition(ratio: number): void
  getWidth(): number
  getLeft(): number
  setOptions(next: Partial<ElasticPanelOptions>): void
  refresh(): void
  destroy(): void
}

export declare const ELASTIC_DEFAULTS: {
  minRatio: number
  maxRatio: number
  initialRatio: number
  rightGap: number
  ariaLabel: string
}

export declare function createElasticPanelResize(options: ElasticPanelOptions): ElasticPanelInstance
export default createElasticPanelResize
