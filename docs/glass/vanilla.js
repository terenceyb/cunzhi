/* Vanilla 入口：没有框架，直接拿引擎 */
import { createGlassTabMenu } from '../../src/components/glass/GlassTabMenuEngine.js'

const host = document.querySelector('#glass-host')
const engine = createGlassTabMenu({
  container: host,
  height: 480,
  align: 'center',
  fit: 'min',
  onAction: (action) => console.log('action', action),
})

/* 更新高度 / 减少动态效果都不会重挂载 */
export const setHeight = (px) => {
  host.style.height = `${px}px`
  engine.refresh()
}
export const setReduced = (v) => engine.setOptions({ reducedMotion: v })

/* 卸载务必调用：否则 RAF、ResizeObserver、document 监听会留着 */
export const destroy = () => engine.destroy()

/* 也可以不听 onAction，直接监听事件 */
host.addEventListener('glass-tab-action', (e) => console.log('event', e.detail.action))
