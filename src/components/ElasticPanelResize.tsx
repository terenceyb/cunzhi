import React, { useEffect, useRef } from 'react'
import { createElasticPanelResize } from './elastic/ElasticPanelResizeEngine'

/**
 * ElasticPanelResize（React 入口）
 * ---------------------------------------------------------------------------
 * 一个 1000×1000 基准的浅灰场景 + 右侧空面板，只演示「弹性面板缩放」这一个交互：
 * 靠近左边缘出现胶囊把手，拖动时整条曲线向移动方向弯、并偏到同一侧，
 * 越过边界最多 15px 橡皮筋并拉成长而直的细线，松手回弹，移开 450ms 后收细隐藏。
 *
 * 真实的物理与 DOM 全在同目录的 ElasticPanelResizeEngine.js 里，
 * 本文件只负责「挂载 / 卸载 / 更新 props」，不做任何视觉或动画实现。
 */

const SCENE_CSS = `
.epr-scene{position:relative;width:100%;height:520px;border-radius:6px;background:#efefef;overflow:hidden;
  isolation:isolate;touch-action:pan-y;contain:paint}
.epr-scene::before{content:'';position:absolute;inset:0;pointer-events:none;opacity:.65;
  mix-blend-mode:soft-light;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size:160px 160px}
.epr-scene-panel{position:absolute;top:17px;right:17px;bottom:17px;background:#fbfbfb;
  border:1px solid #d4d4d4;border-radius:40px;
  box-shadow:0 2px 4px #0000000a, inset 0 0 0 1px #ffffffb3;box-sizing:border-box}
`

export interface ElasticPanelResizeProps {
  /** 场景高度（px），默认 520；改它不会重挂载 */
  height?: number
  /** 覆盖系统「减少动态效果」偏好；不传则跟随系统 */
  reducedMotion?: boolean
  className?: string
  style?: React.CSSProperties
}

export function ElasticPanelResize({ height = 520, reducedMotion, className, style }: ElasticPanelResizeProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const panel = panelRef.current
    if (!host || !panel) return
    /* 只在挂载后碰 DOM，卸载时清掉 rAF、计时器、观察者与指针捕获 */
    const engine = createElasticPanelResize({
      host,
      panel,
      minRatio: 0.276,
      maxRatio: 0.5,
      initialRatio: 0.3865,
      rightGap: 17,
      reducedMotion,
      ariaLabel: '调整面板宽度',
    })
    return () => engine.destroy()
  }, [reducedMotion])

  return (
    <div
      ref={hostRef}
      className={className ? `epr-scene ${className}` : 'epr-scene'}
      style={{ height, ...style }}
    >
      <style>{SCENE_CSS}</style>
      <div ref={panelRef} className="epr-scene-panel" />
    </div>
  )
}

export default ElasticPanelResize
