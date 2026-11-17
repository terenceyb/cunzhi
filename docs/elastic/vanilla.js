/* Vanilla 入口：直接拿引擎用，没有任何框架 */
import { createElasticPanelResize } from '../../src/components/elastic/ElasticPanelResizeEngine.js'

const host = document.querySelector('#host')
const panel = document.querySelector('#host .panel')
const engine = createElasticPanelResize({ host, panel, rightGap: 17 })

/* 需要时更新，不必重挂载 */
export const setHeight = (px) => {
  host.style.height = `${px}px`
  engine.refresh()
}

/* 页面销毁时务必调用，否则 rAF / 计时器 / 观察者不会停 */
export const destroy = () => engine.destroy()
