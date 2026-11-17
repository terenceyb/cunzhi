/**
 * GlassTabMenu.tsx —— React 入口
 *
 * 只做三件事：挂载时建实例、props 变化时改选项（不重挂载）、卸载时销毁。
 * 所有布局、样式、图形、算法都在引擎里，组件本身不含任何业务视觉。
 */

import { useEffect, useRef } from 'react'
import { createGlassTabMenu } from './GlassTabMenuEngine'
import type {
  GlassMenuItem,
  GlassTabItem,
  GlassTabMenuInstance,
  GlassTabMenuOptions,
} from './GlassTabMenuEngine'

export interface GlassTabMenuProps {
  items?: GlassTabItem[]
  menuItems?: GlassMenuItem[]
  value?: number
  height?: number | string
  reducedMotion?: boolean
  align?: 'center' | 'bottom'
  fit?: 'min' | 'width'
  padBottom?: number
  transparent?: boolean
  fabLabelOpen?: string
  fabLabelClose?: string
  ariaLabel?: string
  className?: string
  style?: React.CSSProperties
  onChange?: GlassTabMenuOptions['onChange']
  onAction?: GlassTabMenuOptions['onAction']
  actionEvent?: string
}

export function GlassTabMenu({
  items,
  menuItems,
  value = 0,
  height,
  reducedMotion,
  align = 'center',
  fit = 'min',
  padBottom = 0,
  transparent = false,
  fabLabelOpen,
  fabLabelClose,
  ariaLabel,
  className,
  style,
  onChange,
  onAction,
  actionEvent,
}: GlassTabMenuProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<GlassTabMenuInstance | null>(null)
  const cbRef = useRef({ onChange, onAction })
  cbRef.current = { onChange, onAction }

  /** 结构变化才重建；高度、减少动态、主题这类只走 setOptions */
  const structKey = JSON.stringify([items?.map((i) => [i.key, i.label]), menuItems?.map((i) => [i.key, i.label, i.action])])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const engine = createGlassTabMenu({
      container: host,
      items,
      menuItems,
      value,
      height: typeof height === 'number' ? height : undefined,
      reducedMotion,
      align,
      fit,
      padBottom,
      transparent,
      fabLabelOpen,
      fabLabelClose,
      ariaLabel,
      actionEvent,
      onChange: (i, item) => cbRef.current.onChange?.(i, item),
      onAction: (action, item) => cbRef.current.onAction?.(action, item),
    })
    engineRef.current = engine
    return () => {
      engine.destroy()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structKey])

  /* 外部选中项变化 → 只改目标，不重建 */
  useEffect(() => {
    engineRef.current?.setValue(value)
  }, [value])

  useEffect(() => {
    engineRef.current?.setOptions({ reducedMotion })
  }, [reducedMotion])

  useEffect(() => {
    engineRef.current?.setOptions({ height: typeof height === 'number' ? height : undefined, align, fit, padBottom, transparent })
    engineRef.current?.refresh()
  }, [height, align, fit, padBottom, transparent])

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ position: 'relative', display: 'block', height, ...style }}
    />
  )
}

export default GlassTabMenu
