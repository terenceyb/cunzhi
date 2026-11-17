<!-- Vue 3 入口：onMounted 里建实例，onBeforeUnmount 里销毁 -->
<template>
  <div ref="hostRef" class="epr-scene" :style="{ height: height + 'px' }">
    <div ref="panelRef" class="epr-scene-panel" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createElasticPanelResize } from '../../src/components/elastic/ElasticPanelResizeEngine.js'

const props = defineProps({ height: { type: Number, default: 520 }, reducedMotion: Boolean })
const hostRef = ref(null)
const panelRef = ref(null)
let engine = null

onMounted(() => {
  engine = createElasticPanelResize({
    host: hostRef.value,
    panel: panelRef.value,
    rightGap: 17,
    reducedMotion: props.reducedMotion,
  })
})

/* 改高度只刷新测量，不重挂载 */
watch(() => props.height, () => engine && engine.refresh())
watch(() => props.reducedMotion, (v) => engine && engine.setOptions({ reducedMotion: v }))

onBeforeUnmount(() => {
  engine && engine.destroy()
  engine = null
})
</script>
