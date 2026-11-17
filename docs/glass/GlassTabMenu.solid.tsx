// Solid 入口：onMount / onCleanup 成对出现
import { createEffect, onCleanup, onMount } from 'solid-js'
import { createGlassTabMenu } from '../../src/components/glass/GlassTabMenuEngine.js'

export function GlassTabMenu(props: { height?: number; reducedMotion?: boolean; onChange?: (i: number) => void }) {
  let host!: HTMLDivElement
  let engine: ReturnType<typeof createGlassTabMenu> | null = null

  onMount(() => {
    engine = createGlassTabMenu({
      container: host,
      height: props.height ?? 480,
      reducedMotion: props.reducedMotion,
      onChange: (i) => props.onChange?.(i),
    })
    onCleanup(() => {
      engine?.destroy()
      engine = null
    })
  })

  createEffect(() => {
    engine?.setOptions({ height: props.height ?? 480, reducedMotion: props.reducedMotion })
  })

  return <div ref={host} style={{ position: 'relative', height: `${props.height ?? 480}px` }} />
}
