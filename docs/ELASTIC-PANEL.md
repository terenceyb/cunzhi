# 弹性面板缩放 · ElasticPanelResize

> 从零实现的「弹性面板缩放」交互：靠近面板左边缘出现浅灰胶囊把手，拖动时整条曲线向移动方向弯并偏到同一侧；越过边界最多 15px 橡皮筋并拉成长而直的细线，松手回弹，移开 450ms 后收细隐藏。
> 纯手写，无动画库、无外部素材；尺寸、颜色与运动参数全部按规范落在代码里。

人脉详情页的左边缘用的就是这套引擎（`src/pages/People.tsx`），设置 → 关于 里有一个可直接拖动的样张。

---

## 1. 四个文件

| 文件 | 职责 |
| --- | --- |
| `src/components/ElasticPanelResize.tsx` | React 入口 + 1000×1000 基准的浅灰样张场景（不做任何动画实现） |
| `src/components/elastic/ElasticPanelResizeEngine.js` | 完整交互核心：命中区、指针、键盘、SVG 把手、逐帧积分、生命周期 |
| `src/components/elastic/motion-runtime.ts` | 运动运行时：弹簧积分、指数插值、rAF 循环（dt 封顶 1/30） |
| `src/components/elastic/ElasticPanelResizeEngine.d.ts` | 引擎的类型声明 |

## 2. 安装与运行

```bash
npm install react react-dom      # 组件本身只依赖 React
npm run dev                      # 本仓库：Vite + React 18 + TS
```

单独取用（不装本仓库其它依赖）时，把上面四个文件按同目录结构放好即可，`qrcode-generator` 之类与本组件无关。

```tsx
import { ElasticPanelResize } from './components/ElasticPanelResize'

export default function App() {
  return <ElasticPanelResize />
}
```

`ElasticPanelResize` 的 props：

| prop | 类型 | 说明 |
| --- | --- | --- |
| `height` | `number` | 场景高度，默认 520；改它不会重挂载 |
| `reducedMotion` | `boolean \| undefined` | 覆盖系统「减少动态效果」；不传则读 `matchMedia` |
| `className` / `style` | — | 透传到场景容器 |

## 3. 直接嵌到自己的面板上

引擎本身与 React 无关，任何「左边缘可拖、右边缘固定」的面板都能用：

```ts
import { createElasticPanelResize } from './elastic/ElasticPanelResizeEngine.js'

const engine = createElasticPanelResize({
  host,                        // 容器（position: relative）
  panel,                       // 面板（右边缘固定，宽度由引擎写）
  minWidth: 400, maxWidth: 640, initialWidth: 420, rightGap: 10,
  onChange: (m) => host.style.setProperty('--panel-w', `${m.width}px`), // 每帧：只写样式
  onCommit: (m) => saveWidth(Math.round(m.width)),                      // 松手 / 键盘：落库
})

engine.setWidth(480)   // 外部改宽度（带动画）
engine.destroy()       // 卸载：取消 rAF、计时器、观察者、指针捕获、事件监听
```

按比例定位的写法与样张一致：`minRatio: 0.276, maxRatio: 0.5, initialRatio: 0.3865, rightGap: 17`。

## 4. 六框架入口

同一套框架无关核心，只是生命周期写法不同，都在 `docs/elastic/` 下：

- `vanilla.js` — 直接 `createElasticPanelResize`
- `ElasticPanelResize.vue` — `onMounted` 建 / `onBeforeUnmount` 销
- `ElasticPanelResize.svelte` — `onMount` 返回清理函数
- `ElasticPanelResize.solid.tsx` — `onMount` + `onCleanup`
- `ElasticPanelResize.preact.tsx` — `useEffect` 返回清理函数
- React 入口即 `src/components/ElasticPanelResize.tsx`

所有入口都遵守：DOM 只在挂载后访问、同页多实例不串扰、props 更新不重挂载、销毁时清干净。

## 5. 交互与算法

| 环节 | 实现 |
| --- | --- |
| 命中区 | 左边缘 32px 宽透明区，`cursor: ew-resize`、`touch-action: none`；向右偏 20px，只侵入面板 12px |
| 静止把手 | 外高 75 × 宽 15 的浅灰 `#c6c6c6` 圆端胶囊 + 1px 白色外轮廓 |
| 把手绘制 | 80×160 SVG，中心 (40,80)，两条重叠 path（先白后灰）共用同一条二次贝塞尔：`M(40+O)(80-L/2) Q(40+O+2B)80 (40+O)(80+L/2)` |
| 显示 / 隐藏 | 指针靠近、触屏按下、键盘聚焦时出现；离开且未拖动时延迟 450ms 收细到 0；重新进入立即取消隐藏 |
| 拖动跟随 | 合法区间内直接跟随指针（无位置弹簧拖尾）；越界后 `p = t + sign(e) × 15 × (1 - e^(-|e|/35))` |
| 形变 | `B = 4.5d(1-q)`、`O = 9d(1-q) + 6sign(e)q`、`L = 60 + 30m + 21q`、`S = (15 - 10m - 2q)R`，灰阶 `round(198 - 39m)` |
| 积分 | `rAF`，`dt = min(相邻帧秒数, 1/30)`，每帧 4 个子步；位置弹簧 `k=400 c=26`，形变弹簧 `k=680 c=34`，`S/L/R` 用 `1-e^(-32dt)` 插值 |
| 停止 | 位置差 < 0.01px 且速度 < 0.05px/s、B/O 差 < 0.01 且速度 < 0.03、S/L 差 < 0.01、R 差 < 0.001 后吸附并停掉 rAF |
| 取消 | `pointercancel`、拖动中 `Escape` 回到按下前的目标；`lostpointercapture` 正常结束 |
| 再抓取 | 以当前可见位置记录抓取偏移，不会跳回旧目标 |
| 尺寸变化 | 保持位置比例与拖动状态；宽度为 0 时以 1000px 设计宽度兜底，首次正尺寸再按比例换算 |
| 减少动态 | 位置直接到位、把手保持直胶囊，不播放弯曲与过界回弹；交互状态完整保留 |

## 6. 键盘与无障碍

- 把手 `role="separator"`、`tabindex="0"`、`aria-orientation="vertical"`、`aria-controls` 指向面板。
- `aria-valuemin` / `aria-valuemax` / `aria-valuenow`（1 位小数）按 `100 × (1 - left / 容器宽)` 计算，`aria-valuetext` 读成「面板宽度 N 像素」。
- ← / → 每次 2% 容器宽（扩宽 / 收窄），`Shift` 为 6%；`Home` 最大面板、`End` 最小；非拖动时 `Escape` 与双击回到初始。
- 松手与键盘变更写进隐藏的 `aria-live="polite"` 区域，逐帧不刷屏。
- 键盘聚焦时出现把手，并绘制 48×132、2px `#666` 的圆角焦点轮廓；指针操作不显示焦点环。
