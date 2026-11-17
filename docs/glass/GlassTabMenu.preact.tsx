// Preact 入口：useEffect 的返回值即清理函数
import { useEffect, useRef } from 'preact/hooks'
import { createGlassTabMenu } from '../../src/components/glass/GlassTabMenuEngine.js'

export function GlassTabMenu({ height = 480, reducedMotion, onChange }: {
  height?: number
  reducedMotion?: boolean
  onChange?: (i: number) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hostRef.current) return
    const engine = createGlassTabMenu({
      container: hostRef.current,
      height,
      reducedMotion,
      onChange: (i) => onChange?.(i),
    })
    return () => engine.destroy()
    // 结构不变就不重建，只改选项
  }, [height, reducedMotion])

  return <div ref={hostRef} style={{ position: 'relative', height: `${height}px` }} />
}
