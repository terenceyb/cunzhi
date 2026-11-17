export type MorphItem = string | { word: string; icon?: string }

export type MorphPill = {
  items: MorphItem[]
  /** sticker：64×64 贴纸；brand：带自身 viewBox 的模型标志 */
  kind?: 'sticker' | 'brand'
  /** 静态旋转角取哪一组 */
  angleSet?: 'languages' | 'custom' | 'models'
  /** 横向偏移：数字表示整组右移，数组表示逐项右移 */
  dx?: number | number[]
}

export type MorphOptions = {
  brand?: string
  height?: number
  /** true 时隐藏字标、三行句子上移，适合把组件当纯交互文案塞进页面 */
  compact?: boolean
  reducedMotion?: boolean | null
  lines?: string[]
  pills?: MorphPill[]
}

export type MorphHandle = {
  destroy(): void
  setOptions(next: Partial<MorphOptions>): void
  readonly state: number[]
  readonly scale: number
}

export function createInlineTextMorph(host: HTMLElement, options?: MorphOptions): MorphHandle
export function graphemes(str: string): string[]
export function lcsPairs(a: string[], b: string[]): Array<[number, number]>
export const STICKERS: Record<string, string>
export const BRANDS: Record<string, string>
export const ANGLES: Record<string, number[]>
export function stickerMarkup(key: string, uid: string): string
