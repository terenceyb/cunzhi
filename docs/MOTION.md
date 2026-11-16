# 存知 · 微交互规范（transitions.dev）

本项目的所有界面动效统一走 transitions.dev 的 recipe，不引入 framer-motion / GSAP / anime.js 等任何动画库。
实现集中在两个文件：

| 文件 | 作用 |
|---|---|
| `src/styles/transitions.css` | token（`--modal-*`、`--dropdown-*`、`--tilt-*`…）+ 9 条 recipe 的 CSS，状态一律 `data-state` |
| `src/lib/motion.ts` | 原生状态机：`usePresence` / `useRevealState` / `replayShake` / `useDigitPulse` / `attachTilt` |
| `src/components/motion.tsx` | React 封装：`TNumber`、`TBadge`、`IconSwap`、`PanelReveal` |

## 约定

1. **只用 `t-*` class + CSS 变量**，不写行内 `transition`、不手写 `fade-in` 关键帧。
2. **状态只用 `data-state`**：
   - 常驻两种：`open` / `closed`
   - 局部三种：`error` / `shaking`（表单错误）、`a` / `b`（图标交换的原生写法，`open`/`closed` 亦可）
3. **关闭不是立刻卸载**：先把 `data-state` 置 `closed`，等 `--*-close-dur` 走完再移除节点（`usePresence` 已封装）。
4. **时长只读变量**：`--modal-open-dur`、`--dropdown-close-dur` …… 改一处全局生效。
5. **无障碍**：每条 recipe 自带 `prefers-reduced-motion: reduce` 兜底；末尾还会把所有时长 token 归零，系统开启「减少动态效果」时功能不变、动画消失。

## 可用的 9 条 recipe 与落点

| recipe | class / 组件 | 当前落点 | 关键 token |
|---|---|---|---|
| modal open | `.t-modal` + `.t-scrim` | 全局 `Modal`（新建人脉、速记、确认框、设置弹窗） | `--modal-open-dur: 250ms` / `--modal-close-dur: 150ms` / `--modal-scale: .96` |
| dropdown menu | `.t-dropdown` + `data-origin` | 全局 `Menu`（配置列、卡片更多、排序） | `--dropdown-pre-scale: .97` / `--dropdown-ease` |
| card resize | `.t-resize` | 侧栏折叠（244px ↔ 64px） | `--resize-dur: 300ms` |
| panel reveal | `.t-panel-slide` | 移动端设置子页 | `--panel-translate-y: 100px` / `--panel-blur: 2px` / `--panel-open-dur: 400ms` |
| number pop-in | `.t-digit-group` / `TNumber` | 工作台统计胶囊、模块标题计数徽标 | `--digit-dur: 600ms` / `--digit-stagger: 40ms` |
| icon swap | `.t-icon-swap` / `IconSwap` | 侧栏折叠按钮、模块展开箭头 | `--icon-swap-start-scale: .25` / `--icon-swap-blur: 2px` |
| error shake | `.t-input-wrap` / `.t-input` / `.t-error-msg` | 新建/编辑人脉的必填与格式校验 | `--shake-distance: 6px` / `--shake-ease` |
| notification badge | `.t-badge` / `TBadge` | 移动端底部导航「工作台」红点 | `--badge-offset-x: -8.2px` / `--badge-pop-ease`（回弹） |
| card tilt | `.t-tilt` / `.t-tilt-card` / `.t-tilt-glare` | 人脉名片卡（宫格 + 列表两种视图） | `--tilt-perspective: 1000px` / `--tilt-return: 1000ms` / `--tilt-follow: 400ms` / `--tilt-glare-opacity: .32` |

## 怎么给某个界面加动画

```tsx
// 弹层：直接用 Modal / Menu，已经带上 recipe
<Modal open={open} onClose={close} title="…">…</Modal>

// 数字变化：把裸数字换成 TNumber
<span className="v"><TNumber value={count} /></span>

// 图标互换：两个图标放同一槽位
<IconSwap open={!collapsed} a={<PanelClose />} b={<PanelOpen />} />

// 面板入场
<PanelReveal key={tab} className="settings-content">…</PanelReveal>

// 徽标
<TBadge count={reminders.length} dotOnly />

// 3D 倾斜（外层命中、内层形变，中间必须夹一层 .t-tilt）
const tiltRef = useRef<HTMLDivElement>(null)
const cardRef = useRef<HTMLDivElement>(null)
useEffect(() => {
  if (!tiltRef.current || !cardRef.current) return
  return attachTilt(tiltRef.current, cardRef.current) // 第二参可选：峰值角度，默认 14deg
}, [])

<div className="t-tilt" ref={tiltRef}>
  <div className="t-tilt-card" ref={cardRef}>
    …内容…
    <div className="t-tilt-glare" aria-hidden="true" />
  </div>
</div>
```

新增落点时**只准复用上面这 9 条**；需要新的运动形态时，先从 transitions.dev 的 library 取 recipe 的 token 与 CSS 原样搬进来，再按 `data-state` 改写选择器，不要自造淡入淡出。

## 已知取舍

- `.t-digit-slot` 加了 `overflow: hidden`：规范原文没有，但不裁切时旧数字会溢出小尺寸徽标。
- 表单错误提示用绝对定位占位（`.field.has-error` 预留 18px），保证提示淡入时整行不抖动；规范里提示是撑开容器高度的。
- `.t-error-msg` 不做 3 秒自动回退（`--revert-hold` 保留但未启用），错误保留到用户修改或再次保存，符合表单场景。
- **card-tilt 去掉 `touch-action: none`**：规范用它让手指按住拖拽也能倾斜，但人脉卡在可滚动列表里，禁掉纵向手势会让列表滑不动。改为 JS 里按 `pointerType === 'mouse'` 启用（触摸端零倾斜、保留原生滚动与点击进详情），并在 `(hover: none) and (pointer: coarse)` 下直接不渲染高光层。
- **card-tilt 的 `will-change` 按需加**：规范给 `.t-tilt-card` 常驻 `will-change: transform`，实测会让卡片文字轻微发虚，改成只在 `.t-tilt:hover` 期间提层。
- **card-tilt 的圆角/溢出交给宿主**：`.wallet-card` 本身已有 20px 圆角与 `overflow: hidden`，`.t-tilt-card` 不再重复声明，避免覆盖宿主视觉。
- `.wallet-card` 原来的 `hover { transform: translateY(-2px) }` 与 `:active { scale(.995) }` 已移除：transform 现在由 tilt 独占，两个 transform 会互相覆盖（`:hover` 特异性更高，直接让 tilt 失效）。抬升反馈改由阴影变化承担。
