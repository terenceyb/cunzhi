/**
 * icons.js —— 内嵌灰阶立体 SVG 图标
 *
 * 全部图形由内嵌 SVG 生成，不依赖图片、字体图标库或远程资源。
 * 每个 viewBox 都是 0 0 64 64，aria-hidden。
 * 每个图标的五个渐变 ID 都带实例前缀，同页多实例不会互相覆盖。
 *
 * 渐变约定：
 *   paper        银灰面（左上→右下）；calendar / folder 换成垂直渐变
 *   dark         深灰部件（上→右下）
 *   black        镜头那样的近黑圆
 *   rim          顶边白色描边，向下淡出（只给需要高光的边，不是整圈）
 *   transmission 局部透影：后层部件透过浅色前层留下的灰影
 */

/** 标签栏图标用更亮的银灰，菜单图标压深一档 */
const PAPER_BUTTON = ['0|#ededf0', '0.45|#dadade', '1|#cbccd1']
const PAPER_MENU = ['0|#e3e3e6', '0.45|#d4d4d8', '1|#c7c7cd']
/** calendar 前层银面：垂直渐变，从深到浅再收一点，才有金属感 */
const PAPER_CALENDAR = ['0|#949496', '0.2|#b2b2b5', '0.6|#dad9dc', '1|#d9d8dc']
/** folder 前层同理 */
const PAPER_FOLDER = ['0|#929396', '0.25|#a3a3a6', '0.65|#cecdd2', '1|#d4d3d8']

/** 互动记录的两个气泡：后层深灰在右上，前层银面在左下 */
/** 互动记录的气泡：x 4..58 / y 10..48，左下再补一个三角尾巴到 58 */
const BUBBLE = 'M16 10h30a10 10 0 0 1 10 10v16a10 10 0 0 1-10 10H28l-12 10V46h0a10 10 0 0 1-10-10V20a10 10 0 0 1 10-10Z'
/** 设置齿轮：八枚平顶齿绕中心 (32,32) 均分，齿根藏在银面圆盘下 */
const GEAR_TEETH = [0, 45, 90, 135, 180, 225, 270, 315]
  .map((a) => `<rect x="26" y="1" width="12" height="9" rx="2.5" transform="rotate(${a} 32 32)"/>`)
  .join('')

