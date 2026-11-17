/**
 * GlassTabMenuEngine.js —— 「玻璃标签栏展开菜单」的框架无关交互核心
 *
 * 一个外壳，两种形态：
 *   闭合  762×147 的玻璃胶囊 + 右侧 147 的圆形按钮
 *   展开  同一个外壳向上长到 446，变成 3 列 2 行菜单，按钮转成关闭符号
 *
 * 全部动画由五个带速度的标量逐帧积分得到：
 *   opening / selection / compression / press / content
 * 没有 CSS keyframes，也没有「两张状态图切换」——外壳始终是同一个 DOM 节点，
 * 宽度、高度、圆角、内容透明度、模糊量都是连续值。
 *
 * 不依赖任何框架；DOM 只在 mount 之后创建，全部样式关在 ShadowRoot 里，
 * 不碰宿主的 body、全局 ID 和全局样式。
 */

import {
  clamp,
  createLoop,
  impulse,
  rgba,
  smoothstep,
  snapSpring,
  spring,
  springSettled,
  stepSpring,
} from './motion-runtime'
import { iconSvg, plusSvg } from './icons'

/* ------------------------------- 设计稿常量 ------------------------------- */

const DESIGN = 1080
/** 舞台内组合的定位：左 65、底 318（舞台 y=762）、宽 950、高 446 */
const GROUP_LEFT = 65
const GROUP_BOTTOM = 318
const GROUP_W = 950
const GROUP_H = 446

const SHELL_W = 762
const SHELL_H = 147
const SHELL_H_OPEN = 446
const SHELL_H_DELTA = SHELL_H_OPEN - SHELL_H
const RADIUS = 73.5
const RADIUS_OPEN = 86

const FAB = 147

const TAB_W = 183
const SEL_W = 179
const SEL_H = 116

/** 弹簧参数：刚度 / 阻尼 */
const K = {
  opening: [400, 26],
  selection: [330, 26],
  compression: [400, 22],
  press: [420, 24],
  content: [480, 30],
}

export const DEFAULT_ITEMS = [
  { key: 'home', label: 'Home' },
  { key: 'people', label: 'People' },
  { key: 'interactions', label: 'Activity' },
  { key: 'settings', label: 'Settings' },
]

export const DEFAULT_MENU = [
  { key: 'note', label: 'Note', action: 'note' },
  { key: 'checklist', label: 'Checklist', action: 'checklist' },
  { key: 'photo', label: 'Photo', action: 'photo' },
  { key: 'scan', label: 'Scan', action: 'scan' },
  { key: 'voice', label: 'Voice', action: 'voice' },
  { key: 'sketch', label: 'Sketch', action: 'sketch' },
]

let uidSeq = 0
const nextUid = () => `${(++uidSeq).toString(36)}${Math.random().toString(36).slice(2, 6)}`

/* --------------------------------- 样式 --------------------------------- */

