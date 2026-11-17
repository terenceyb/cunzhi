<!-- Svelte 入口：onMount 返回的清理函数就是销毁入口 -->
<script>
  import { onMount } from 'svelte'
  import { createElasticPanelResize } from '../../src/components/elastic/ElasticPanelResizeEngine.js'

  export let height = 520
  export let reducedMotion = undefined

  let host
  let panel
  let engine = null

  onMount(() => {
    engine = createElasticPanelResize({ host, panel, rightGap: 17, reducedMotion })
    return () => {
      engine.destroy()
      engine = null
    }
  })

  $: if (engine) {
    engine.refresh()
    engine.setOptions({ reducedMotion })
  }
</script>

<div bind:this={host} class="epr-scene" style="height:{height}px">
  <div bind:this={panel} class="epr-scene-panel" />
</div>
