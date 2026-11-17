<!-- Vue 3 入口：onMounted 建实例，onBeforeUnmount 销毁 -->
<template>
  <div ref="hostRef" :style="{ height: height + 'px', position: 'relative' }" />
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createGlassTabMenu } from '../../src/components/glass/GlassTabMenuEngine.js'

const props = defineProps({
  height: { type: Number, default: 480 },
  reducedMotion: { type: Boolean, default: false },
  value: { type: Number, default: 0 },
})
const emit = defineEmits(['change', 'action'])

const hostRef = ref(null)
let engine = null

onMounted(() => {
  engine = createGlassTabMenu({
    container: hostRef.value,
    height: props.height,
    reducedMotion: props.reducedMotion,
    onChange: (i, item) => emit('change', i, item),
    onAction: (action, item) => emit('action', action, item),
  })
  engine.setValue(props.value, false)
})

/* 只改选项，不重建实例 */
watch(() => props.height, (h) => engine && engine.setOptions({ height: h }))
watch(() => props.reducedMotion, (v) => engine && engine.setOptions({ reducedMotion: v }))
watch(() => props.value, (v) => engine && engine.setValue(v))

onBeforeUnmount(() => {
  engine && engine.destroy()
  engine = null
})
</script>