const PATHS = {
  calendar:
    '<g transform="translate(-1 -1)"><rect x="5" y="9" width="53" height="48" rx="11" fill="{dark}"/><path d="M19 7v9m25-9v9" stroke="#626365" stroke-width="5" stroke-linecap="round"/><rect x="5" y="23" width="53" height="38" rx="9" fill="{paper}"/><path d="M7 31v-1a7 7 0 0 1 7-7h35a7 7 0 0 1 7 7" fill="none" stroke="white" stroke-opacity=".85" stroke-width="1.4"/><path d="m19 42 6-4v16m10-16h14L40 54" fill="none" stroke="#242526" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/></g>',
  notes:
    '<g transform="translate(-3 0)"><rect x="24" y="7" width="37" height="43" rx="12" fill="{dark}"/><rect x="8" y="20" width="37" height="42" rx="10" fill="{paper}"/><rect x="8" y="20" width="37" height="42" rx="10" fill="{transmission}" stroke="{rim}" stroke-width="1.4"/><path d="M17 34h18M17 46h11" stroke="#303134" stroke-width="4.5" stroke-linecap="round"/></g>',
  people:
    '<g transform="translate(-2 1)"><circle cx="44" cy="20" r="10" fill="{dark}"/><path d="M27 58v-4a18 18 0 0 1 36 0v4Z" fill="{dark}"/><circle cx="25" cy="24" r="10" fill="{paper}" stroke="#fff" stroke-width="1.2"/><path d="M7 58v-4a18 18 0 0 1 36 0v4Z" fill="{paper}"/><path d="M7 58v-4a18 18 0 0 1 36 0v4Z" fill="{transmission}" opacity=".65"/></g>',
  folder:
    '<g transform="translate(2 1)"><path d="M6 23v-8a7 7 0 0 1 7-7h15l7 8h16a7 7 0 0 1 7 7v25H6Z" fill="{dark}"/><rect x="6" y="24" width="52" height="35" rx="9" fill="{paper}"/><path d="M7 34v-2a8 8 0 0 1 8-8h34a8 8 0 0 1 8 8" fill="none" stroke="white" stroke-opacity=".8" stroke-width="1.5"/></g>',
  /** 首页：深灰屋顶压住银面墙体，屋檐出挑两格，门是近黑 */
  home:
    '<path d="M32 5 6 29h52Z" fill="{dark}" stroke="{rim}" stroke-width="1.4"/><path d="M10 27h44v23a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8Z" fill="{paper}"/><path d="M10 27h44v6H10Z" fill="{transmission}" opacity=".55"/><path d="M26 58V47a6 6 0 0 1 12 0v11Z" fill="{black}"/>',
  /** 互动记录：深灰气泡里嵌三条银面消息条，左下三角尾巴 */
  interactions: `<g transform="translate(32 32) scale(1.06) translate(-32 -32)"><path d="${BUBBLE}" fill="{dark}"/><path d="M16 10h30a10 10 0 0 1 10 10v4H6v-4a10 10 0 0 1 10-10Z" fill="{rim}" opacity=".45"/><rect x="14" y="20" width="34" height="6" rx="3" fill="{paper}"/><rect x="14" y="30" width="24" height="6" rx="3" fill="{paper}"/><rect x="14" y="40" width="14" height="6" rx="3" fill="{paper}"/></g>`,
  /** 设置：八枚平顶粗齿朝外，银面圆盘压住齿根，中心近黑轴 */
  settings: `<g transform="translate(32 32) scale(.86) translate(-32 -32)"><g fill="{dark}">${GEAR_TEETH}</g><circle cx="32" cy="32" r="24" fill="{dark}"/><circle cx="32" cy="32" r="17" fill="{paper}"/><circle cx="32" cy="32" r="17" fill="{transmission}" opacity=".45"/><circle cx="32" cy="32" r="17" fill="none" stroke="{rim}" stroke-width="1.6"/><circle cx="32" cy="32" r="8" fill="{black}"/></g>`,
  note: '<rect x="5" y="9" width="42" height="49" rx="10" fill="{paper}" stroke="{rim}" stroke-width="1.2"/><path d="M15 25h17M15 36h10" stroke="#4c4d50" stroke-width="4.5" stroke-linecap="round"/><path d="m39 39 15-16" stroke="{dark}" stroke-width="11" stroke-linecap="round"/><path d="M33 49Q32 49 33 46L35 38 43 44 35 49Q34 50 33 49Z" fill="#26272a"/>',
  checklist:
    '<rect x="7" y="6" width="50" height="53" rx="12" fill="{paper}" stroke="{rim}" stroke-width="1.3"/><path d="m17 21 5 5 10-10M41 21h8m-8 22h8" stroke="#444548" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23" cy="44" r="7" fill="none" stroke="#292a2c" stroke-width="5"/>',
  photo:
    '<path d="M6 27Q6 18 15 18H21Q24 18 25 14L26 11Q27 9 30 9H37Q40 9 41 12L43 16Q44 18 47 18H51Q60 18 60 27V49Q60 58 51 58H15Q6 58 6 49Z" fill="{paper}"/><path d="M7 30V27Q7 19 15 19H21Q25 19 26 14L27 12Q28 10 30 10H37Q39 10 40 13L42 17Q44 19 47 19H51Q59 19 59 27" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="33" cy="37" r="10" fill="{black}"/><circle cx="49" cy="25" r="2.5" fill="#4b4c4e"/>',
  scan: '<rect x="19" y="16" width="26" height="36" rx="10" fill="{paper}" stroke="{rim}"/><path d="M20 7h-3a10 10 0 0 0-10 10v3m37-13h3a10 10 0 0 1 10 10v3M7 44v3a10 10 0 0 0 10 10h3m37-13v3a10 10 0 0 1-10 10h-3" fill="none" stroke="{dark}" stroke-width="5.5" stroke-linecap="round"/>',
  voice:
    '<rect x="22" y="5" width="20" height="36" rx="10" fill="{paper}" stroke="{rim}" stroke-width="1.4"/><path d="M29 18h6m-6 10h6" stroke="#4b4c4f" stroke-width="5" stroke-linecap="round"/><path d="M12 29v3a20 18 0 0 0 40 0v-3M32 50v8m-10 0h20" fill="none" stroke="{dark}" stroke-width="5" stroke-linecap="round"/>',
  sketch:
    '<rect x="5" y="10" width="54" height="44" rx="13" fill="{paper}"/><path d="M7 27v-4a11 11 0 0 1 11-11h29a11 11 0 0 1 10 8" fill="none" stroke="{rim}" stroke-width="1.5"/><path d="M16 42C22 40 26 21 31 22C38 23 26 40 32 42C36 44 42 32 49 29" fill="none" stroke="#242527" stroke-width="5.6" stroke-linecap="round" stroke-linejoin="round"/>',
}

