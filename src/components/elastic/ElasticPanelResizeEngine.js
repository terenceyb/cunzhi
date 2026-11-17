/**
 * ElasticPanelResizeEngine.js
 * ---------------------------------------------------------------------------
 * 框架无关的「弹性面板缩放」交互核心。
 *
 * 它只做四件事：
 *   1. 在面板左边缘维护一条 32px 的透明命中区（内含 80×160 的把手 SVG）
 *   2. 用指针事件驱动面板左边缘的位置，边界外最多 15px 橡皮筋
 *   3. 用 requestAnimationFrame 逐帧积分位置 / 弯曲 / 偏移 / 粗细 / 长度 / 透明度
 *   4. 处理键盘、无障碍属性、隐藏延时、尺寸变化、卸载清理
 *
 * 所有状态都在闭包里，同页多实例互不干扰；不改宿主页的 body / 全局 ID / 全局样式
 * （只注入一份 `.epr-*` 前缀的样式表，幂等）。
 *
 * 用法：
 *   const engine = createElasticPanelResize({ host, panel })
 *   engine.setWidth(420)
 *   engine.destroy()
 */

import { clamp, createLoop, expApproach, settleSpring, spring, stepSpring } from './motion-runtime'

const SVG_NS = 'http://www.w3.org/2000/svg'
const STYLE_ID = 'epr-style-v1'

/* ---- 物理与视觉常量：全部来自规范，改这里就能整体调手感 ---- */
const K_POSITION = 400 // 位置弹簧刚度
const C_POSITION = 26 // 位置弹簧阻尼
const K_SHAPE = 680 // 弯曲 / 整条偏移的刚度
const C_SHAPE = 34 // 弯曲 / 整条偏移的阻尼
const EASE_RATE = 32 // 粗细 / 长度 / 透明度的指数插值速率
const SUBSTEPS = 4 // 每帧拆成 4 个子步
const RUBBER_MAX = 15 // 边界外最大橡皮筋位移
const RUBBER_SCALE = 35 // 橡皮筋饱和尺度
const VELOCITY_CLAMP = 2200 // 指针速度上限 px/s
const VELOCITY_IDLE = 70 // 超过这么久没有 move，速度归零（毫秒）
const HIDE_DELAY = 450 // 离开后延迟收细隐藏（毫秒）
const GRAB_LEFT = 20 // 命中区向右偏 20px，只侵入面板 12px
const DESIGN_WIDTH = 1000 // 容器宽度为 0 时的设计宽度兜底

export const ELASTIC_DEFAULTS = {
  minRatio: 0.276,
  maxRatio: 0.5,
  initialRatio: 0.3865,
  rightGap: 17,
  ariaLabel: '调整面板宽度',
}

const CSS = `
.epr-hit{position:absolute;width:32px;height:200px;top:0;left:0;cursor:ew-resize;touch-action:none;
  z-index:44;display:grid;place-items:center;background:transparent;
  -webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}
/* 全局 :focus-visible 会给焦点元素加一圈阴影，这里统一关掉，键盘焦点环改用下面的 ::after */
.epr-hit,.epr-hit:focus,.epr-hit:focus-visible{outline:none;box-shadow:none}
.epr-hit:focus-visible:not([data-pointer])::after{content:'';position:absolute;left:50%;top:50%;width:48px;height:132px;
  transform:translate(-50%,-50%);border:2px solid #666;border-radius:26px;box-sizing:border-box}
.epr-svg{position:absolute;left:0;top:50%;margin-top:-80px;width:80px;height:160px;display:block;overflow:visible;pointer-events:none}
.epr-outer,.epr-inner{fill:none;stroke-linecap:round}
.epr-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
  clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;
  font:400 12px/1 Arial,Helvetica,sans-serif;color:transparent}
`

function ensureStyle(doc) {
  if (!doc || doc.getElementById(STYLE_ID)) return
  const el = doc.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  doc.head.appendChild(el)
}

