import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, ChevronRight, Info, Maximize2, Minus, Plus, Users } from 'lucide-react'
import type { Person } from '../types'
import type { DeriveCtx } from '../lib/derive'
import { buildPersonMeta, personName } from '../lib/derive'
import { useStore } from '../store'
import { useUI } from '../ui'
import { Avatar, Empty, Segmented } from '../components/ui'
import {
  ME_ID,
  buildGraph,
  buildReferralTree,
  commonConnections,
  detectCycles,
  overviewPositions,
  shortestPath,
  type GraphData,
  type GraphEdge,
  type GraphNode,
  type ReferralNode,
} from '../lib/graph'
import { cn, dayDiff, relativeTime } from '../lib/utils'

export function NetworkView({ rows, ctx }: { rows: Person[]; ctx: DeriveCtx }) {
  const mode = useUI((s) => s.networkMode)
  const setMode = useUI((s) => s.setNetworkMode)
  return (
    <div className="network-panel">
      <div className="network-toolbar">
        <Segmented
          value={mode}
          onChange={(v) => setMode(v)}
          ariaLabel="关系网模式"
          options={[
            { value: 'overview', label: '全览' },
            { value: 'referral', label: '引荐树' },
            { value: 'between', label: '两人之间' },
          ]}
        />
        <span className="field-hint" style={{ marginLeft: 4 }}>
          {mode === 'overview'
            ? '点击节点查看其关联线 · 关系只读，修改请到详情页字段'
            : mode === 'referral'
              ? '按「引荐人」字段构建的有向树'
              : '基于「关联人」字段计算最短路径'}
        </span>
      </div>
      {mode === 'overview' && <Overview rows={rows} ctx={ctx} />}
      {mode === 'referral' && <Referral rows={rows} ctx={ctx} />}
      {mode === 'between' && <Between rows={rows} ctx={ctx} />}
    </div>
  )
}

function useGraph(rows: Person[], ctx: DeriveCtx): GraphData {
  const meName = useStore((s) => s.settings.profile.nickname)
  return useMemo(() => {
    const colors = new Map(ctx.groups.map((g) => [g.id, g.color]))
    return buildGraph({
      persons: rows,
      meName,
      groupColor: (p) => colors.get(String(p.fields.groups)) ?? '#5B6573',
      lastInteraction: (id) => buildPersonMeta(ctx.persons.find((p) => p.id === id)!, ctx).lastInteractionAt,
    })
  }, [rows, ctx, meName])
}

function Overview({ rows, ctx }: { rows: Person[]; ctx: DeriveCtx }) {
  const full = useGraph(rows, ctx)
  const overLimit = rows.length > 200
  const data = useMemo(() => {
    if (!overLimit) return full
    const keep = new Set(
      [...rows]
        .sort((a, b) => {
          const la = buildPersonMeta(a, ctx).lastInteractionAt ?? ''
          const lb = buildPersonMeta(b, ctx).lastInteractionAt ?? ''
          return lb.localeCompare(la)
        })
        .slice(0, 200)
        .map((p) => p.id),
    )
    const nodes = full.nodes.filter((n) => n.isMe || keep.has(n.id))
    const edges = full.edges.filter((e) => keep.has(e.source) && keep.has(e.target))
    const edgeMap = new Map<string, GraphEdge[]>()
    for (const e of edges) {
      for (const id of [e.source, e.target]) {
        if (!edgeMap.has(id)) edgeMap.set(id, [])
        edgeMap.get(id)!.push(e)
      }
    }
    return { nodes, edges, edgeMap }
  }, [full, rows, ctx, overLimit])

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  if (isMobile && data.nodes.length > 80) {
    return (
      <div className="network-list">
        <div className="banner info" style={{ borderRadius: 10, marginBottom: 10, border: '1px solid #cfdefa' }}>
          <Info size={14} /> 当前 {data.nodes.length - 1} 个节点超出手机渲染上限（80），已降级为列表视图。建议先应用筛选。
        </div>
        {rows.slice(0, 60).map((p) => {
          const meta = buildPersonMeta(p, ctx)
          const deg = data.edgeMap.get(p.id)?.length ?? 0
          return (
            <button
              key={p.id}
              className="picker-item"
              onClick={() => useUI.getState().openPerson(p.id)}
              style={{ borderBottom: '1px solid var(--line)', borderRadius: 0 }}
            >
              <Avatar name={meta.name} src={meta.avatar?.thumbnail} size={28} color={meta.groupColor} />
              <div className="grow">
                <div style={{ fontSize: 13 }}>{meta.name}</div>
                <div className="sub">关联 {deg} 人 · {relativeTime(meta.lastInteractionAt)}</div>
              </div>
            </button>
          )
        })}
      </div>
    )
  }
  if (isMobile) return <OverviewSvg data={data} ctx={ctx} />
  return <OverviewCanvas data={data} ctx={ctx} overLimit={overLimit} total={rows.length} />
}