export const ICON_KEYS = Object.keys(PATHS)

/** 标签栏用；菜单用同一套图形，只是银面暗一档 */
const BUTTON_KEYS = new Set(['home', 'people', 'interactions', 'settings', 'calendar', 'notes', 'folder'])

const stops = (list) =>
  list
    .map((s) => {
      const [o, c] = s.split('|')
      return `<stop offset="${o}" stop-color="${c}"/>`
    })
    .join('')

function paperStops(key) {
  if (key === 'calendar') return PAPER_CALENDAR
  if (key === 'folder') return PAPER_FOLDER
  return BUTTON_KEYS.has(key) ? PAPER_BUTTON : PAPER_MENU
}

/**
 * 生成一个图标。
 * @param {string} key  home | people | interactions | settings | calendar | notes | folder |
 *                      note | checklist | photo | scan | voice | sketch
 * @param {string} uid 实例唯一前缀
 */
export function iconSvg(key, uid) {
  const body = PATHS[key]
  if (!body) return ''

  const id = (name) => `gts${uid}${key}${name}`
  /** calendar / folder 的银面是垂直渐变，其余是左上→右下 */
  const vertical = key === 'calendar' || key === 'folder'

  const defs = [
    `<linearGradient id="${id('paper')}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="1">${stops(paperStops(key))}</linearGradient>`,
    `<linearGradient id="${id('dark')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5d5e60"/><stop offset="1" stop-color="#1d1e20"/></linearGradient>`,
    `<radialGradient id="${id('black')}" cx="0.3" cy="0.25" r="0.8"><stop offset="0" stop-color="#505153"/><stop offset="1" stop-color="#050506"/></radialGradient>`,
    `<linearGradient id="${id('rim')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="0.48" stop-color="#fff" stop-opacity="0.3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
    `<radialGradient id="${id('transmission')}" cx="0.9" cy="0.35" r="0.95"><stop offset="0" stop-color="#242426" stop-opacity="0.58"/><stop offset="0.45" stop-color="#242426" stop-opacity="0.3"/><stop offset="1" stop-color="#242426" stop-opacity="0"/></radialGradient>`,
  ].join('')

  const filled = body
    .replace(/\{paper\}/g, `url(#${id('paper')})`)
    .replace(/\{dark\}/g, `url(#${id('dark')})`)
    .replace(/\{black\}/g, `url(#${id('black')})`)
    .replace(/\{rim\}/g, `url(#${id('rim')})`)
    .replace(/\{transmission\}/g, `url(#${id('transmission')})`)

  return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>${defs}</defs>${filled}</svg>`
}

/** 加号：两条 42×6 的圆端黑条，中心重合，整体向左光学校正 1px */
export function plusSvg() {
  return `<svg viewBox="0 0 44 44" aria-hidden="true" focusable="false"><g transform="translate(-1 0)"><rect x="1" y="19" width="42" height="6" rx="3" fill="currentColor"/><rect x="19" y="1" width="6" height="42" rx="3" fill="currentColor"/></g></svg>`
}
