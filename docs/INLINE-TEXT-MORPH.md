# InlineTextMorph

三行居中句子里嵌三枚可点的浅灰胶囊。点一下换词、换贴纸，**文字按字母做 FLIP 变形**——
相同的字母保留 DOM 身份、从旧坐标滑到新坐标，多余的字母朝最近的保留字母收拢并缩小淡出，
新来的字母从邻近字母处展开。不是整词交叉淡入。

## 文件

| 文件 | 作用 |
|---|---|
| `src/components/morph/InlineTextMorph.tsx` | React 入口，只负责挂载与更新 |
| `src/components/morph/InlineTextMorphEngine.js` | 框架无关核心：DOM、测量、FLIP、指针/键盘、生命周期 |
| `src/components/morph/motion-runtime.ts` | 弹簧积分、缓动常量、共享 RAF 时间轴 |
| `src/components/morph/InlineTextMorphEngine.d.ts` | 类型声明 |
| `src/components/morph/icons.js` | 11 组贴纸 + 4 个模型标志的完整 SVG 数据 |

## 用法（React）

```tsx
import { InlineTextMorph } from '../components/morph/InlineTextMorph'

<InlineTextMorph compact height={320} brand="存知" />
```

默认就是规格里的那句英文：

```
A tool to create visual [languages],
customize [motion], and build
interfaces with [ChatGPT].
```

换成本项目的中文并自定义词表：

```tsx
<InlineTextMorph
  compact
  brand="存知"
  height={320}
  lines={['把见过的人，连成一张可 {0} 的网，', '让每一次 {1} 都有来处，', '也记得那些 {2}。']}
  pills={[
    { items: [{ word: '检索', icon: 'languages' }, { word: '回想', icon: 'motion' }], angleSet: 'languages' },
    { items: [{ word: '问候', icon: 'icons' }, { word: '拜访', icon: 'systems' }], angleSet: 'models' },
    { items: [{ word: '约定', icon: 'states' }, { word: '生日', icon: 'colors' }], angleSet: 'custom' },
  ]}
/>
```

## 其它框架入口

核心是 `createInlineTextMorph(host, options)`，返回 `{ destroy, setOptions, state, scale }`。
DOM 只在挂载后访问，同页多实例互不影响，卸载后清理动画、RAF、观察器与字体回调。

```js
// Vanilla
import { createInlineTextMorph } from './InlineTextMorphEngine.js'
const handle = createInlineTextMorph(document.querySelector('#morph'), { compact: true })
// 卸载：handle.destroy()
```

```vue
<!-- Vue 3 -->
<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createInlineTextMorph } from './InlineTextMorphEngine.js'
const el = ref(null)
let handle = null
onMounted(() => { handle = createInlineTextMorph(el.value, { compact: true }) })
onBeforeUnmount(() => handle?.destroy())
</script>
<template><div ref="el" /></template>
```

```svelte
<!-- Svelte -->
<script>
  import { onMount } from 'svelte'
  import { createInlineTextMorph } from './InlineTextMorphEngine.js'
  let el
  onMount(() => { const h = createInlineTextMorph(el, { compact: true }); return () => h.destroy() })
</script>
<div bind:this={el} />
```

```jsx
// Preact（hooks 与 React 一致，只是 import 来源不同）
import { h } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { createInlineTextMorph } from './InlineTextMorphEngine.js'

export function Morph() {
  const el = useRef(null)
  useEffect(() => {
    const h = createInlineTextMorph(el.current, { compact: true })
    return () => h.destroy()
  }, [])
  return <div ref={el} />
}
```

```jsx
// Solid
import { onMount, onCleanup } from 'solid-js'
import { createInlineTextMorph } from './InlineTextMorphEngine.js'

export function Morph() {
  let el
  onMount(() => { const h = createInlineTextMorph(el, { compact: true }); onCleanup(() => h.destroy()) })
  return <div ref={el} />
}
```

## 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `brand` | `'Graphical'` | 圆角描边字标里的文字 |
| `compact` | `false` | `true` 时隐藏字标、句子顶到 y=54、舞台高 300，便于嵌进页面 |
| `height` | 设计高度 | 场景可用高度上限，缩放取 `min(可用宽/1044, height/设计高)` |
| `reducedMotion` | `null` | `null` 跟随系统；`true/false` 强制 |
| `lines` | 三行英文 | 用 `{0}{1}{2}` 指定胶囊位置 |
| `pills[i].items` | — | `'languages'` 或 `{ word, icon }` |
| `pills[i].angleSet` | `'custom'` | 静态旋转角取哪组：`languages` / `custom` / `models` |

## 交互与无障碍

- 点击、`Enter`、`Space` 前进一项；`←` `→` 前后；`Home` / `End` 选首末。三组互不影响。
- `aria-label` 描述当前词与下一项；图标与拆分后的字母对读屏隐藏；另有一份完整句子文本；操作后 `aria-live` 只播报三个当前词。
- 焦点环 2px 实线 + 4px 外距，颜色走 `--itm-focus`。
- 减少动态时文字、宽度、图标直接到终值，交互状态一个不少。

## 动效参数

| 项 | 值 |
|---|---|
| 文字位移 / 缩放 | 200ms，`cubic-bezier(0.19, 1, 0.22, 1)` |
| 保留字母 | 从旧位置差值 translate 到 0 |
| 新字母 | 邻近保留字母偏移处 · `scale(.95)` · 透明 0 进入 |
| 退出字母 | 固定旧位置，朝最近保留节点平移 · `scale(.95)` · 淡出后移除 |
| 胶囊宽度 | 刚度 600 / 阻尼 34 / 质量 1，dt 上限 1/30，4 子步，差 <0.02px 且速度 <0.05px/s 吸附 |
| 图标进场 | 300ms，`scale .4 → 1.1 → 1`，角度 `目标−16×方向 → 目标+5×方向 → 目标` |
| 图标退场 | 140ms，`scale → .4`、透明 0、顺旋 5° 后删除；连续切换先清更早的退出层 |

## 主题渗透

ShadowRoot 隔离样式，但可继承的 CSS 自定义属性会穿进去，所以换肤不用改组件：

```css
.land-morph {
  --itm-ink: var(--text);
  --itm-pill: color-mix(in srgb, var(--text) 9%, transparent);
  --itm-pill-hover: color-mix(in srgb, var(--text) 13%, transparent);
  --itm-pill-active: color-mix(in srgb, var(--text) 19%, transparent);
  --itm-focus: color-mix(in srgb, var(--text) 46%, transparent);
  --itm-mark-bg: var(--surface);
  --itm-mark-line: var(--text);
}
```

## 已验证

多实例（渐变 id 无重复、卸载后 shadow 内 0 残留）、宽度弹簧过冲后收敛、键盘全路径、
减少动态、`375 / 768 / 1440` 无横向溢出、深浅两色、连续快速切换无残影。
