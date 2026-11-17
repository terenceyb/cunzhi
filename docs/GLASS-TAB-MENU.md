# 玻璃标签栏展开菜单 · GlassTabMenu

一个外壳，两种形态：闭合是 **762×147** 的玻璃胶囊 + 右侧 **147** 的圆钮；点圆钮时同一块玻璃**先收窄再向上长到 446**，变成 3 列 2 行的菜单，加号旋转 45° 成关闭符号。没有两张状态图切换，也没有 iframe。

## 文件

| 文件 | 作用 |
|---|---|
| `src/components/glass/GlassTabMenu.tsx` | React 入口：挂载建实例、props 变更调选项、卸载销毁 |
| `src/components/glass/GlassTabMenuEngine.js` | 完整交互核心（框架无关）：DOM、弹簧、ARIA、键盘、指针 |
| `src/components/glass/motion-runtime.ts` | 运动基础：弹簧、smoothstep、RAF 循环 |
| `src/components/glass/GlassTabMenuEngine.d.ts` | 类型声明 |
| `src/components/glass/icons.js` | 10 个内嵌灰阶立体 SVG（每个带实例唯一渐变 ID） |
| `docs/glass/*` | Vue / Svelte / Solid / Preact / Vanilla 入口 |

## 安装与运行

```bash
npm install react react-dom
```

```tsx
import { GlassTabMenu } from './components/glass/GlassTabMenu'

export default function App() {
  return <GlassTabMenu />
}
```

完整示例（贴在存知里的人脉页风格）：

```tsx
<GlassTabMenu
  items={[
    { key: 'home', label: '首页' },
    { key: 'people', label: '人脉' },
    { key: 'interactions', label: '互动记录' },
    { key: 'settings', label: '设置' },
  ]}
  menuItems={[
    { key: 'note', label: '速记', action: 'note' },
    { key: 'people', label: '新建人脉', action: 'person' },
    { key: 'checklist', label: '新建待办', action: 'todo' },
    { key: 'sketch', label: '记录互动', action: 'interaction' },
    { key: 'folder', label: '导入数据', action: 'import' },
    { key: 'scan', label: '全局搜索', action: 'search' },
  ]}
  value={0}
  align="bottom"          // 当导航栏用：舞台贴底
  fit="width"             // 缩放只按宽度，铺满屏幕
  padBottom={8}
  transparent             // 不要那块浅灰紫设计稿背景
  onChange={(i) => navigate(routes[i])}
  onAction={(action) => run(action)}
/>
```

## 选项

| 选项 | 默认 | 说明 |
|---|---|---|
| `items` | Calendar / Notes / People / Files | 四项标签；图标键见下 |
| `menuItems` | Note…Sketch 六项 | 菜单格，`action` 缺省用 `key` |
| `value` | `0` | 选中下标 |
| `height` | 自动 | 场景高度 |
| `reducedMotion` | 跟随系统 | `true` 时直接吸附目标并绘制 |
| `align` | `'center'` | `'bottom'` 让组合贴容器底（导航栏用法） |
| `fit` | `'min'` | `'width'` 只按宽度等比缩放 |
| `padBottom` | `0` | 贴底时圆钮距容器底的距离 |
| `transparent` | `false` | 关掉设计稿背景 |
| `onAction` / `onChange` | — | 也可以用 `glass-tab-action` 自定义事件 |

图标键：`home` `people` `interactions` `settings`（标签栏四格）；`note` `checklist` `photo` `scan` `voice` `sketch` `folder` `calendar` `notes`（菜单格与备用）。

## 动效是怎么算出来的

五个带速度的标量，全部走同一个半隐式欧拉弹簧（每帧 dt 切 3 子步）：

| 标量 | 刚度 / 阻尼 | 目标 |
|---|---|---|
| `opening` | 400 / 26 | 0 或 1（外壳高度） |
| `selection` | 330 / 26 | 0..3（选中块横向位置） |
| `compression` | 400 / 22 | 0（外壳收窄量） |
| `press` | 420 / 24 | 0（圆钮脉冲） |
| `content` | 480 / 30 | 0 或 1（菜单显现） |

从端点切换时**先只播按钮反馈**：高度延迟 75ms、收窄冲量延迟 90ms、内容显现延迟 170ms（收起时内容立即淡出）。延迟由 RAF 累计 dt 推进，不挂额外计时器；中途反向直接取消延迟，沿当前位置继续。

外壳：`width = 762 × (1 − c)`，`c = clamp(compression, −0.02, 0.47)`，左偏移 `(762 − width) / 2`；`height = 147 + 299 × opening`；圆角 `73.5 + 12.5 × opening`。

选中块：`translateX(selection × 183)`，速度决定 `travel = clamp(|v| / 7, 0, 1)` → `scaleX 1+.08t / scaleY 1+.25t`、白色 alpha `.98 − .95t`、阴影偏移 7→4 / 模糊 17→22。移动时它是一层薄玻璃轮廓，停稳恢复 179×116 的白胶囊；上面另有一层同步位置的镜片（`opacity = travel`）给沿途图标提亮。

## 键盘与无障碍

- 标签区 `role=tablist`，四个 `role=tab`，roving tabindex，每个 tab 关联一个仅供读屏的 `tabpanel`
- `←` / `→` 循环选中并聚焦，`Home` / `End` 到首末
- 圆钮 `aria-haspopup=menu`，`↓` 打开并聚焦首项，`↑` 打开并聚焦末项，`Enter` / `Space` 原生点击
- 菜单 `←→` 移一格、`↑↓` 移三格、`Home` / `End`、`Esc` 关闭并把焦点还给圆钮
- 菜单在 `content > .62` 才接指针与焦点；收起时标签栏在 `content ≤ .38` 才解除 `inert`
- `focus-visible` 显示 3px `#555d7d` 内侧轮廓，`outline-offset: -7px`

## 事件

```js
host.addEventListener('glass-tab-action', (e) => {
  console.log(e.detail.action) // note / person / todo ...
})
```

`bubbles: true`、`composed: true`，可以穿透 ShadowRoot。

## 清理

`destroy()` 会停 RAF、断开 `ResizeObserver`、移除媒体查询监听、`document` 的指针监听，并清空影子树。多实例之间渐变 ID 带实例前缀，状态与事件互不串扰——实测两个实例各 50 个渐变 ID，重叠为 0。

## 其他框架

`docs/glass/` 下有 Vue / Svelte / Solid / Preact / Vanilla 入口，都共享同一个 `GlassTabMenuEngine.js`，生命周期与清理方式见各文件注释。
