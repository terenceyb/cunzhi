# 存知 · 界面细节对照（Interfaces Guidelines）

来源：<https://interfaces.rauno.me/> 全文 53 条。逐条对照本项目，标注落点与状态。

- **已满足**：原本就符合，本轮只做了核对
- **本轮新增**：按条目改了代码
- **不适用**：本项目没有对应场景
- **取舍**：与其它规范冲突，说明保留原因

## Interactivity

| # | 规则 | 状态 | 落点 |
|---|---|---|---|
| 1 | 点输入标签应聚焦输入框 | 本轮新增 | `PersonForm` 用 `useId()` 生成 id，`<label htmlFor>` 关联，`FieldInput` 接收 `id` |
| 2 | 输入框包在 `<form>` 里，回车即提交 | 本轮新增 | `Modal` 新增 `formId` / `onSubmit`，正文包成 `<form>`；保存按钮 `type="submit" form="person-form"` |
| 3 | 用合适的 `type`（email / tel / url / number） | 本轮新增 | `FieldInput` 邮箱 `type="email"`、电话 `type="tel"`、链接 `inputMode="url"`、数字 `inputMode` |
| 4 | 关掉 `spellcheck` 与 `autocomplete` | 本轮新增 | 文本 / 长文本 / 链接 / 电话输入框统一 `autoComplete="off"`（邮箱、电话保留浏览器填充） |
| 5 | 用 `required` 走原生校验 | 取舍 | 项目是自定义校验 + error shake，原生气泡会盖住行内错误提示，故不叠加 `required` |
| 6 | 前后缀图标绝对定位并可点聚焦 | 已满足 | `.search-box .input` 左内边距 + 绝对定位图标 |
| 7 | Toggle 立即生效，不要二次确认 | 已满足 | `Switch` 直接写状态 |
| 8 | 提交后禁用按钮，防重复请求 | 本轮新增 | 人脉表单 `saving` 状态，提交时按钮 `disabled` 并显示「保存中…」 |
| 9 | 交互元素内部禁用文字选中 | 本轮新增 | `.btn` / `.nav-item` / `.chip` / `.tab` / 名片卡 / 表格单元格 |
| 10 | 装饰元素不拦截指针 | 本轮新增 | `.wallet-card .veil`、`.sheen`、`.t-tilt-glare` 加 `pointer-events: none` |
| 11 | 列表项之间不留死区，用 padding 撑开 | 已满足 | 侧栏导航、底部 Tab 均无 gap 空档 |

## Typography

| # | 规则 | 状态 | 落点 |
|---|---|---|---|
| 12 | `-webkit-font-smoothing: antialiased` | 已满足 | `body` |
| 13 | `text-rendering: optimizeLegibility` | 已满足 | `body` |
| 14 | 字体按语言子集化 | 不适用 | 使用系统字体栈，不含自定义字体文件 |
| 15 | 字重不随 hover / 选中变化 | 本轮新增 | `.nav-item.active` 去掉 `font-weight: 600`，选中态改用背景与文字色区分 |
| 16 | 不使用 400 以下字重 | 已满足 | 全站字重集合为 500 / 600 / 700 |
| 17 | 中等标题 500–600 | 本轮新增 | 把 650 / 680 / 550 统一为 600 / 500，避免非可变字体被取整成 700 |
| 18 | 用 `clamp()` 做流体字号 | 本轮新增 | `.dash-hero .hello`：`clamp(18px, 1.15vw + 13px, 22px)` |
| 19 | 表格与计时用 `tabular-nums` | 已满足 | 表格、统计胶囊、时间线、数量徽标共 8 处 |
| 20 | `-webkit-text-size-adjust: 100%` | 本轮新增 | `html`，防横屏自动放大 |

## Motion

| # | 规则 | 状态 | 落点 |
|---|---|---|---|
| 21 | 切主题不触发过渡 | 不适用 | 本项目只有浅色主题 |
| 22 | 交互动画不超过 200ms | 取舍 | 弹窗 250ms / 面板 400ms 来自上一轮引入的 transitions.dev recipe，用户明确要求按该规范执行，故不压到 200ms；hover、按压、复制对勾等即时反馈均在 150ms 内 |
| 23 | 动画幅度与触发元素尺寸成比例 | 已满足 | 弹窗从 `scale(.96)` 而非 0 进入；按钮按压 `scale(.96)`（本轮由 0.975 调到 0.96） |
| 24 | 高频低新奇交互不加多余动画 | 取舍 | 右键菜单、增删列表项本身无动画；只有下拉菜单保留 250ms 生长（transitions.dev 的 dropdown recipe） |
| 25 | 循环动画不可见时暂停 | 已满足 | 唯一的无限动画是加载骨架，且只出现在首屏加载、始终在视口内 |
| 26 | 页内锚点用平滑滚动并留偏移 | 本轮新增 | `html { scroll-behavior: smooth; scroll-padding-top: 16px }` |

## Touch

| # | 规则 | 状态 | 落点 |
|---|---|---|---|
| 27 | hover 态只在 `@media (hover: hover)` 生效 | 本轮新增 | 三个样式文件共 28 条顶层 `:hover` 规则整体收进 `@media (hover: hover)`，触摸按压不会再粘住 hover；`.search-hit.on`、`.drop-zone.over`、`focus-within` 等状态规则被单独拆出，不受影响 |
| 28 | 输入框字号不小于 16px | 本轮新增 | `@media (pointer: coarse)` 下所有输入控件 16px，防 iOS 聚焦放大 |
| 29 | 触摸设备不自动聚焦输入框 | 本轮新增 | `Modal` 判断 `(pointer: coarse)` 时只聚焦按钮；「打开就是为了打字」的速记传 `focusOnTouch` 保持聚焦 |
| 30 | video 加 `muted` `playsinline` | 不适用 | 无 video |
| 31 | 关掉 iOS 默认点击高亮 | 本轮新增 | `html { -webkit-tap-highlight-color: rgba(0,0,0,0) }`，反馈交给 `:active` 的 0.96 缩放 |

