import React, { useEffect, useRef } from 'react'
import { createInlineTextMorph, type MorphHandle, type MorphOptions } from './InlineTextMorphEngine'

export type InlineTextMorphProps = MorphOptions & {
  className?: string
  style?: React.CSSProperties
  /** 页面可读的三项播报语言，默认中文 */
  lang?: string
}

/**
 * 三行句子里嵌三个可点的浅灰胶囊，点一下换词换贴纸。
 * React 只负责挂载与更新，交互与动画全在框架无关的引擎里，
 * 所以 Vue / Svelte / 原生页面拿到 createInlineTextMorph 也能直接用。
 */
export function InlineTextMorph({ className, style, lang = 'zh-CN', ...options }: InlineTextMorphProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const engine = useRef<MorphHandle | null>(null)
  const sig = JSON.stringify(options)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    engine.current = createInlineTextMorph(host, options)
    return () => {
      engine.current?.destroy()
      engine.current = null
    }
    // 只在挂载时创建实例，后续参数变化走 setOptions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    engine.current?.setOptions(JSON.parse(sig) as MorphOptions)
  }, [sig])

  return <div ref={hostRef} className={className} style={style} lang={lang} data-inline-text-morph="" />
}

export default InlineTextMorph