function OverviewCanvas({ data, ctx, overLimit, total }: { data: GraphData; ctx: DeriveCtx; overLimit: boolean; total: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const view = useRef({ scale: 1, panX: 0, panY: 0, dragging: false, moved: false, lastX: 0, lastY: 0 })
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ node: GraphNode; x: number; y: number } | null>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const me = useStore((s) => s.settings.profile)

  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return
    const { scale, panX, panY } = view.current
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx2d.clearRect(0, 0, size.w, size.h)
    ctx2d.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * panX, dpr * panY)

    // 连线：仅选中节点的关系边
    if (selected) {
      for (const e of data.edgeMap.get(selected) ?? []) {
        const a = data.nodes.find((n) => n.id === e.source)
        const b = data.nodes.find((n) => n.id === e.target)
        if (!a || !b) continue
        const isRef = e.kind === 'referral'
        ctx2d.strokeStyle = isRef ? 'rgba(180,83,10,0.72)' : 'rgba(47,111,235,0.6)'
        ctx2d.lineWidth = 1.6 / scale
        ctx2d.beginPath()
        ctx2d.moveTo(a.x, a.y)
        ctx2d.lineTo(b.x, b.y)
        ctx2d.stroke()
        if (isRef) drawArrow(ctx2d, a, b, scale)
      }
    }
    // 中心到第一圈层的淡线
    const meNode = data.nodes.find((n) => n.isMe)
    if (meNode) {
      ctx2d.strokeStyle = 'rgba(150,160,175,0.22)'
      ctx2d.lineWidth = 1 / scale
      for (const n of data.nodes) {
        if (n.isMe) continue
        ctx2d.beginPath()
        ctx2d.moveTo(meNode.x, meNode.y)
        ctx2d.lineTo(n.x, n.y)
        ctx2d.stroke()
      }
    }

    for (const n of data.nodes) {
      const isSel = n.id === selected
      ctx2d.globalAlpha = n.opacity
      ctx2d.beginPath()
      ctx2d.arc(n.x, n.y, n.r, 0, Math.PI * 2)
      ctx2d.fillStyle = n.isMe ? '#131619' : n.color
      ctx2d.fill()
      if (isSel) {
        ctx2d.strokeStyle = '#2F6FEB'
        ctx2d.lineWidth = 3 / scale
        ctx2d.stroke()
      } else {
        ctx2d.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx2d.lineWidth = 2 / scale
        ctx2d.stroke()
      }
      ctx2d.globalAlpha = 1
      ctx2d.fillStyle = n.isMe ? '#131619' : '#3d4653'
      ctx2d.font = `${n.isMe ? 600 : 500} ${12 / scale}px -apple-system, "PingFang SC", sans-serif`
      ctx2d.textAlign = 'center'
      ctx2d.fillText(n.name.length > 8 ? `${n.name.slice(0, 7)}…` : n.name, n.x, n.y + n.r + 13 / scale)
    }
  }

  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!stage || !canvas) return
    const resize = () => {
      const rect = stage.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      setSize({ w: rect.width, h: rect.height })
      overviewPositions(data, rect.width, rect.height)
      draw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(stage)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  useEffect(() => {
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, size])

  const hitTest = (clientX: number, clientY: number): GraphNode | null => {
    const stage = stageRef.current
    if (!stage) return null
    const rect = stage.getBoundingClientRect()
    const { scale, panX, panY } = view.current
    const x = (clientX - rect.left - panX) / scale
    const y = (clientY - rect.top - panY) / scale
    for (const n of data.nodes) {
      if (Math.hypot(n.x - x, n.y - y) <= n.r + 4) return n
    }
    return null
  }

  return (
    <div className="network-stage" ref={stageRef}>
      <canvas
        ref={canvasRef}
        onWheel={(e) => {
          e.preventDefault()
          const next = Math.min(2, Math.max(0.6, view.current.scale - e.deltaY * 0.0012))
          view.current.scale = next
          draw()
        }}
        onPointerDown={(e) => {
          const node = hitTest(e.clientX, e.clientY)
          view.current.dragging = true
          view.current.moved = false
          view.current.lastX = e.clientX
          view.current.lastY = e.clientY
          if (node && !node.isMe) {
            setSelected(node.id)
            const stage = stageRef.current!
            const rect = stage.getBoundingClientRect()
            setPreview({
              node,
              x: Math.min(rect.width - 260, Math.max(12, (node.x * view.current.scale + view.current.panX))),
              y: Math.min(rect.height - 190, Math.max(12, node.y * view.current.scale + view.current.panY + 30)),
            })
          } else if (!node) {
            setSelected(null)
            setPreview(null)
          }
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!view.current.dragging) {
            const hit = hitTest(e.clientX, e.clientY)
            ;(e.target as HTMLElement).style.cursor = hit ? 'pointer' : 'grab'
            return
          }
          const dx = e.clientX - view.current.lastX
          const dy = e.clientY - view.current.lastY
          if (Math.abs(dx) + Math.abs(dy) > 2) view.current.moved = true
          view.current.panX += dx
          view.current.panY += dy
          view.current.lastX = e.clientX
          view.current.lastY = e.clientY
          draw()
        }}
        onPointerUp={() => {
          view.current.dragging = false
        }}
      />

      <div className="network-tip">
        节点 • {data.nodes.length - 1} · 关系边 {data.edges.length}
        {overLimit && ` · 已限制为最近互动 200 人（共 ${total}）`}
      </div>

      <div className="network-legend">
        <div className="row between" style={{ fontWeight: 600, color: 'var(--text)' }}>
          <span>图例</span>
          <span className="field-hint">90 天内有互动为实心</span>
        </div>
        {ctx.groups.map((g) => (
          <div key={g.id} className="legend-row">
            <span className="legend-dot" style={{ background: g.color }} />
            {g.name}
          </div>
        ))}
        <div className="legend-row" style={{ marginTop: 2, borderTop: '1px solid var(--line)', paddingTop: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#131619' }} /> 我
        </div>
        <div className="field-hint">节点大小 = 关联人数</div>
      </div>

      {preview && (
        <div className="node-preview" style={{ left: preview.x, top: preview.y }}>
          <div className="np-head">
            <Avatar name={preview.node.name} size={32} color={preview.node.color} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }} className="ellipsis">
                {preview.node.name}
              </div>
              <div className="field-hint">
                关联 {preview.node.degree} 人 · 上次互动 {relativeTime(preview.node.lastInteractionAt)}
              </div>
            </div>
          </div>
          <div className="np-actions">
            <button className="btn sm" onClick={() => useUI.getState().openPerson(preview.node.id)}>
              查看详情
            </button>
            <button
              className="btn sm primary"
              onClick={() => {
                useUI.setState({ quickNoteOpen: true })
                useUI.getState().toast('已打开速记，可关联到该联系人', 'info')
              }}
            >
              记录互动
            </button>
          </div>
        </div>
      )}

      <div style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', gap: 6 }}>
        <button
          className="btn sm"
          onClick={() => {
            view.current.scale = Math.min(2, view.current.scale + 0.15)
            draw()
          }}
          aria-label="放大"
        >
          <Plus size={13} />
        </button>
        <button
          className="btn sm"
          onClick={() => {
            view.current.scale = Math.max(0.6, view.current.scale - 0.15)
            draw()
          }}
          aria-label="缩小"
        >
          <Minus size={13} />
        </button>
        <button
          className="btn sm"
          onClick={() => {
            view.current = { ...view.current, scale: 1, panX: 0, panY: 0 }
            overviewPositions(data, size.w, size.h)
            draw()
          }}
          aria-label="重置视图"
        >
          <Maximize2 size={13} />
        </button>
      </div>
    </div>
  )
}

