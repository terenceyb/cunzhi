import type { Person, PersonRef } from '../types'
import { isRefSnapshot } from './derive'
import { dayDiff } from './utils'

export interface GraphNode {
  id: string
  name: string
  color: string
  x: number
  y: number
  r: number
  opacity: number
  isMe: boolean
  group?: string
  lastInteractionAt: string | null
  degree: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  kind: 'related' | 'referral'
  directed: boolean
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  edgeMap: Map<string, GraphEdge[]>
}

const refId = (v: PersonRef): string => (isRefSnapshot(v) ? v.refId : v)

export interface GraphInput {
  persons: Person[]
  meName: string
  groupColor: (person: Person) => string
  lastInteraction: (personId: string) => string | null
}

export const ME_ID = '__me__'

export function buildGraph({ persons, meName, groupColor, lastInteraction }: GraphInput): GraphData {
  const visible = new Set(persons.map((p) => p.id))
  const nodes: GraphNode[] = [
    {
      id: ME_ID,
      name: meName || '我',
      color: '#111827',
      x: 0,
      y: 0,
      r: 26,
      opacity: 1,
      isMe: true,
      lastInteractionAt: null,
      degree: persons.length,
    },
  ]
  for (const p of persons) {
    const last = lastInteraction(p.id)
    const days = last ? dayDiff(last) : 9999
    const opacity = days <= 90 ? 1 : 0.55
    const name = String(p.fields.name ?? '未命名')
    nodes.push({
      id: p.id,
      name,
      color: groupColor(p),
      x: 0,
      y: 0,
      r: 16,
      opacity,
      isMe: false,
      group: p.fields.groups as string,
      lastInteractionAt: last,
      degree: 0,
    })
  }

  const edges: GraphEdge[] = []
  const seenRelated = new Set<string>()
  for (const p of persons) {
    const related = (p.fields.relatedPersons as PersonRef[]) ?? []
    for (const ref of related) {
      const id = refId(ref)
      if (!visible.has(id) || id === p.id) continue
      const key = [p.id, id].sort().join('|')
      if (seenRelated.has(key)) continue
      seenRelated.add(key)
      edges.push({ id: `r_${key}`, source: p.id, target: id, kind: 'related', directed: false })
    }
    const referrer = p.fields.referrer as PersonRef | undefined
    const refTo = referrer ? refId(referrer) : ''
    if (refTo && visible.has(refTo) && refTo !== p.id) {
      edges.push({ id: `f_${refTo}_${p.id}`, source: refTo, target: p.id, kind: 'referral', directed: true })
    } else {
      // 无有效引荐人 = 我直接认识的人，「我」与其之间有一条隐式边
      edges.push({ id: `f_${ME_ID}_${p.id}`, source: ME_ID, target: p.id, kind: 'referral', directed: true })
    }
  }

  const edgeMap = new Map<string, GraphEdge[]>()
  for (const e of edges) {
    for (const id of [e.source, e.target]) {
      if (!edgeMap.has(id)) edgeMap.set(id, [])
      edgeMap.get(id)!.push(e)
    }
  }
  for (const n of nodes) {
    n.degree = edgeMap.get(n.id)?.length ?? 0
    n.r = n.isMe ? 26 : Math.min(24, 14 + Math.min(6, n.degree) * 1.4)
  }
  return { nodes, edges, edgeMap }
}

/** 全览：仅「我」+ 第一圈层节点，不画节点间连线 */
export function overviewPositions(data: GraphData, width: number, height: number): void {
  const cx = width / 2
  const cy = height / 2
  const outer = data.nodes.filter((n) => !n.isMe)
  const radius = Math.max(120, Math.min(width, height) / 2 - 70)
  outer.forEach((n, i) => {
    const angle = (i / Math.max(1, outer.length)) * Math.PI * 2 - Math.PI / 2
    n.x = cx + Math.cos(angle) * radius
    n.y = cy + Math.sin(angle) * radius
  })
  const me = data.nodes.find((n) => n.isMe)
  if (me) {
    me.x = cx
    me.y = cy
  }
}

