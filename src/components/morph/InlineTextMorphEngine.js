/* ============================================================================
   InlineTextMorph 核心（框架无关）
   ----------------------------------------------------------------------------
   一句话：三行居中句子里的浅灰胶囊可以点击，词和贴纸一起换。文字不是整词淡入
   淡出，而是按 grapheme 拆分后做 FLIP —— 相同的字母保留 DOM 身份、从旧坐标滑到
   新坐标，多余的字母朝最近的保留字母收拢并缩小淡出，新来的字母从邻近字母处
   展开。胶囊宽度由弹簧驱动，句子始终在布局流里重新居中。

   这个文件不依赖任何框架：传入宿主元素即可挂载，卸载用返回的 destroy()。
   ========================================================================== */

import { clamp, EASE_TEXT, ICON_IN_MS, ICON_OUT_MS, SPRING_WIDTH, scalar, stepSpring, ticker } from './motion-runtime'
import { ANGLES, stickerMarkup } from './icons'

const DESIGN_W = 1044
const DESIGN_H = 684
const LINE_W = 960
const LINE_H = 64
const LINE_TOP = 342
const MARK = { x: 380, y: 150, w: 284, h: 96 }

/** 图标窗口与文字窗口的几何（提示词里给的实测值） */
const GEO = {
  btnH: 64,
  padLeft: 4.8,
  padRight: 13.44,
  glassH: 54.8,
  glassDrop: 3.16,
  icoW: 64.97,
  icoDrop: 2.16,
  textLeft: 77.45,
}

const STYLE = `
:host { display: block; }
* { box-sizing: border-box; }
.scene {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: transparent;
  display: flex;
  justify-content: center;
}
.stage {
  position: relative;
  width: ${DESIGN_W}px;
  height: ${DESIGN_H}px;
  transform-origin: 50% 0;
  flex: 0 0 auto;
  font-family: var(--itm-font, Inter, "Helvetica Neue", Arial, system-ui, sans-serif);
  color: var(--itm-ink, #181818);
}
/* 字标：黑色圆角描边的方块 */
.mark {
  position: absolute;
  left: ${MARK.x}px;
  top: ${MARK.y}px;
  width: ${MARK.w}px;
  height: ${MARK.h}px;
  display: grid;
  place-items: center;
  border: 8px solid var(--itm-mark-line, #0b0b0b);
  border-radius: 48px;
  background: var(--itm-mark-bg, #fff);
  font-size: 54px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -2.8px;
  white-space: nowrap;
  user-select: none;
}
.lines {
  position: absolute;
  left: ${(DESIGN_W - LINE_W) / 2}px;
  top: ${LINE_TOP}px;
  width: ${LINE_W}px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}
.line {
  height: ${LINE_H}px;
  line-height: ${LINE_H}px;
  font-size: 48px;
  font-weight: 500;
  letter-spacing: -0.024px;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
}
.line .txt { white-space: pre; }
/* compact：只留三行句子，字标让位给页面自己的品牌区 */
.stage.is-compact { height: 300px; }
.stage.is-compact .mark { display: none; }
.stage.is-compact .lines { left: 42px; top: 54px; }

/* ---------------- 胶囊 ---------------- */
.pill {
  position: relative;
  height: ${GEO.btnH}px;
  margin: 0 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  will-change: width;
}
.pill:focus { outline: none; }
.pill:focus-visible { outline: none; }
/* 焦点环画在玻璃之外，2px 实线 + 4px 外距 */
.pill-ring {
  position: absolute;
  left: -4px;
  right: -4px;
  top: 50%;
  height: ${GEO.glassH + 10}px;
  transform: translateY(calc(-50% + ${GEO.glassDrop}px));
  border-radius: 999px;
  border: 2px solid transparent;
  pointer-events: none;
}
.pill:focus-visible .pill-ring {
  border-color: var(--itm-focus, #72726e);
}
/* 浅灰玻璃：只改底色，抬升与位移一律不做 */
.pill-glass {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: ${GEO.glassH}px;
  transform: translateY(calc(-50% + ${GEO.glassDrop}px));
  border-radius: 999px;
  background: var(--itm-pill, #ededea);
  box-shadow: inset 0 0 0 1px rgba(17, 22, 30, 0.02);
  transition: background-color 160ms ease;
  pointer-events: none;
}
@media (hover: hover) {
  .pill:hover .pill-glass { background: var(--itm-pill-hover, #e8e8e5); }
}
.pill:active .pill-glass { background: var(--itm-pill-active, #dededb); }

/* 图标窗 */
.ico {
  position: relative;
  width: ${GEO.icoW}px;
  height: 64px;
  margin-left: ${GEO.padLeft}px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  transform: translateY(${GEO.icoDrop}px);
}
.ico-layer {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  will-change: transform, opacity;
}
.ico-layer > svg {
  width: 64px;
  height: 64px;
  display: block;
  filter: drop-shadow(0 2px 3px rgba(24, 24, 24, 0.16));
}

/* 文字窗 */
.words {
  position: relative;
  margin-left: ${GEO.textLeft - (GEO.padLeft + GEO.icoW)}px;
  margin-right: ${GEO.padRight}px;
  height: ${GEO.btnH}px;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  white-space: pre;
}
.ch {
  position: relative;
  display: inline-block;
  will-change: transform, opacity;
}
.ch.is-out {
  position: absolute;
  top: 50%;
  transform-origin: 50% 50%;
  pointer-events: none;
}

.sr {
  position: absolute;
  width: 1px; height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .pill-glass { transition: none; }
}
`