const CSS = `
:host{display:block;position:relative;font-family:Inter,Arial,Helvetica,sans-serif;color:#1b1c1e;pointer-events:none}
*,*::before,*::after{box-sizing:border-box}
.gts-scene{position:relative;width:100%;height:100%;overflow:hidden;isolation:isolate}
/* 设计稿背景：177.62 度近纵向灰紫渐变 + 左上柔白亮斑（21 个径向停靠点近似） */
.gts-scene[data-bg='stage']{background:
  radial-gradient(185.26% 116.41% at 25.83% 17.03%,
    rgba(255,255,255,.90826) 0%,
    rgba(255,255,255,.88033) 5%,
    rgba(255,255,255,.82106) 10%,
    rgba(255,255,255,.73112) 15%,
    rgba(255,255,255,.61992) 20%,
    rgba(255,255,255,.49908) 25%,
    rgba(255,255,255,.37807) 30%,
    rgba(255,255,255,.26468) 35%,
    rgba(255,255,255,.16419) 40%,
    rgba(255,255,255,.08713) 45%,
    rgba(255,255,255,.03843) 50%,
    rgba(255,255,255,.01258) 55%,
    rgba(255,255,255,.00253) 60%,
    rgba(255,255,255,.00027) 65%,
    rgba(255,255,255,.00001) 70%,
    rgba(255,255,255,0) 75%,
    rgba(255,255,255,0) 80%,
    rgba(255,255,255,0) 85%,
    rgba(255,255,255,0) 90%,
    rgba(255,255,255,0) 95%,
    rgba(255,255,255,0) 100%),
  linear-gradient(177.62deg, rgb(212.26,208.59,223.64) 0%, rgb(208.49,207.49,217.85) 100%)}
.gts-stage{position:absolute;width:${DESIGN}px;height:${DESIGN}px;left:50%;top:50%;margin-left:-${DESIGN / 2}px;margin-top:-${DESIGN / 2}px;transform-origin:50% 50%}
.gts-stage[data-align='bottom']{top:auto;margin-top:0;transform-origin:50% 100%}

/* 组合：壳 + 圆按钮，两者底边对齐 */
.gts-group{position:absolute;left:${GROUP_LEFT}px;bottom:${GROUP_BOTTOM}px;width:${GROUP_W}px;height:${GROUP_H}px;pointer-events:none}

/* 玻璃外壳：轻薄半透明灰白 + 明亮边缘，不是一个厚灰卡片 */
.gts-shell{position:absolute;left:0;bottom:0;width:${SHELL_W}px;height:${SHELL_H}px;border-radius:${RADIUS}px;
  background:linear-gradient(160deg,rgba(255,255,255,var(--gts-a,.42)),rgba(255,255,255,var(--gts-b,.25)));
  border:2px solid rgba(255,255,255,var(--gts-line,.85));
  box-shadow:inset 0 1px 2px rgba(255,255,255,var(--gts-line,.85)),0 13px 42px -13px rgba(76,73,91,.22);
  -webkit-backdrop-filter:blur(25px) saturate(1.1);backdrop-filter:blur(25px) saturate(1.1);
  overflow:hidden;will-change:width,height,border-radius;pointer-events:auto}

/* 标签内容：固定 762×147，按 width/762 横向缩放，底边中心为原点 */
.gts-tabcontent{position:absolute;left:50%;bottom:-3px;width:${SHELL_W}px;height:${SHELL_H}px;
  margin-left:-${SHELL_W / 2}px;padding:15px;transform-origin:50% 100%;will-change:transform,opacity}

/* 选中块：近白胶囊，移动中变薄变透 */
.gts-sel{position:absolute;left:15px;top:16px;width:${SEL_W}px;height:${SEL_H}px;border-radius:65px;
  background:rgba(255,255,255,.98);will-change:transform,background,box-shadow;pointer-events:none}
/* 同尺寸同步位置的镜片：只在移动时给覆盖到的图标轻微提亮 + 柔化 */
.gts-lens{position:absolute;left:15px;top:16px;width:${SEL_W}px;height:${SEL_H}px;border-radius:65px;
  background:rgba(255,255,255,.12);-webkit-backdrop-filter:blur(.65px);backdrop-filter:blur(.65px);
  opacity:0;pointer-events:none;z-index:3;will-change:transform,opacity}

.gts-tabs{position:absolute;left:15px;top:15px;width:${TAB_W * 4}px;height:${SEL_H + 1}px;display:flex;z-index:2}
.gts-tab{flex:1 1 0;width:${TAB_W}px;height:${SEL_H + 1}px;display:grid;place-items:center;padding:0;margin:0;
  border:0;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent;
  color:inherit;font:inherit}
.gts-tab svg{display:block;width:64px;height:64px}
/* 图标不位移：悬停、选中都不上浮 */
.gts-tab:focus{outline:none}
.gts-tab:focus-visible,.gts-mi:focus-visible,.gts-fab:focus-visible{outline:3px solid #555d7d;outline-offset:-7px}

/* 菜单内容：固定 758×442，按 (width/762,height/446) 缩放，底边中心为原点 */
.gts-menucontent{position:absolute;left:50%;bottom:0;width:758px;height:442px;margin-left:-379px;
  padding:24px;transform-origin:50% 100%;will-change:transform,opacity}
.gts-menu{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);gap:16px;width:100%;height:100%}
.gts-mi{position:relative;display:flex;padding:0;border:0;border-radius:57px;cursor:pointer;
  background:linear-gradient(160deg,rgba(var(--gts-cell-rgb,111,107,124),.10),rgba(var(--gts-cell-rgb,105,101,119),.145));
  -webkit-tap-highlight-color:transparent;color:#000;font:inherit}
.gts-mi .inner{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;
  width:100%;transform:translateY(4px)}
.gts-mi svg{display:block;width:60px;height:60px}
.gts-mi .lbl{font:500 33px/1.15 Inter,Arial,Helvetica,sans-serif;letter-spacing:0;white-space:nowrap;color:var(--gts-label,#000)}
/* 悬停只提一点背景亮度，不移动按钮或图标 */
@media (hover:hover){
  .gts-mi:hover{background:linear-gradient(160deg,rgba(var(--gts-cell-rgb,111,107,124),.155),rgba(var(--gts-cell-rgb,105,101,119),.195))}
}
.gts-mi:focus{outline:none}

/* 圆按钮：同一套玻璃材质，右下角 */
.gts-fab{position:absolute;right:0;bottom:0;width:${FAB}px;height:${FAB}px;border-radius:50%;
  display:grid;place-items:center;padding:0;cursor:pointer;
  background:linear-gradient(160deg,rgba(255,255,255,var(--gts-a,.42)),rgba(255,255,255,var(--gts-b,.25)));
  border:2px solid rgba(255,255,255,var(--gts-line,.85));
  box-shadow:inset 0 1px 2px rgba(255,255,255,var(--gts-line,.85)),0 13px 42px -13px rgba(76,73,91,.22);
  -webkit-backdrop-filter:blur(25px) saturate(1.1);backdrop-filter:blur(25px) saturate(1.1);
  -webkit-tap-highlight-color:transparent;will-change:transform;overflow:hidden;pointer-events:auto}
.gts-fab:focus{outline:none}
.gts-fab-fill{position:absolute;inset:0;border-radius:50%;background:#fff;opacity:0;pointer-events:none}
.gts-plus{position:relative;display:grid;place-items:center;width:44px;height:44px;will-change:transform;color:var(--gts-ink,#1b1c1e)}
.gts-plus svg{display:block;width:44px;height:44px}

.gts-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media (prefers-reduced-motion:reduce){
  .gts-shell,.gts-tabcontent,.gts-menucontent,.gts-sel,.gts-lens,.gts-fab,.gts-plus{transition:none}
}
`