/** 轻量力导向：仅初次排布，位置不持久化 */
export function forceLayout(data: GraphData, width: number, height: number, iterations = 160): void {
  const cx = width / 2
  const cy = height / 2
  const nodes = data.nodes
  const n = nodes.length
  if (n === 0) return
  nodes.forEach((node, i) => {
    if (node.isMe) {
      node.x = cx
      node.y = cy
      return
    }
    const angle = (i / n) * Math.PI * 2
    const rad = Math.min(width, height) * 0.34
    node.x = cx + Math.cos(angle) * rad
    node.y = cy + Math.sin(angle) * rad
  })
  const adj = new Map<string, { other: GraphNode; edge: GraphEdge }[]>()
  for (const e of data.edges) {
    const s = nodes.find((x) => x.id === e.source)
    const t = nodes.find((x) => x.id === e.target)
    if (!s || !t) continue
    if (!adj.has(s.id)) adj.set(s.id, [])
    if (!adj.has(t.id)) adj.set(t.id, [])
    adj.get(s.id)!.push({ other: t, edge: e })
    adj.get(t.id)!.push({ other: s, edge: e })
  }
  const ideal = Math.max(90, Math.min(150, 900 / Math.sqrt(n)))
  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations
    // 斥力
    for (let i = 0; i < n; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]
        let dx = a.x - b.x
        let dy = a.y - b.y
        let dist = Math.hypot(dx, dy)
        if (dist < 0.01) {
          dx = Math.random() - 0.5
          dy = Math.random() - 0.5
          dist = 1
        }
        const repulsion = (ideal * ideal) / dist
        const fx = (dx / dist) * repulsion * 0.06 * alpha
        const fy = (dy / dist) * repulsion * 0.06 * alpha
        if (!a.isMe) {
          a.x += fx
          a.y += fy
        }
        if (!b.isMe) {
          b.x -= fx
          b.y -= fy
        }
      }
    }
    // 弹簧
    for (const [id, list] of adj) {
      const a = nodes.find((x) => x.id === id)
      if (!a) continue
      for (const { other } of list) {
        const dx = other.x - a.x
        const dy = other.y - a.y
        const dist = Math.max(1, Math.hypot(dx, dy))
        const force = (dist - ideal) * 0.035 * alpha
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        if (!a.isMe) {
          a.x += fx
          a.y += fy
        }
        if (!other.isMe) {
          other.x -= fx
          other.y -= fy
        }
      }
    }
    // 向心 + 边界
    for (const node of nodes) {
      if (node.isMe) continue
      node.x += (cx - node.x) * 0.012 * alpha
      node.y += (cy - node.y) * 0.012 * alpha
      node.x = Math.max(40, Math.min(width - 40, node.x))
      node.y = Math.max(40, Math.min(height - 40, node.y))
    }
  }
}

export function neighborsOf(data: GraphData, id: string): Set<string> {
  const out = new Set<string>()
  for (const e of data.edgeMap.get(id) ?? []) {
    out.add(e.source === id ? e.target : e.source)
  }
  return out
}

/** BFS 最短关联路径（无向），深度上限 4 跳 */
export function shortestPath(data: GraphData, fromId: string, toId: string, maxDepth = 4): string[] | null {
  if (fromId === toId) return [fromId]
  const adj = new Map<string, string[]>()
  for (const e of data.edges) {
    if (!adj.has(e.source)) adj.set(e.source, [])
    if (!adj.has(e.target)) adj.set(e.target, [])
    adj.get(e.source)!.push(e.target)
    adj.get(e.target)!.push(e.source)
  }
  const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }]
  const visited = new Set<string>([fromId])
  while (queue.length) {
    const cur = queue.shift()!
    if (cur.path.length - 1 >= maxDepth) continue
    for (const next of adj.get(cur.id) ?? []) {
      if (visited.has(next)) continue
      const path = [...cur.path, next]
      if (next === toId) return path
      visited.add(next)
      queue.push({ id: next, path })
    }
  }
  return null
}

export function commonConnections(data: GraphData, aId: string, bId: string): string[] {
  const a = neighborsOf(data, aId)
  const b = neighborsOf(data, bId)
  return [...a].filter((id) => b.has(id) && id !== aId && id !== bId)
}

export interface ReferralNode {
  id: string
  name: string
  person?: Person
  children: ReferralNode[]
  count: number
  cycle?: boolean
}

export function buildReferralTree(persons: Person[], meName: string): ReferralNode {
  const byId = new Map(persons.map((p) => [p.id, p]))
  const childMap = new Map<string, Person[]>()
  const direct: Person[] = []
  for (const p of persons) {
    const ref = p.fields.referrer as PersonRef | undefined
    const id = ref ? refId(ref) : ''
    if (!id || !byId.has(id)) {
      direct.push(p)
      continue
    }
    if (!childMap.has(id)) childMap.set(id, [])
    childMap.get(id)!.push(p)
  }
  const seen = new Set<string>()
  const build = (person: Person, depth: number): ReferralNode => {
    const cycle = seen.has(person.id) || depth > 6
    if (!cycle) seen.add(person.id)
    const children = cycle ? [] : (childMap.get(person.id) ?? []).map((c) => build(c, depth + 1))
    return {
      id: person.id,
      name: String(person.fields.name ?? '未命名'),
      person,
      children,
      count: children.reduce((acc, c) => acc + 1 + c.count, 0),
      cycle,
    }
  }
  const roots = direct.map((p) => build(p, 0))
  const total = roots.reduce((acc, r) => acc + 1 + r.count, 0)
  return {
    id: ME_ID,
    name: meName || '我',
    children: roots,
    count: total,
  }
}

export function detectCycles(persons: Person[]): Set<string> {
  const byId = new Map(persons.map((p) => [p.id, p]))
  const out = new Set<string>()
  for (const p of persons) {
    const seen = new Set<string>()
    let cur: Person | undefined = p
    while (cur) {
      const ref = cur.fields.referrer as PersonRef | undefined
      const id = ref ? refId(ref) : ''
      if (!id || !byId.has(id)) break
      if (seen.has(id)) {
        out.add(id)
        break
      }
      seen.add(id)
      cur = byId.get(id)
    }
  }
  return out
}
