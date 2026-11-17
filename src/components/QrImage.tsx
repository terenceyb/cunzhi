import React, { useMemo } from 'react'
import qrcode from 'qrcode-generator'

/* 真二维码：把字段里的原始值（网址 / 号码 / 文本）编码成可扫的图形。
   用 qrcode-generator（MIT，Kazuhiko Arase）生成模块矩阵，再画成 SVG ——
   不引 canvas、不产生位图资源，深浅模式下都能保持锐利。 */
export function QrImage({
  value,
  size = 64,
  quiet = 2,
  className,
  title,
}: {
  value: string
  size?: number
  /** 静区（留白模块数），扫码识别率靠它 */
  quiet?: number
  className?: string
  title?: string
}) {
  const model = useMemo(() => {
    const text = String(value ?? '').trim()
    if (!text) return null
    // 中文等多字节内容走 UTF-8 模式，避免被当成单字节乱码
    const qr = qrcode(0, 'M')
    qr.addData(text, 'Byte')
    qr.make()
    return { count: qr.getModuleCount(), cell: (x: number, y: number) => qr.isDark(y, x) }
  }, [value])

  if (!model) return null
  const total = model.count + quiet * 2
  const k = 100 / total
  const dots: React.ReactNode[] = []
  for (let y = 0; y < model.count; y++) {
    for (let x = 0; x < model.count; x++) {
      if (!model.cell(x, y)) continue
      // 相邻模块略微重叠 0.02，缩放时不留发丝缝
      dots.push(
        <rect
          key={`${x}-${y}`}
          x={(x + quiet) * k}
          y={(y + quiet) * k}
          width={k + 0.02}
          height={k + 0.02}
          rx={k * 0.18}
        />,
      )
    }
  }

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={title ?? '二维码'}
      shapeRendering="crispEdges"
    >
      <rect width="100" height="100" rx="2" fill="#fff" />
      <g fill="#111417">{dots}</g>
    </svg>
  )
}