/* --------------------------------- 引擎 --------------------------------- */

export function createGlassTabMenu(options) {
  const opts = {
    container: null,
    items: DEFAULT_ITEMS,
    menuItems: DEFAULT_MENU,
    value: 0,
    height: undefined,
    reducedMotion: undefined,
    align: 'center',
    fit: 'min',
    padBottom: 0,
    transparent: false,
    fabLabelOpen: 'Open creation menu',
    fabLabelClose: 'Close creation menu',
    ariaLabel: 'Sections',
    onAction: null,
    onChange: null,
    actionEvent: 'glass-tab-action',
    ...options,
  }

  const container = opts.container
  if (!container) throw new Error('createGlassTabMenu: container is required')

  const uid = nextUid()
  const items = opts.items && opts.items.length ? opts.items : DEFAULT_ITEMS
  const menuItems = opts.menuItems && opts.menuItems.length ? opts.menuItems : DEFAULT_MENU

  /* ---------------------------- ShadowRoot ---------------------------- */
  const host = container
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' })
  root.textContent = ''

  const style = document.createElement('style')
  style.textContent = CSS

  const scene = document.createElement('div')
  scene.className = 'gts-scene'
  scene.dataset.bg = opts.transparent ? 'none' : 'stage'

  const stage = document.createElement('div')
  stage.className = 'gts-stage'

  const group = document.createElement('div')
  group.className = 'gts-group'

  const shell = document.createElement('div')
  shell.className = 'gts-shell'

  /* 标签内容 */
  const tabContent = document.createElement('div')
  tabContent.className = 'gts-tabcontent'

  /** 选中块停稳时的白色浓度：设计稿 .98，深色主题下宿主会压低 */
  let selBase = 0.98
  const sel = document.createElement('div')
  sel.className = 'gts-sel'
  const lens = document.createElement('div')
  lens.className = 'gts-lens'

  const tabList = document.createElement('div')
  tabList.className = 'gts-tabs'
  tabList.setAttribute('role', 'tablist')
  tabList.setAttribute('aria-label', opts.ariaLabel)

  const panels = []
  const tabButtons = items.map((item, i) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'gts-tab'
    btn.setAttribute('role', 'tab')
    btn.setAttribute('aria-label', item.label)
    btn.setAttribute('aria-controls', `gts-${uid}-panel-${i}`)
    btn.innerHTML = iconSvg(item.key, uid)
    const panel = document.createElement('div')
    panel.className = 'gts-sr'
    panel.id = `gts-${uid}-panel-${i}`
    panel.setAttribute('role', 'tabpanel')
    panel.setAttribute('aria-labelledby', `gts-${uid}-tab-${i}`)
    btn.id = `gts-${uid}-tab-${i}`
    panels.push(panel)
    btn.addEventListener('click', () => select(i, true))
    btn.addEventListener('keydown', onTabKeyDown)
    tabList.appendChild(btn)
    return btn
  })

  tabContent.append(sel, lens, tabList)

  /* 菜单内容 */
  const menuContent = document.createElement('div')
  menuContent.className = 'gts-menucontent'
  const menu = document.createElement('div')
  menu.className = 'gts-menu'
  menu.setAttribute('role', 'menu')

  const menuButtons = menuItems.map((item, i) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'gts-mi'
    btn.setAttribute('role', 'menuitem')
    btn.dataset.index = String(i)
    btn.innerHTML = `<span class="inner">${iconSvg(item.key, uid)}<span class="lbl">${item.label}</span></span>`
    btn.addEventListener('click', () => runAction(i))
    btn.addEventListener('keydown', onMenuKeyDown)
    menu.appendChild(btn)
    return btn
  })

  menuContent.appendChild(menu)
  shell.append(tabContent, menuContent)

  /* 圆按钮 */
  const fab = document.createElement('button')
  fab.type = 'button'
  fab.className = 'gts-fab'
  fab.setAttribute('aria-haspopup', 'menu')
  fab.setAttribute('aria-controls', `gts-${uid}-menu`)
  fab.setAttribute('aria-expanded', 'false')
  fab.setAttribute('aria-label', opts.fabLabelOpen)
  menu.id = `gts-${uid}-menu`
  const fabFill = document.createElement('span')
  fabFill.className = 'gts-fab-fill'
  const plus = document.createElement('span')
  plus.className = 'gts-plus'
  plus.innerHTML = plusSvg()
  fab.append(fabFill, plus)

  const live = document.createElement('div')
  live.className = 'gts-sr'
  live.setAttribute('aria-live', 'polite')

  group.append(shell, fab)
  stage.appendChild(group)
  scene.append(stage, live)
  root.append(style, scene, ...panels)

  /* ------------------------------ 状态 ------------------------------ */
  let selected = clamp(opts.value | 0, 0, items.length - 1)
  let menuOpen = false

  const sOpening = spring(K.opening[0], K.opening[1], 0)
  const sSelection = spring(K.selection[0], K.selection[1], selected)
  const sCompression = spring(K.compression[0], K.compression[1], 0)
  const sPress = spring(K.press[0], K.press[1], 0)
  const sContent = spring(K.content[0], K.content[1], 0)

  /** 起步延迟（秒）：只用 RAF 的 dt 递减，不额外挂计时器 */
  const hold = { opening: 0, content: 0 }
  let pendingImpulse = 0
  let pendingImpulseDelay = 0

  let reduced = opts.reducedMotion
  const mq = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null
  const isReduced = () => (reduced === undefined || reduced === null ? !!(mq && mq.matches) : !!reduced)

  /* ------------------------------ 绘制 ------------------------------ */

  let lastWidth = -1
  let lastHeight = -1
  let lastRadius = -1
  let lastLeft = -1

  function render() {
    const openP = sOpening.p
    const c = clamp(sCompression.p, -0.02, 0.47)
    const w = SHELL_W * (1 - c)
    const h = SHELL_H + SHELL_H_DELTA * clamp(openP, 0, 1.02)
    const r = RADIUS + 12.5 * clamp(openP, 0, 1)
    const left = (SHELL_W - w) / 2

    if (Math.abs(w - lastWidth) > 0.01) {
      shell.style.width = `${w.toFixed(3)}px`
      lastWidth = w
    }
    if (Math.abs(h - lastHeight) > 0.01) {
      shell.style.height = `${h.toFixed(3)}px`
      lastHeight = h
    }
    if (Math.abs(r - lastRadius) > 0.01) {
      shell.style.borderRadius = `${r.toFixed(3)}px`
      lastRadius = r
    }
    if (Math.abs(left - lastLeft) > 0.01) {
      shell.style.left = `${left.toFixed(3)}px`
      lastLeft = left
    }

    /* 标签内容：随外壳收窄横向压缩，过程中淡出 + 模糊 */
    const tabFade = 1 - smoothstep(0.03, 0.39, openP)
    const tabBlur = 22 * Math.sin(Math.PI * clamp(openP, 0, 1))
    tabContent.style.transform = `scaleX(${(w / SHELL_W).toFixed(5)})`
    tabContent.style.opacity = tabFade.toFixed(4)
    tabContent.style.filter = tabBlur < 0.01 ? 'none' : `blur(${tabBlur.toFixed(2)}px)`

    /* 菜单内容：尺寸跟着外壳走，p 越高越清晰 */
    const cp = clamp(sContent.p, 0, 1)
    const menuBlur = 22 * (1 - cp)
    menuContent.style.transform = `scale(${(w / SHELL_W).toFixed(5)},${(h / SHELL_H_OPEN).toFixed(5)})`
    menuContent.style.opacity = cp.toFixed(4)
    menuContent.style.filter = menuBlur < 0.01 ? 'none' : `blur(${menuBlur.toFixed(2)}px)`

    /* 选中块：带速度的横向位置 → 薄玻璃轮廓 */
    const travel = clamp(Math.abs(sSelection.v) / 7, 0, 1)
    const x = sSelection.p * TAB_W
    const sx = 1 + 0.08 * travel
    const sy = 1 + 0.25 * travel
    const tf = `translate3d(${x.toFixed(3)}px,0,0) scale(${sx.toFixed(4)},${sy.toFixed(4)})`
    sel.style.transform = tf
    sel.style.background = rgba(255, 255, 255, selBase * (1 - 0.95 * travel))
    sel.style.boxShadow = `inset 0 0 0 1.5px rgba(255,255,255,.9), 0 ${(7 - 3 * travel).toFixed(2)}px ${(
      17 + 5 * travel
    ).toFixed(2)}px rgba(82,77,99,${(0.15 - 0.07 * travel).toFixed(3)})`

    lens.style.transform = tf
    lens.style.opacity = travel.toFixed(3)

    /* 圆按钮：按下脉冲 + 加号随外壳进度旋转 */
    const press = clamp(sPress.p, 0, 0.48)
    fab.style.transform = `scale(${(1 + 0.6 * press).toFixed(4)})`
    fabFill.style.opacity = clamp(sPress.p / 0.3, 0, 1) * 0.62
    plus.style.transform = `rotate(${(45 * openP).toFixed(2)}deg)`

    /* 交互可见性：不可见的内容既不接指针也不接焦点 */
    const menuLive = cp > 0.62
    menuContent.style.pointerEvents = menuLive ? 'auto' : 'none'
    menu.inert = !menuLive
    const tabLive = cp <= 0.38
    tabContent.style.pointerEvents = tabLive ? 'auto' : 'none'
    tabList.inert = !tabLive
  }

  /* ------------------------------ 弹簧 ------------------------------ */

  function snapAll() {
    sOpening.p = sOpening.t
    sOpening.v = 0
    sSelection.p = sSelection.t
    sSelection.v = 0
    sCompression.p = sCompression.t
    sCompression.v = 0
    sPress.p = sPress.t
    sPress.v = 0
    sContent.p = sContent.t
    sContent.v = 0
    hold.opening = 0
    hold.content = 0
    pendingImpulse = 0
    pendingImpulseDelay = 0
    lastWidth = lastHeight = lastRadius = lastLeft = -1
    render()
  }

  const step = (s, dt) => {
    stepSpring(s, dt)
    if (springSettled(s)) snapSpring(s)
  }

  const loop = createLoop((dt) => {
    if (isReduced()) {
      snapAll()
      return false
    }

    /* 收窄冲量：从端点切换时延后 90ms 施加 */
    if (pendingImpulseDelay > 0) {
      pendingImpulseDelay -= dt
      if (pendingImpulseDelay <= 0) {
        impulse(sCompression, pendingImpulse, 20)
        pendingImpulse = 0
        pendingImpulseDelay = 0
      }
    }

    /* 高度起步延迟：延迟期间冻结，只让按钮先亮 */
    if (hold.opening > 0) {
      hold.opening -= dt
      sOpening.v = 0
    } else {
      step(sOpening, dt)
    }

    if (hold.content > 0) {
      hold.content -= dt
      sContent.v = 0
    } else {
      step(sContent, dt)
    }

    step(sSelection, dt)
    step(sCompression, dt)
    step(sPress, dt)

    render()

    const busy =
      !springSettled(sOpening) ||
      !springSettled(sSelection) ||
      !springSettled(sCompression) ||
      !springSettled(sPress) ||
      !springSettled(sContent) ||
      hold.opening > 0 ||
      hold.content > 0 ||
      pendingImpulseDelay > 0
    if (!busy) {
      /* 停稳：把压缩量归零，避免外壳永久偏窄 */
      if (sCompression.p !== 0) {
        sCompression.p = 0
        sCompression.v = 0
        render()
      }
      return false
    }
    return true
  })

  const kick = () => loop.start()

  /* ---------------------------- 选中与菜单 ---------------------------- */

  function syncAria() {
    tabButtons.forEach((b, i) => {
      const on = i === selected
      b.setAttribute('aria-selected', on ? 'true' : 'false')
      b.tabIndex = on ? 0 : -1
    })
  }

  function select(i, focus) {
    const next = clamp(i, 0, items.length - 1)
    const changed = next !== selected
    selected = next
    sSelection.t = next
    syncAria()
    if (focus) tabButtons[next].focus()
    if (changed) {
      const label = items[next] && items[next].label
      if (label) live.textContent = `${label} selected`
      if (opts.onChange) opts.onChange(next, items[next])
    }
    kick()
  }

  function onTabKeyDown(e) {
    const n = items.length
    let next = selected
    if (e.key === 'ArrowLeft') next = (selected - 1 + n) % n
    else if (e.key === 'ArrowRight') next = (selected + 1) % n
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else return
    e.preventDefault()
    select(next, true)
  }

  function setOpen(next, focusTarget) {
    const target = next ? 1 : 0
    if ((target === 1) === menuOpen) return

    menuOpen = target === 1
    group.dataset.open = menuOpen ? 'true' : 'false'
    fab.setAttribute('aria-expanded', menuOpen ? 'true' : 'false')
    fab.setAttribute('aria-label', menuOpen ? opts.fabLabelClose : opts.fabLabelOpen)

    /* 从端点切换 → 先播按钮反馈，其余延后起步 */
    const dist = Math.abs(target - sOpening.p)
    const fromEnd = dist > 0.95

    sOpening.t = target
    sContent.t = target
    impulse(sPress, 16, 18)

    if (fromEnd) {
      hold.opening = 0.075
      hold.content = menuOpen ? 0.17 : 0
      pendingImpulse = 17 * dist
      pendingImpulseDelay = 0.09
    } else {
      /* 中途反向：取消所有起步延迟，沿当前位置继续 */
      hold.opening = 0
      hold.content = 0
      pendingImpulse = 17 * dist
      pendingImpulseDelay = 0
      impulse(sCompression, pendingImpulse, 20)
      pendingImpulse = 0
    }

    if (isReduced()) {
      snapAll()
    } else {
      kick()
    }

    if (menuOpen && focusTarget !== undefined && focusTarget !== null) {
      const idx = focusTarget < 0 ? menuButtons.length - 1 : focusTarget
      /* 等内容清晰了再给焦点，避免焦点落在看不见的东西上 */
      const tryFocus = () => {
        if (!menuOpen) return
        if (clamp(sContent.p, 0, 1) > 0.62) menuButtons[idx] && menuButtons[idx].focus()
        else requestAnimationFrame(tryFocus)
      }
      requestAnimationFrame(tryFocus)
    }
  }

  function onMenuKeyDown(e) {
    const n = menuButtons.length
    const cur = menuButtons.indexOf(e.currentTarget)
    let next = -1
    if (e.key === 'ArrowRight') next = (cur + 1) % n
    else if (e.key === 'ArrowLeft') next = (cur - 1 + n) % n
    else if (e.key === 'ArrowDown') next = (cur + 3) % n
    else if (e.key === 'ArrowUp') next = (cur - 3 + n) % n
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      fab.focus()
      return
    } else return
    e.preventDefault()
    menuButtons[next] && menuButtons[next].focus()
  }

  function runAction(i) {
    const item = menuItems[i]
    if (!item) return
    const action = item.action || item.key
    live.textContent = `${item.label} selected`
    setOpen(false)
    fab.focus()
    if (opts.onAction) opts.onAction(action, item)
    group.dispatchEvent(
      new CustomEvent(opts.actionEvent, { detail: { action }, bubbles: true, composed: true }),
    )
  }

  fab.addEventListener('click', () => setOpen(!menuOpen))
  fab.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!menuOpen) setOpen(true, 0)
      else menuButtons[0] && menuButtons[0].focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!menuOpen) setOpen(true, -1)
      else menuButtons[menuButtons.length - 1] && menuButtons[menuButtons.length - 1].focus()
    }
  })

  /* Escape：焦点在圆钮或格子上都能收起，并回到圆钮 */
  group.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !menuOpen) return
    e.preventDefault()
    e.stopPropagation()
    setOpen(false)
    fab.focus()
  })

  /* Tab 离开整个组合 → 收起 */
  group.addEventListener('focusout', (e) => {
    if (!menuOpen) return
    const next = e.relatedTarget
    const path = e.composedPath ? e.composedPath() : []
    if (next && (group.contains(next) || path.includes(group))) return
    if (next && typeof next.focus === 'function' && host.contains(next)) return
    setOpen(false)
  })

  /* 点组合之外的空白也收起（composedPath 才能看穿 shadow 边界） */
  const onDocPointerDown = (e) => {
    if (!menuOpen) return
    const path = e.composedPath ? e.composedPath() : []
    if (path.includes(group) || path.includes(host)) return
    setOpen(false)
  }
  document.addEventListener('pointerdown', onDocPointerDown, true)

  /* ------------------------------ 测量 ------------------------------ */

  function measure() {
    const rect = host.getBoundingClientRect()
    const w = rect.width
    const h = rect.height
    /* 隐藏容器 / 首帧为 0：按设计宽度初始化，不除零 */
    const width = w > 0 ? w : DESIGN
    const k = opts.fit === 'width' ? width / DESIGN : Math.min(width, h > 0 ? h : DESIGN) / DESIGN
    stage.dataset.align = opts.align === 'bottom' ? 'bottom' : 'center'
    if (opts.align === 'bottom') {
      /* 组合在舞台内部距底 318 设计像素，所以舞台要往下沉 318k，
         组合的底边才会落在「容器底 − padBottom」上 */
      stage.style.bottom = `${(opts.padBottom - GROUP_BOTTOM * k).toFixed(2)}px`
    } else {
      stage.style.bottom = ''
    }
    stage.style.transform = `scale(${k.toFixed(5)})`
    const rawSel = getComputedStyle(host).getPropertyValue('--gts-sel').trim()
    const parsed = parseFloat(rawSel)
    selBase = Number.isFinite(parsed) ? parsed : 0.98
    if (opts.height) scene.style.height = `${opts.height}px`
    else if (opts.align === 'bottom') scene.style.height = `${Math.round(GROUP_H * k + opts.padBottom + 10)}px`
    else scene.style.height = ''
    render()
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null
  if (ro) ro.observe(host)

  const onMq = () => {
    if (isReduced()) snapAll()
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', onMq)

  /* ------------------------------ 初始化 ------------------------------ */
  syncAria()
  menu.inert = true
  tabContent.style.willChange = 'transform, opacity'
  measure()
  render()
  if (isReduced()) snapAll()

  const instance = {
    host,
    scene,
    stage,
    group,
    getState: () => ({
      open: menuOpen,
      value: selected,
      opening: sOpening.p,
      selection: sSelection.p,
      compression: sCompression.p,
      press: sPress.p,
      content: sContent.p,
    }),
    setValue(i, animate = true) {
      const next = clamp(i, 0, items.length - 1)
      selected = next
      sSelection.t = next
      if (!animate || isReduced()) {
        sSelection.p = next
        sSelection.v = 0
        render()
      }
      syncAria()
      kick()
    },
    setOpen(v) {
      setOpen(!!v)
    },
    toggle() {
      setOpen(!menuOpen)
    },
    setOptions(next) {
      Object.assign(opts, next || {})
      if (next && 'reducedMotion' in next) {
        reduced = next.reducedMotion
        if (isReduced()) snapAll()
      }
      if (next && next.transparent !== undefined) scene.dataset.bg = next.transparent ? 'none' : 'stage'
      measure()
    },
    refresh: measure,
    destroy() {
      loop.stop()
      if (ro) ro.disconnect()
      if (mq && mq.removeEventListener) mq.removeEventListener('change', onMq)
      document.removeEventListener('pointerdown', onDocPointerDown, true)
      root.textContent = ''
      instance.destroyed = true
    },
    destroyed: false,
  }

  return instance
}

export default createGlassTabMenu