## Optimizations

| # | 规则 | 状态 | 落点 |
|---|---|---|---|
| 32 | 大 `blur()` 可能很慢 | 已满足 | 最大 16px，只用在顶栏、侧栏等少量固定层 |
| 33 | 缩放模糊矩形会 banding，用径向渐变 | 已满足 | 名片高光用 `radial-gradient`，不用缩放色块 |
| 34 | 谨慎使用 `translateZ(0)` | 已满足 | 全站没有手动 GPU 提升 |
| 35 | `will-change` 按需开启 | 本轮新增 | 移除侧栏、数字鼓轮、输入框包装、设置面板上的常驻 `will-change`（会让文字发虚），仅弹层保留 |
| 36 | 视频暂停 / 卸载 | 不适用 | 无 video |
| 37 | 用 ref 绕开 React 渲染循环处理实时值 | 已满足 | 名片 3D tilt 直接写 CSS 变量；表格虚拟滚动用 ref 读 `scrollTop` |
| 38 | 按设备与网络能力自适应 | 未做 | 本地优先应用，数据在 IndexedDB，无网络请求可降级；虚拟列表已按行高裁剪渲染 |

## Accessibility

| # | 规则 | 状态 | 落点 |
|---|---|---|---|
| 39 | 禁用按钮不挂 tooltip | 本轮新增 | 字段管理里锁定字段的三个操作按钮去掉 `title` 与 `disabled:hover` 说明，原因改写在字段信息行的 `.ftype-note` |
| 40 | 焦点环用 `box-shadow` 而非 `outline` | 本轮新增 | 全局 `:focus-visible` 改为双层 `box-shadow`（底色 + `--focus-ring`），跟随元素圆角；表格行用 inset 阴影 |
| 41 | 顺序列表支持 ↑ ↓ 导航 | 本轮新增 | 人脉表格 roving tabindex：整表只有一个 Tab 落点，行内 ↑↓ 移动并自动滚动 |
| 42 | 顺序列表支持 ⌘ Backspace 删除 | 本轮新增 | 同上，触发与卡片菜单一致的删除确认 |
| 43 | 下拉菜单在 mousedown 时打开 | 本轮新增 | `Menu` 改用 `pointerdown` 打开（鼠标 / 触摸 / 手写笔统一），`click` 用捕获阶段吃掉避免二次 toggle |
| 44 | svg favicon 随系统主题 | 本轮新增 | 新增 `public/favicon.svg`，内嵌 `prefers-color-scheme: dark` 反色样式，`index.html` 指向它 |
| 45 | 纯图标按钮要有 `aria-label` | 本轮新增 | 复制按钮、删除按钮、折叠按钮等统一补齐；`title` 仅作为鼠标提示保留 |
| 46 | hover tooltip 不含交互内容 | 已满足 | 项目未使用富内容 tooltip |
| 47 | 图片一律用 `<img>` | 已满足 | `Avatar` 用 `<img>`，可右键另存、可被读屏识别 |
| 48 | HTML 拼的图形要给 `aria-label` | 已满足 | `Logo` 用 `role="img"` + `aria-label` |
| 49 | 渐变文字在 `::selection` 取消渐变 | 不适用 | 无渐变文字 |
| 50 | 嵌套菜单用「预测锥」 | 不适用 | 菜单只有一层 |
| — | 折叠侧栏不丢掉无障碍标签 | 本轮新增 | 折叠后导航文字由 `display: none` 改为视觉隐藏（`clip-path` + 1px），读屏仍能读出名字 |

## Design

| # | 规则 | 状态 | 落点 |
|---|---|---|---|
| 51 | 先本地乐观更新，失败再回滚 | 已满足 | 本地优先架构，写入 IndexedDB 即生效 |
| 52 | 认证重定向在服务端完成 | 不适用 | 无账号体系 |
| 53 | 设置 `::selection` 样式 | 已满足 | `::selection` 用品牌蓝 18% |
| 54 | 反馈贴着触发器出现 | 本轮新增 | 复制成功改为按钮原地变对勾（详情页号码 / 邮箱 / 地址、卡片菜单、工作台祝福语、我的名片），不再弹全局通知；表单错误高亮对应输入框 |
| 55 | 空态引导创建，并提供可选模板 | 本轮新增 | 人脉空态三个入口：新建人脉 / 导入 CSV / 载入示例数据 |

## 一条需要留意的边界

`@media (hover: hover)` 的 28 条规则是脚本从三个样式文件里整体迁移的，迁移后规则顺序统一排到文件末尾。为此额外补了一条显式提权：

```css
/* 选中态要压过 hover：两者特异性相同，hover 规则在文件末尾 */
.nav-item.active,
.nav-item.active:hover {
  background: var(--surface-3);
  color: var(--text);
}
```

后续新增 hover 样式请直接写进文件末尾的 `@media (hover: hover)` 块，不要再写在上面的普通规则里，否则桌面端会被同特异性的旧规则盖住。