function drawArrow(ctx: CanvasRenderingContext2D, a: GraphNode, b: GraphNode, scale: number) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  const dist = Math.hypot(b.x - a.x, b.y - a.y)
  const r = b.r + 6
  const x = a.x + Math.cos(angle) * (dist - r)
  const y = a.y + Math.sin(angle) * (dist - r)
  const size = 7 / scale
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - Math.cos(angle - 0.4) * size, y - Math.sin(angle - 0.4) * size)
  ctx.lineTo(x - Math.cos(angle + 0.4) * size, y - Math.sin(angle + 0.4) * size)
  ctx.closePath()
  ctx.fillStyle = 'rgba(180,83,10,0.8)'
  ctx.fill()
}

function OverviewSvg({ data, ctx }: { data: GraphData; ctx: DeriveCtx }) {
  const [selected, setSelected] = useState<string | null>(null)
  const W = 360
  const H = 420
  const nodes = useMemo(() => {
    const copy: GraphData = { ...data, nodes: data.nodes.map((n) => ({ ...n })) }
    overviewPositions(copy, W, H)
    return copy.nodes
  }, [data])
  const sel = nodes.find((n) => n.id === selected)

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: '62vh', display: 'block' }} role="img" aria-label="关系网全览">
        <rect width={W} height={H} fill="transparent" />
        {nodes
          .filter((n) => !n.isMe)
          .map((n) => {
            const me = nodes.find((x) => x.isMe)!
            return <line key={`l-${n.id}`} x1={me.x} y1={me.y} x2={n.x} y2={n.y} stroke="rgba(150,160,175,0.3)" strokeWidth={0.8} />
          })}
        {sel &&
          (data.edgeMap.get(sel.id) ?? []).map((e) => {
            const a = nodes.find((n) => n.id === e.source)
            const b = nodes.find((n) => n.id === e.target)
            if (!a || !b) return null
            return (
              <line
                key={e.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={e.kind === 'referral' ? '#B4530A' : '#2F6FEB'}
                strokeWidth={1.4}
                opacity={0.75}
              />
            )
          })}
        {nodes.map((n) => (
          <g key={n.id} onClick={() => !n.isMe && setSelected(n.id === selected ? null : n.id)}>
            <circle cx={n.x} cy={n.y} r={n.r * 0.8} fill={n.isMe ? '#131619' : n.color} opacity={n.opacity} stroke="#fff" strokeWidth={1.6} />
            <text x={n.x} y={n.y + n.r * 0.8 + 11} textAnchor="middle" fontSize={9} fill="#3d4653">
              {n.name.slice(0, 5)}
            </text>
          </g>
        ))}
      </svg>
      {sel ? (
        <div className="node-preview" style={{ position: 'static', width: '100%', marginTop: 10 }}>
          <div className="np-head">
            <Avatar name={sel.name} size={30} color={sel.color} />
            <div className="grow">
              <div style={{ fontSize: 13, fontWeight: 600 }}>{sel.name}</div>
              <div className="field-hint">
                关联 {sel.degree} 人 · {relativeTime(sel.lastInteractionAt)}
              </div>
            </div>
          </div>
          <div className="np-actions">
            <button className="btn sm" onClick={() => useUI.getState().openPerson(sel.id)}>
              查看详情
            </button>
            <button className="btn sm" onClick={() => setSelected(null)}>
              收起
            </button>
          </div>
        </div>
      ) : (
        <p className="field-hint" style={{ textAlign: 'center', marginTop: 8 }}>
          点击节点查看其关联线 · 手机端为只读简化视图
        </p>
      )}
    </div>
  )
}

