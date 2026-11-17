<!-- Svelte 入口：onMount 返回的清理函数就是销毁入口 -->
<script>
  import { onMount } from 'svelte'
  import { createGlassTabMenu } from '../../src/components/glass/GlassTabMenuEngine.js'

  export let height = 480
  export let reducedMotion = undefined
  export let value = 0

  let host
  let engine = null

  onMount(() => {
    engine = createGlassTabMenu({
      container: host,
      height,
      reducedMotion,
      onChange: (i, item) => dispatch('change', { index: i, item }),
      onAction: (action, item) => dispatch('action', { action, item }),
    })
    engine.setValue(value, false)
    return () => {
      engine.destroy()
      engine = null
    }
  })

  $: if (engine) engine.setOptions({ height, reducedMotion })
  $: if (engine) engine.setValue(value)
</script>

<div bind:this={host} style="position:relative;height:{height}px" />