/* ------------------------------ 工具函数 ------------------------------ */

const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

/** 按「字形簇」拆分：emoji、组合符、拉丁连字都不会被拆碎 */
export function graphemes(str) {
  if (!str) return []
  if (segmenter) return [...segmenter.segment(str)].map((s) => s.segment)
  return Array.from(str)
}

/**
 * 最长公共子序列配对：优先保留相同字母的身份。
 * 重复字母因为按前后顺序扫描，天然是最短距离的一一配对。
 */
export function lcsPairs(a, b) {
  const m = a.length
  const n = b.length
  if (!m || !n) return []
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const pairs = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      pairs.push([i, j])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return pairs
}

const easeOut = 'cubic-bezier(0.22, 1, 0.36, 1)'

export function createInlineTextMorph(host, options = {}) {
  if (!host) throw new Error('createInlineTextMorph: 需要宿主元素')

  const uid = `itm${Math.random().toString(36).slice(2, 8)}`
  const reduceQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

  const opts = {
    brand: 'Graphical',
    height: 0,
    compact: false,
    reducedMotion: null,
    lines: ['A tool to create visual {0},', 'customize {1}, and build', 'interfaces with {2}.'],
    pills: [
      { items: ['languages', 'themes', 'systems'], kind: 'sticker', angleSet: 'languages', dx: 0 },
      {
        items: ['motion', 'components', 'colors', 'type', 'spacing', 'icons', 'effects', 'states'],
        kind: 'sticker',
        angleSet: 'custom',
        dx: [0, 0, 8, 0, 0, 0, 0, 0],
      },
      { items: ['chatgpt', 'claude', 'cursor', 'grok'], kind: 'brand', angleSet: 'models', dx: 0 },
    ],
    ...options,
  }

  const reduced = () =>
    opts.reducedMotion === null || opts.reducedMotion === undefined
      ? !!reduceQuery?.matches
      : !!opts.reducedMotion

  /* ------------------------------ 结构 ------------------------------ */

  /* 复用已存在的 shadow root：React 严格模式下挂载会跑两遍，
     第二次 attachShadow 会直接抛 NotSupportedError */
  const root = host.shadowRoot || (host.attachShadow ? host.attachShadow({ mode: 'open' }) : host)
  const style = document.createElement('style')
  style.textContent = STYLE

  const scene = document.createElement('div')
  scene.className = 'scene'
  const stage = document.createElement('div')
  stage.className = opts.compact ? 'stage is-compact' : 'stage'
  const mark = document.createElement('div')
  mark.className = 'mark'
  mark.textContent = opts.brand
  const linesEl = document.createElement('div')
  linesEl.className = 'lines'
  const sr = document.createElement('p')
  sr.className = 'sr'
  sr.setAttribute('aria-live', 'polite')
  /* 另给一份完整句子的静默文本：读屏用户不该只听到三个词 */
  const srFull = document.createElement('p')
  srFull.className = 'sr'
  srFull.setAttribute('aria-hidden', 'false')

  stage.append(mark, linesEl, srFull, sr)
  scene.append(stage)
  root.append(style, scene)

  /** 状态：每个胶囊当前指向第几项 */
  const state = { index: opts.pills.map(() => 0), nodes: [] }

  const angleFor = (def, idx) => {
    const set = ANGLES[def.angleSet] ?? ANGLES.custom
    const base = set[idx % set.length] ?? 0
    const extra = Array.isArray(def.dx) ? def.dx[idx % def.dx.length] ?? 0 : def.dx || 0
    /* dx 既表示「向右偏」也用于色卡这类需要整体右移的项，这里只做横向位移 */
    return { rotate: base, shift: def.angleSet === 'custom' && def.items[idx] === 'colors' ? 8 : extra }
  }

  const labelOf = (def, idx) => {
    const word = def.items[idx]
    return typeof word === 'string' ? word : word.word
  }

  /* ------------------------------ 构建行 ------------------------------ */

  const pillRefs = []

  function buildPill(def, defIdx) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'pill'

    const ring = document.createElement('span')
    ring.className = 'pill-ring'
    const glass = document.createElement('span')
    glass.className = 'pill-glass'
    const ico = document.createElement('span')
    ico.className = 'ico'
    ico.setAttribute('aria-hidden', 'true')
    const words = document.createElement('span')
    words.className = 'words'
    words.setAttribute('aria-hidden', 'true')

    btn.append(ring, glass, ico, words)

    const ref = { def, defIdx, btn, ico, words, layers: [], width: 0, target: 0, spring: scalar(0, 0) }
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      step(ref, 1)
    })
    btn.addEventListener('keydown', (e) => {
      const key = e.key
      if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        e.preventDefault()
        step(ref, 1)
      } else if (key === 'ArrowRight') {
        e.preventDefault()
        step(ref, 1)
      } else if (key === 'ArrowLeft') {
        e.preventDefault()
        step(ref, -1)
      } else if (key === 'Home') {
        e.preventDefault()
        jump(ref, 0)
      } else if (key === 'End') {
        e.preventDefault()
        jump(ref, def.items.length - 1)
      }
    })
    return ref
  }

  /** 把词拆成字母节点填进胶囊 */
  function fillWord(ref, word) {
    ref.words.replaceChildren()
    for (const g of graphemes(word)) {
      const span = document.createElement('span')
      span.className = 'ch'
      span.textContent = g
      ref.words.append(span)
    }
  }

  /** 放图标：一层 */
  function placeIcon(ref, idx, animate) {
    const def = ref.def
    const item = def.items[idx]
    const key = typeof item === 'string' ? item : item.icon ?? item.word
    const { rotate, shift } = angleFor(def, idx)
    const layer = document.createElement('span')
    layer.className = 'ico-layer'
    layer.innerHTML = stickerMarkup(key, `${uid}-${ref.defIdx}-${idx}`)
    layer.style.transform = `translateX(${shift}px) rotate(${rotate}deg)`
    ref.ico.append(layer)

    const old = ref.layers
    ref.layers = [layer]

    if (!animate || reduced()) {
      old.forEach((el) => el.remove())
      return
    }

    const dir = ref.lastDir || 1
    layer.animate(
      [
        { transform: `translateX(${shift}px) rotate(${rotate - 16 * dir}deg) scale(.4)`, opacity: 0 },
        {
          transform: `translateX(${shift}px) rotate(${rotate + 5 * dir}deg) scale(1.1)`,
          opacity: 1,
          offset: 0.78,
        },
        { transform: `translateX(${shift}px) rotate(${rotate}deg) scale(1)`, opacity: 1 },
      ],
      { duration: ICON_IN_MS, easing: 'linear', fill: 'none' },
    )
    old.forEach((el) => {
      const anim = el.animate(
        [
          { transform: el.style.transform || 'none', opacity: 1, offset: 0 },
          { transform: `rotate(${5 * dir}deg) scale(.4)`, opacity: 0 },
        ],
        { duration: ICON_OUT_MS, easing: easeOut, fill: 'forwards' },
      )
      anim.onfinish = () => el.remove()
    })
    /* 连续切换时把更早的退出层立刻清掉，别堆层 */
    while (ref.ico.children.length > 3) ref.ico.firstElementChild?.remove()
  }

  /**
   * 换词：FLIP。
   * 先记录旧字母的屏幕位置与正在进行的 transform，再重建 DOM 并测量新位置，
   * 保留的字母从差值滑回 0，退出的字母固定在旧位置朝最近保留字母收拢。
   */
  function morphWord(ref, nextWord) {
    const words = ref.words
    const oldNodes = [...words.querySelectorAll('.ch')]
    const nextChars = graphemes(nextWord)

    if (reduced()) {
      fillWord(ref, nextWord)
      return
    }

    const box = words.getBoundingClientRect()
    const oldBoxes = oldNodes.map((el) => {
      const r = el.getBoundingClientRect()
      return { el, x: r.left - box.left, y: r.top - box.top, w: r.width }
    })

    const oldText = oldBoxes.map((b) => b.el.textContent)
    const pairs = lcsPairs(oldText, nextChars)
    const keptByNew = new Map(pairs.map(([ai, bi]) => [bi, ai]))

    /* 先让即将退出的字母脱离文档流，避免整行抖动 */
    const leaving = new Set(pairs.map(([ai]) => ai))
    oldBoxes.forEach((b, i) => {
      if (leaving.has(i)) return
      b.el.classList.add('is-out')
      b.el.style.left = `${b.x}px`
      b.el.style.top = `${b.y}px`
      b.el.style.width = `${b.w}px`
      b.el.style.transform = 'translateY(-50%)'
    })

    /* 保留的字母按新顺序重排，新字母插在对应位置；
       退出中的字母也留在容器里（绝对定位、不占位），否则位置参考系就没了 */
    const fresh = []
    const order = []
    const leavingEls = []
    nextChars.forEach((ch, bi) => {
      const ai = keptByNew.get(bi)
      if (ai !== undefined) {
        order.push(oldBoxes[ai].el)
      } else {
        const span = document.createElement('span')
        span.className = 'ch'
        span.textContent = ch
        fresh.push({ el: span, at: bi })
        order.push(span)
      }
    })
    oldBoxes.forEach((b, i) => {
      if (!leaving.has(i)) leavingEls.push(b.el)
    })
    words.replaceChildren(...order, ...leavingEls)

    /* 量新位置 */
    const newBox = words.getBoundingClientRect()
    const newBoxes = order.map((el) => {
      const r = el.getBoundingClientRect()
      return { el, x: r.left - newBox.left, y: r.top - newBox.top }
    })

    /* 保留字母：从旧位置滑到 0 */
    order.forEach((el, bi) => {
      const ai = keptByNew.get(bi)
      if (ai === undefined) return
      const before = oldBoxes[ai]
      const now = newBoxes[bi]
      const dx = before.x - now.x
      const dy = before.y - now.y
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
        duration: 200,
        easing: EASE_TEXT,
      })
    })

    /* 新字母：从最近保留字母的位置展开 */
    fresh.forEach(({ el, at }) => {
      let anchor = null
      for (let k = at - 1; k >= 0; k--) {
        if (keptByNew.has(k)) {
          anchor = newBoxes[k]
          break
        }
      }
      if (!anchor) {
        for (let k = at + 1; k < order.length; k++) {
          if (keptByNew.has(k)) {
            anchor = newBoxes[k]
            break
          }
        }
      }
      const self = newBoxes[at]
      const dx = anchor ? anchor.x - self.x : 0
      el.animate(
        [
          { transform: `translate(${dx}px, 0) scale(.95)`, opacity: 0 },
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        ],
        { duration: 200, easing: EASE_TEXT },
      )
    })

    /* 退出字母：朝最近保留字母平移、缩小、淡出 */
    oldBoxes.forEach((b, ai) => {
      if (leaving.has(ai)) return
      const near = newBoxes[Math.min(ai, newBoxes.length - 1)]
      const dx = near ? near.x - b.x : 0
      const anim = b.el.animate(
        [
          { transform: 'translateY(-50%) translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translateY(-50%) translate(${dx}px, 0) scale(.95)`, opacity: 0 },
        ],
        { duration: 200, easing: EASE_TEXT, fill: 'forwards' },
      )
      anim.onfinish = () => b.el.remove()
    })
  }

  /** 弹簧驱动胶囊宽度 */
  function retargetWidth(ref) {
    const textW = Math.max(ref.words.scrollWidth, ref.words.getBoundingClientRect().width)
    ref.target = Math.max(GEO.btnH, textW + GEO.textLeft + GEO.padRight)
    if (reduced() || !ref.primed) {
      ref.width = ref.target
      ref.spring.p = ref.target
      ref.spring.v = 0
      ref.btn.style.width = `${ref.target}px`
      ref.primed = true
      return
    }
    ref.primed = true
    ensureSpring(ref)
  }

  const running = new Set()
  const frame = (dt) => {
    for (const ref of [...running]) {
      const done = stepSpring(ref.spring, ref.target, SPRING_WIDTH, dt)
      ref.width = ref.spring.p
      ref.btn.style.width = `${ref.width}px`
      if (done) running.delete(ref)
    }
    return running.size === 0
  }
  const ensureSpring = (ref) => {
    if (running.has(ref)) return
    running.add(ref)
    ticker.add(frame)
  }

  /* ------------------------------ 交互 ------------------------------ */

  function apply(ref, animate) {
    const def = ref.def
    const idx = state.index[ref.defIdx]
    const word = labelOf(def, idx)
    if (animate && ref.words.childElementCount) morphWord(ref, word)
    else fillWord(ref, word)
    placeIcon(ref, idx, animate)
    ref.btn.setAttribute('aria-label', `${labelOf(def, idx)}，下一项 ${labelOf(def, (idx + 1) % def.items.length)}`)
    retargetWidth(ref)
  }

  function announce() {
    const now = opts.pills.map((def, i) => labelOf(def, state.index[i])).join(' · ')
    sr.textContent = now
    const filled = opts.lines
      .map((tpl) => tpl.replace(/\{(\d+)\}/g, (_, i) => labelOf(opts.pills[i], state.index[i])))
      .join(' ')
    srFull.textContent = filled
  }

  function step(ref, dir) {
    const total = ref.def.items.length
    const next = (state.index[ref.defIdx] + dir + total) % total
    changeTo(ref, next, dir)
  }

  function jump(ref, idx) {
    const total = ref.def.items.length
    if (idx < 0 || idx >= total) return
    const dir = idx > state.index[ref.defIdx] ? 1 : -1
    changeTo(ref, idx, dir)
  }

  function changeTo(ref, next, dir) {
    if (next === state.index[ref.defIdx]) return
    ref.lastDir = dir >= 0 ? 1 : -1
    state.index[ref.defIdx] = next
    apply(ref, true)
    announce()
  }

  /* ------------------------------ 布局 ------------------------------ */

  let scale = 1
  const designH = () => (opts.compact ? 300 : DESIGN_H)
  function layout() {
    const avail = host.clientWidth || DESIGN_W
    const capH = opts.height || designH()
    /* 隐藏挂载时宽度为 0：先按设计尺寸排，显示后由 ResizeObserver 修正 */
    const s = Math.min(avail / DESIGN_W, capH / designH())
    scale = s > 0 && Number.isFinite(s) ? s : 1
    stage.style.transform = `scale(${scale})`
    scene.style.height = `${Math.round(designH() * scale)}px`
    /* 缩放后仍要让容器居中：舞台宽 1044，缩放后视觉宽 1044*s，两侧留白由此产生 */
  }

  /* ------------------------------ 启动 ------------------------------ */

  opts.lines.forEach((tpl, li) => {
    const line = document.createElement('div')
    line.className = 'line'
    line.dataset.line = String(li)
    const parts = tpl.split(/(\{\d+\})/)
    for (const part of parts) {
      const m = part.match(/^\{(\d+)\}$/)
      if (m) {
        const defIdx = Number(m[1])
        const def = opts.pills[defIdx]
        if (!def) continue
        const ref = buildPill(def, defIdx)
        pillRefs[defIdx] = ref
        line.append(ref.btn)
      } else if (part) {
        const span = document.createElement('span')
        span.className = 'txt'
        span.textContent = part
        line.append(span)
      }
    }
    linesEl.append(line)
  })

  pillRefs.forEach((ref) => {
    if (!ref) return
    apply(ref, false)
  })
  linesEl.classList.add('is-ready')

  /* 首帧之后再做一次测量：字体未就绪时 scrollWidth 会偏小 */
  requestAnimationFrame(() => {
    pillRefs.forEach((ref) => ref && retargetWidth(ref))
    announce()
  })

  const ro = new ResizeObserver(() => layout())
  ro.observe(host)
  layout()

  let fontTimer = 0
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      pillRefs.forEach((ref) => ref && retargetWidth(ref))
      layout()
    })
  }
  const onFonts = () => {
    window.clearTimeout(fontTimer)
    fontTimer = window.setTimeout(() => pillRefs.forEach((ref) => ref && retargetWidth(ref)), 60)
  }
  document.fonts?.addEventListener?.('loadingdone', onFonts)

  const onRm = () => pillRefs.forEach((ref) => ref && retargetWidth(ref))
  reduceQuery?.addEventListener?.('change', onRm)

  return {
    destroy() {
      ro.disconnect()
      reduceQuery?.removeEventListener?.('change', onRm)
      document.fonts?.removeEventListener?.('loadingdone', onFonts)
      window.clearTimeout(fontTimer)
      running.clear()
      stage.getAnimations?.({ subtree: true }).forEach((a) => a.cancel())
      if (host.shadowRoot) host.shadowRoot.replaceChildren()
    },
    setOptions(next) {
      Object.assign(opts, next)
      if (next.brand) mark.textContent = next.brand
      layout()
    },
    get state() {
      return state.index.slice()
    },
    get scale() {
      return scale
    },
  }
}