function Referral({ rows, ctx }: { rows: Person[]; ctx: DeriveCtx }) {
  const meName = useStore((s) => s.settings.profile.nickname)
  const tree = useMemo(() => buildReferralTree(rows, meName), [rows, meName])
  const cycles = useMemo(() => detectCycles(rows), [rows])
  return (
    <div className="referral-tree">
      {cycles.size > 0 && (
        <div className="banner" style={{ borderRadius: 10, marginBottom: 10, border: '1px solid #f0dfc7' }}>
          <Info size={14} /> 检测到引荐环（{cycles.size} 人互为引荐），已标注但不会自动修正，请到对应人脉详情页调整引荐人字段。
        </div>
      )}
      <div className="tree-row" style={{ cursor: 'default' }}>
        <Avatar name={meName || '我'} size={30} color="#131619" />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 650 }}>{meName || '我'}</div>
          <div className="field-hint">直接认识 {tree.children.length} 人 · 网络共 {tree.count} 人</div>
        </div>
      </div>
      {tree.children.length === 0 ? (
        <Empty icon={<Users size={20} />} title="还没有引荐关系" desc="在任意人脉详情页填写「引荐人」字段，这里会自动生成引荐树。" />
      ) : (
        tree.children.map((child) => <TreeNode key={child.id} node={child} ctx={ctx} depth={0} cycles={cycles} />)
      )}
      <p className="field-hint" style={{ marginTop: 12 }}>
        引荐人为空的人脉归入「直接认识」分组。点击节点可下钻查看其带来的下一层。
      </p>
    </div>
  )
}