export function createElasticPanelResize(options) {
  const host = options && options.host
  if (!host) throw new Error('ElasticPanelResize: 需要 host 元素')
  const panel = options.panel || null
  const doc = host.ownerDocument || document

  ensureStyle(doc)

  const opts = {
    minRatio: ELASTIC_DEFAULTS.minRatio,
    maxRatio: ELASTIC_DEFAULTS.maxRatio,
    initialRatio: ELASTIC_DEFAULTS.initialRatio,
    rightGap: ELASTIC_DEFAULTS.rightGap,
    ariaLabel: ELASTIC_DEFAULTS.ariaLabel,
    ...options,
  }
  if (opts.reducedMotion == null) {
    const mq = doc.defaultView ? doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)') : null
    opts.reducedMotion = !!(mq && mq.matches)
  }

  /* ---------------- DOM：命中区 + 把手 + 无障碍播报 ---------------- */
  const hit = doc.createElement('div')
  hit.className = 'epr-hit'
  hit.setAttribute('role', 'separator')
  hit.setAttribute('tabindex', '0')
  hit.setAttribute('aria-orientation', 'vertical')
  hit.setAttribute('aria-label', opts.ariaLabel)
  if (panel && panel.id) hit.setAttribute('aria-controls', panel.id)

  const svg = doc.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'epr-svg')
  svg.setAttribute('width', '80')
  svg.setAttribute('height', '160')
  svg.setAttribute('viewBox', '0 0 80 160')
  svg.setAttribute('aria-hidden', 'true')
  const outer = doc.createElementNS(SVG_NS, 'path')
  outer.setAttribute('class', 'epr-outer')
  outer.setAttribute('stroke', '#ffffff')
  const inner = doc.createElementNS(SVG_NS, 'path')
  inner.setAttribute('class', 'epr-inner')
  inner.setAttribute('stroke', '#c6c6c6')
  svg.appendChild(outer)
  svg.appendChild(inner)
  /* 命中区为减小对面板内容的遮挡向右偏了 GRAB_LEFT，这里把图形挪回边缘正中 */
  svg.style.transform = `translateX(${GRAB_LEFT - 40}px)`
  hit.appendChild(svg)

  const live = doc.createElement('div')
  live.className = 'epr-sr'
  live.setAttribute('role', 'status')
  live.setAttribute('aria-live', 'polite')

  host.appendChild(hit)
  host.appendChild(live)

  /* ---------------- 状态 ---------------- */
  const st = {
    /* 位置：value 是当前左边缘，target 是合法范围内的目标 */
    pos: spring(K_POSITION, C_POSITION),
    /* 弯曲 B / 整条偏移 O */
    b: spring(K_SHAPE, C_SHAPE),
    o: spring(K_SHAPE, C_SHAPE),
    /* 长度 L / 粗细 S / 透明度 R：指数插值，不需要回弹 */
    l: 60,
    s: 0,
    r: 0,
    m: 0,
    dragging: false,
    pointerId: -1,
    grab: 0,
    rawLast: 0,
    lastMoveAt: 0,
    speed: 0,
    overflow: 0,
    restore: 0,
    hover: false,
    focus: false,
    hideTimer: 0,
    started: false,
    reduced: !!opts.reducedMotion,
    W: 0,
    destroyed: false,
  }
  /* 用可变对象承载 l/s/r 的目标，方便在帧里统一赋值 */
  const target = { l: 60, s: 0, r: 0 }

  let W = 0
  let ro = null
  let mediaQuery = null

  const loop = createLoop((dt) => frame(dt))

  /* ---------------- 几何 ---------------- */
  function bounds() {
    const w = W || DESIGN_WIDTH
    if (opts.minWidth != null) {
      const gap = opts.rightGap || 0
      const maxW = opts.maxWidth != null ? opts.maxWidth : opts.minWidth
      let minLeft = w - gap - maxW
      let maxLeft = w - gap - opts.minWidth
      if (maxLeft < minLeft) {
        const tmp = minLeft
        minLeft = maxLeft
        maxLeft = tmp
      }
      const initW = opts.initialWidth != null ? opts.initialWidth : opts.minWidth
      const lo = Math.max(0, Math.min(minLeft, maxLeft))
      const hi = Math.max(lo, Math.max(minLeft, maxLeft))
      return { minLeft: lo, maxLeft: hi, initial: clamp(w - gap - initW, lo, hi) }
    }
    const a = opts.minRatio * w
    const b = opts.maxRatio * w
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    return { minLeft: lo, maxLeft: hi, initial: clamp(opts.initialRatio * w, lo, hi) }
  }

  function widthAt(left) {
    return Math.max(0, (W || DESIGN_WIDTH) - (opts.rightGap || 0) - left)
  }

  function panelBox() {
    if (!panel) return { top: 0, height: host.clientHeight || 0 }
    const top = panel.offsetTop || 0
    const height = panel.offsetHeight || host.clientHeight || 0
    return { top, height }
  }

  function syncHitBox() {
    const box = panelBox()
    hit.style.top = box.top + 'px'
    hit.style.height = Math.max(0, box.height) + 'px'
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    const p = st.pos.value
    hit.style.left = p - GRAB_LEFT + 'px'

    const x = 40 + st.o.value
    const L = st.l
    const d = `M ${x} ${80 - L / 2} Q ${x + 2 * st.b.value} 80 ${x} ${80 + L / 2}`
    const R = st.r
    const S = st.s
    inner.setAttribute('d', d)
    outer.setAttribute('d', d)
    outer.setAttribute('stroke-width', Math.max(0, S + 2 * R))
    outer.setAttribute('opacity', R)
    inner.setAttribute('stroke-width', Math.max(0, S))
    inner.setAttribute('opacity', R)
    const g = Math.round(clamp(198 - 39 * st.m, 0, 255))
    inner.setAttribute('stroke', `rgb(${g},${g},${g})`)

    const w = W || DESIGN_WIDTH
    if (panel) panel.style.width = widthAt(p) + 'px'
    const b = bounds()
    const value = 100 * (1 - p / w)
    hit.setAttribute('aria-valuemin', (100 * (1 - b.maxLeft / w)).toFixed(1))
    hit.setAttribute('aria-valuemax', (100 * (1 - b.minLeft / w)).toFixed(1))
    hit.setAttribute('aria-valuenow', value.toFixed(1))
    hit.setAttribute('aria-valuetext', `面板宽度 ${Math.round(widthAt(p))} 像素`)

    if (typeof opts.onChange === 'function') {
      opts.onChange({ left: p, width: widthAt(p), percent: value })
    }
  }

  function announce() {
    live.textContent = `面板宽度 ${Math.round(widthAt(st.pos.target))} 像素`
  }

  function commit() {
    if (typeof opts.onCommit === 'function') {
      opts.onCommit({ left: st.pos.target, width: widthAt(st.pos.target) })
    }
    announce()
  }

  /* ---------------- 逐帧 ---------------- */
  function shouldStop() {
    if (st.dragging) return false
    if (st.reduced) {
      return (
        Math.abs(st.pos.target - st.pos.value) < 0.01 &&
        Math.abs(st.pos.velocity) < 0.05 &&
        Math.abs(target.r - st.r) < 0.001
      )
    }
    return (
      Math.abs(st.pos.target - st.pos.value) < 0.01 &&
      Math.abs(st.pos.velocity) < 0.05 &&
      Math.abs(st.b.target - st.b.value) < 0.01 &&
      Math.abs(st.b.velocity) < 0.03 &&
      Math.abs(st.o.target - st.o.value) < 0.01 &&
      Math.abs(st.o.velocity) < 0.03 &&
      Math.abs(target.s - st.s) < 0.01 &&
      Math.abs(target.l - st.l) < 0.01 &&
      Math.abs(target.r - st.r) < 0.001
    )
  }

  function snap() {
    settleSpring(st.pos)
    if (!st.dragging) {
      settleSpring(st.b)
      settleSpring(st.o)
    }
    st.l = target.l
    st.s = target.s
    st.r = target.r
  }

  function frame(dt) {
    if (st.destroyed) return false
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now - st.lastMoveAt > VELOCITY_IDLE) st.speed = 0

    const dragging = st.dragging
    const d = dragging ? clamp(st.speed / 60, -1, 1) : 0
    const q = dragging ? clamp(Math.abs(st.overflow) / 80, 0, 1) : 0
    const m = st.reduced ? 0 : Math.max(Math.abs(d) * (1 - q), q)
    st.m = m
    const show = dragging || st.focus || st.hover ? 1 : 0

    if (st.reduced) {
      st.b.target = 0
      st.o.target = 0
      target.l = 60
      target.s = 15 * show
    } else {
      st.b.target = 4.5 * d * (1 - q)
      st.o.target = 9 * d * (1 - q) + 6 * Math.sign(st.overflow) * q
      target.l = 60 + 30 * m + 21 * q
      target.s = (15 - 10 * m - 2 * q) * show
    }
    target.r = show

    const h = dt / SUBSTEPS
    for (let i = 0; i < SUBSTEPS; i++) {
      if (!st.dragging) stepSpring(st.pos, h)
      if (!st.reduced) {
        stepSpring(st.b, h)
        stepSpring(st.o, h)
      }
    }
    if (st.reduced) {
      st.l = target.l
      st.s = target.s
      st.r = target.r
      st.b.value = 0
      st.o.value = 0
    } else {
      st.l = expApproach(st.l, target.l, dt, EASE_RATE)
      st.s = expApproach(st.s, target.s, dt, EASE_RATE)
      st.r = expApproach(st.r, target.r, dt, EASE_RATE)
    }

    if (shouldStop()) {
      snap()
      render()
      return false
    }
    render()
    return true
  }

  function wake() {
    if (st.destroyed) return
    loop.start()
  }

  /* ---------------- 指针 ---------------- */
  function localX(e) {
    const r = host.getBoundingClientRect()
    return e.clientX - r.left
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (st.destroyed) return
    st.dragging = true
    st.pointerId = e.pointerId
    st.grab = localX(e) - st.pos.value
    st.rawLast = st.pos.value
    st.lastMoveAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    st.speed = 0
    st.restore = st.pos.target
    try {
      hit.setPointerCapture(e.pointerId)
    } catch {
      /* 某些环境不支持捕获，退化为普通拖动 */
    }
    /* 指针拖出来的焦点不显示键盘焦点环，避免把手外面多出一个深色方框 */
    hit.setAttribute('data-pointer', '1')
    hit.focus({ preventScroll: true })
    e.preventDefault()
    wake()
  }

  function onPointerMove(e) {
    if (!st.dragging || e.pointerId !== st.pointerId) return
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const raw = localX(e) - st.grab
    const b = bounds()
    const t = clamp(raw, b.minLeft, b.maxLeft)
    const over = raw - t
    st.pos.target = t
    st.overflow = over
    /* 合法范围内直接跟随指针；越界后只保留最多 15px 的橡皮筋 */
    st.pos.value = t + Math.sign(over) * RUBBER_MAX * (1 - Math.exp(-Math.abs(over) / RUBBER_SCALE))
    const dtEvent = Math.max((now - st.lastMoveAt) / 1000, 0.008)
    const v = clamp((raw - st.rawLast) / dtEvent, -VELOCITY_CLAMP, VELOCITY_CLAMP)
    st.speed = now - st.lastMoveAt > VELOCITY_IDLE ? 0 : v
    st.rawLast = raw
    st.lastMoveAt = now
    wake()
    e.preventDefault()
  }

  function endDrag(restore) {
    if (!st.dragging) return
    st.dragging = false
    st.overflow = 0
    st.speed = 0
    st.pos.velocity = 0
    if (restore) st.pos.target = st.restore
    try {
      if (st.pointerId >= 0 && hit.hasPointerCapture && hit.hasPointerCapture(st.pointerId)) {
        hit.releasePointerCapture(st.pointerId)
      }
    } catch {
      /* ignore */
    }
    st.pointerId = -1
    commit()
    /* 松手时指针可能已经离开命中区：不能留下虚假的 hover */
    let hovering = false
    try {
      hovering = hit.matches(':hover')
    } catch {
      hovering = false
    }
    if (!hovering) {
      st.hover = false
      scheduleHide()
    }
    wake()
  }

  function onPointerUp(e) {
    if (e && e.pointerId !== st.pointerId) return
    endDrag(false)
  }

  function onPointerCancel(e) {
    if (e && e.pointerId !== st.pointerId) return
    endDrag(true)
  }

  function onLostCapture(e) {
    if (st.dragging) endDrag(false)
  }

  /* ---------------- 悬停 / 聚焦 ---------------- */
  function clearHide() {
    if (st.hideTimer) {
      clearTimeout(st.hideTimer)
      st.hideTimer = 0
    }
  }

  function scheduleHide() {
    clearHide()
    if (st.dragging || st.focus || st.hover) return
    st.hideTimer = setTimeout(() => {
      st.hideTimer = 0
      st.hover = false
      wake()
    }, HIDE_DELAY)
  }

  function onEnter() {
    st.hover = true
    clearHide()
    wake()
  }

  function onLeave() {
    st.hover = false
    if (st.dragging || st.focus) return
    scheduleHide()
  }

  function onFocus() {
    st.focus = true
    clearHide()
    wake()
  }

  function onBlur() {
    st.focus = false
    if (st.dragging) return
    scheduleHide()
  }

  /* ---------------- 键盘 ---------------- */
  function step(fraction) {
    const b = bounds()
    st.pos.target = clamp(st.pos.target + fraction * (W || DESIGN_WIDTH), b.minLeft, b.maxLeft)
    commit()
    wake()
  }

  function reset() {
    st.pos.target = bounds().initial
    commit()
    wake()
  }

  function onKeyDown(e) {
    hit.removeAttribute('data-pointer')
    const unit = e.shiftKey ? 0.06 : 0.02
    switch (e.key) {
      case 'ArrowLeft':
        step(-unit)
        break
      case 'ArrowRight':
        step(unit)
        break
      case 'Home':
        st.pos.target = bounds().minLeft
        commit()
        wake()
        break
      case 'End':
        st.pos.target = bounds().maxLeft
        commit()
        wake()
        break
      case 'Escape':
        if (st.dragging) endDrag(true)
        else reset()
        break
      default:
        return
    }
    e.preventDefault()
  }

  function onDblClick(e) {
    e.preventDefault()
    reset()
  }

  /* ---------------- 尺寸 ---------------- */
  function measure() {
    if (st.destroyed) return
    const w = host.clientWidth
    if (!w) {
      /* 隐藏容器 / 首帧宽度为 0：用设计宽度兜底，等真实尺寸到来再按比例换算 */
      if (!W) W = DESIGN_WIDTH
      syncHitBox()
      render()
      return
    }
    if (!st.started) {
      W = w
      st.pos.value = st.pos.target = bounds().initial
      st.started = true
      syncHitBox()
      render()
      return
    }
    if (w !== W) {
      const ratio = st.pos.value / W
      W = w
      const b = bounds()
      const next = clamp(ratio * W, b.minLeft, b.maxLeft)
      st.pos.value = next
      st.pos.target = next
      st.pos.velocity = 0
      syncHitBox()
      render()
    } else {
      syncHitBox()
    }
  }

  /* ---------------- 事件绑定 ---------------- */
  hit.addEventListener('pointerdown', onPointerDown)
  hit.addEventListener('pointermove', onPointerMove)
  hit.addEventListener('pointerup', onPointerUp)
  hit.addEventListener('pointercancel', onPointerCancel)
  hit.addEventListener('lostpointercapture', onLostCapture)
  hit.addEventListener('pointerenter', onEnter)
  hit.addEventListener('pointerleave', onLeave)
  hit.addEventListener('focus', onFocus)
  hit.addEventListener('blur', onBlur)
  hit.addEventListener('keydown', onKeyDown)
  hit.addEventListener('dblclick', onDblClick)

  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => measure())
    ro.observe(host)
    if (panel) ro.observe(panel)
  }
  if (opts.reducedMotion == null && doc.defaultView) {
    mediaQuery = doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)')
  }

  measure()

  /* ---------------- 对外 API ---------------- */
  return {
    el: hit,
    /** 设置面板宽度（px），带弹性动画 */
    setWidth(px) {
      if (px == null || !Number.isFinite(px)) return
      st.pos.target = clamp((W || DESIGN_WIDTH) - (opts.rightGap || 0) - px, 0, W || DESIGN_WIDTH)
      wake()
    },
    /** 立即跳到一个比例位置（0~1，指左边缘占容器宽度的比例） */
    setPosition(ratio) {
      const b = bounds()
      const next = clamp((W || DESIGN_WIDTH) * ratio, b.minLeft, b.maxLeft)
      st.pos.value = st.pos.target = next
      st.pos.velocity = 0
      render()
    },
    getWidth() {
      return widthAt(st.pos.value)
    },
    getLeft() {
      return st.pos.value
    },
    /** 更新可变选项，不重挂载 */
    setOptions(next) {
      Object.assign(opts, next || {})
      st.reduced = !!opts.reducedMotion
      measure()
      wake()
    },
    refresh() {
      measure()
    },
    destroy() {
      if (st.destroyed) return
      st.destroyed = true
      loop.stop()
      clearHide()
      if (ro) ro.disconnect()
      ro = null
      if (mediaQuery) mediaQuery = null
      hit.removeEventListener('pointerdown', onPointerDown)
      hit.removeEventListener('pointermove', onPointerMove)
      hit.removeEventListener('pointerup', onPointerUp)
      hit.removeEventListener('pointercancel', onPointerCancel)
      hit.removeEventListener('lostpointercapture', onLostCapture)
      hit.removeEventListener('pointerenter', onEnter)
      hit.removeEventListener('pointerleave', onLeave)
      hit.removeEventListener('focus', onFocus)
      hit.removeEventListener('blur', onBlur)
      hit.removeEventListener('keydown', onKeyDown)
      hit.removeEventListener('dblclick', onDblClick)
      if (panel) panel.style.width = ''
      if (hit.parentNode) hit.parentNode.removeChild(hit)
      if (live.parentNode) live.parentNode.removeChild(live)
    },
  }
}

export default createElasticPanelResize
