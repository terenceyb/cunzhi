/**
 * GIcon.tsx —— 灰阶立体图标（与移动端底部导航同一套材质）
 *
 * 图形与渐变都在 components/glass/icons.js 里，这里只包一层 React：
 * 每个实例生成唯一前缀，渐变 ID 不会互相覆盖；
 * 颜色走 --gi-* 变量，所以换主题色时整套图标跟着变。
 */

import { useId } from 'react'
import type { CSSProperties } from 'react'
import { iconSvg } from './icons'

export interface GIconProps {
  name: string
  size?: number
  className?: string
  style?: CSSProperties
}

export function GIcon({ name, size = 20, className, style }: GIconProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const html = iconSvg(name, uid)
  if (!html) return null
  return (
    <span
      className={className ? `gi ${className}` : 'gi'}
      style={{ ...style, ['--gi-size' as string]: `${size}px` }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default GIcon