function TreeNode({
  node,
  ctx,
  depth,
  cycles,
}: {
  node: ReferralNode
  ctx: DeriveCtx
  depth: number
  cycles: Set<string>
}) {
  const [open, setOpen] = useState(depth < 2)
  const meta = buildPersonMeta(ctx.persons.find((p) => p.id === node.id)!, ctx)
  return (
    <div className="tree-node">
      <div
        className={cn('tree-row', (node.cycle || cycles.has(node.id)) && 'cycle')}
        onClick={() => useUI.getState().openPerson(node.id)}
      >
        <button
          className="tree-toggle"
          onClick={(e) => {
            e.stopPropagation()
            setOpen((v) => !v)
          }}
          aria-label={open ? '折叠' : '展开'}
          disabled={node.children.length === 0}
        >
          {node.children.length > 0 ? open ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span style={{ width: 14 }} />}
        </button>
        <Avatar name={meta.name} src={meta.avatar?.thumbnail} size={24} color={meta.groupColor} />
        <span style={{ fontSize: 13 }}>{meta.name}</span>
        {node.children.length > 0 && <span className="tree-count">带来 {node.count} 人</span>}
        {(node.cycle || cycles.has(node.id)) && <span className="chip sm" style={{ color: 'var(--warn)' }}>引荐环</span>}
        <span className="field-hint tree-company" style={{ marginLeft: 'auto' }}>
          {String(meta.person.fields.company ?? '')}
        </span>
      </div>
      {open &&
        node.children.map((c) => <TreeNode key={c.id} node={c} ctx={ctx} depth={depth + 1} cycles={cycles} />)}
    </div>
  )
}

