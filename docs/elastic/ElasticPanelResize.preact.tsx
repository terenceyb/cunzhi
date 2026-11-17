// Preact 入口：useEffect 的返回值即清理函数
import { useEffect, useRef } from 'preact/hooks'
import { createElasticPanelResize } from '../../src/components/elastic/ElasticPanelResizeEngine.js'

export function ElasticPanelResize({ height = 520, reducedMotion }: { height?: number; reducedMotion?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hostRef.current || !panelRef.current) return
    const engine = createElasticPanelResize({
      host: hostRef.current,
      panel: panelRef.current,
      rightGap: 17,
      reducedMotion,
    })
    return () => engine.destroy()
  }, [reducedMotion])

  return (
    <div ref={hostRef} class="epr-scene" style={{ height: `${height}px` }}>
      <div ref={panelRef} class="epr-scene-panel" />
    </div>
  )
}
