// Solid 入口：onMount / onCleanup 成对出现
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { createElasticPanelResize } from '../../src/components/elastic/ElasticPanelResizeEngine.js'

export function ElasticPanelResize(props: { height?: number; reducedMotion?: boolean }) {
  let host!: HTMLDivElement
  let panel!: HTMLDivElement
  const [engine, setEngine] = createSignal<ReturnType<typeof createElasticPanelResize> | null>(null)

  onMount(() => {
    const instance = createElasticPanelResize({
      host,
      panel,
      rightGap: 17,
      reducedMotion: props.reducedMotion,
    })
    setEngine(instance)
    onCleanup(() => instance.destroy())
  })

  createEffect(() => {
    const instance = engine()
    if (!instance) return
    instance.setOptions({ reducedMotion: props.reducedMotion })
    instance.refresh()
  })

  return (
    <div ref={host} class="epr-scene" style={{ height: `${props.height ?? 520}px` }}>
      <div ref={panel} class="epr-scene-panel" />
    </div>
  )
}