function Between({ rows, ctx }: { rows: Person[]; ctx: DeriveCtx }) {
  const [from, setFrom] = useState<string>(ME_ID)
  const [to, setTo] = useState<string>('')
  const data = useGraph(rows, ctx)
  const meName = useStore((s) => s.settings.profile.nickname)
  const nameOf = (id: string) => (id === ME_ID ? meName || '我' : personName(ctx.persons.find((p) => p.id === id)))
  const nodeOf = (id: string) => data.nodes.find((n) => n.id === id)

  const result = useMemo(() => {
    if (!to || from === to) return null
    const path = shortestPath(data, from, to, 4)
    const common = commonConnections(data, from, to)
    return { path, common }
  }, [data, from, to])

  const weakTies = useMemo(() => {
    const a = ctx.persons.find((p) => p.id === from)
    const b = ctx.persons.find((p) => p.id === to)
    if (!a || !b) return { groups: [], tags: [] }
    const ga = [String(a.fields.groups ?? '')]
    const gb = [String(b.fields.groups ?? '')]
    const ta = (a.fields.tags as string[]) ?? []
    const tb = (b.fields.tags as string[]) ?? []
    return {
      groups: ctx.groups.filter((g) => ga.includes(g.id) && gb.includes(g.id)).map((g) => g.name),
      tags: ta.filter((t) => tb.includes(t)).map((t) => ctx.tags.find((x) => x.id === t)?.name ?? t),
    }
  }, [from, to, ctx])

  const options = [{ id: ME_ID, name: meName || '我' }, ...rows.map((p) => ({ id: p.id, name: personName(p) }))]

  return (
    <div className="between-panel">
      <div className="between-selectors">
        <div className="field grow">
          <span className="field-label">从</span>
          <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ paddingTop: 20 }} className="muted">
          <ArrowRight size={16} />
        </div>
        <div className="field grow">
          <span className="field-label">到</span>
          <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">选择一个人…</option>
            {options
              .filter((o) => o.id !== from)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {!to ? (
        <Empty icon={<Users size={20} />} title="选择两个人" desc="系统会基于「关联人」字段计算最短路径与共同认识的人。" />
      ) : result && result.path ? (
        <div className="between-result">
          <div className="row between">
            <strong style={{ fontSize: 14 }}>找到一条关联路径（{result.path.length - 1} 跳）</strong>
            <span className="chip accent">你们共同认识 {result.common.length} 人</span>
          </div>
          <div className="path-graph">
            {result.path.map((id, i) => {
              const n = nodeOf(id)
              return (
                <React.Fragment key={id}>
                  {i > 0 && <span className="path-link" />}
                  <button className="path-node" onClick={() => id !== ME_ID && useUI.getState().openPerson(id)}>
                    <Avatar name={nameOf(id)} size={38} color={n?.color ?? '#131619'} />
                    <span className="nm">{nameOf(id)}</span>
                  </button>
                </React.Fragment>
              )
            })}
          </div>
          {result.common.length > 0 && (
            <>
              <div className="divider" />
              <div className="field-label">共同关联人</div>
              <div className="chip-row" style={{ marginTop: 6 }}>
                {result.common.map((id) => (
                  <button key={id} className="chip" onClick={() => useUI.getState().openPerson(id)}>
                    <Avatar name={nameOf(id)} size={18} />
                    {nameOf(id)}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="field-hint" style={{ marginTop: 12 }}>
            路径深度上限 4 跳。超过 4 跳视为「暂无已知关联」，避免给出没有实际意义的六度分隔结论。
          </p>
        </div>
      ) : (
        <div className="between-result">
          <div className="row" style={{ gap: 8 }}>
            <Info size={15} className="muted" />
            <strong style={{ fontSize: 14 }}>暂无已知关联</strong>
          </div>
          <p className="field-hint" style={{ marginTop: 6 }}>
            {result && result.common.length > 0
              ? `但在关系网中有 ${result.common.length} 个共同关联人。`
              : '两人之间没有 4 跳以内的关联路径，以下是弱关联参考：'}
          </p>
          <div className="chip-row" style={{ marginTop: 10 }}>
            {weakTies.groups.map((g) => (
              <span key={g} className="chip">共同群组：{g}</span>
            ))}
            {weakTies.tags.map((t) => (
              <span key={t} className="chip">共同标签：{t}</span>
            ))}
            {weakTies.groups.length + weakTies.tags.length === 0 && <span className="field-hint">没有共同群组或标签</span>}
          </div>
          {result && result.common.length > 0 && (
            <>
              <div className="divider" />
              <div className="chip-row">
                {result.common.map((id) => (
                  <button key={id} className="chip" onClick={() => useUI.getState().openPerson(id)}>
                    {nameOf(id)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
