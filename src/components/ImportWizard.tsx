import React, { useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, FileUp, Upload, X } from 'lucide-react'
import type { FieldDefinition } from '../types'
import { useStore } from '../store'
import { useUI } from '../ui'
import { Modal } from './ui'
import { cn, nowISO, uid } from '../lib/utils'
import { guessFieldKey, newPersonFromValues, parseCSV, parseImportValue, parseVCards } from '../lib/io'
import { personName } from '../lib/derive'

type Step = 1 | 2 | 3 | 4

interface ParsedSource {
  kind: 'csv' | 'vcard'
  headers: string[]
  rows: string[][]
  fileName: string
}

export function ImportWizard() {
  const open = useUI((s) => s.importOpen)
  const close = () => useUI.setState({ importOpen: false })
  const fieldDefinitions = useStore((s) => s.fieldDefinitions)
  const bulkAddPersons = useStore((s) => s.bulkAddPersons)
  const addField = useStore((s) => s.addField)
  const toast = useUI((s) => s.toast)
  const store = useStore()

  const [step, setStep] = useState<Step>(1)
  const [source, setSource] = useState<ParsedSource | null>(null)
  const [mapping, setMapping] = useState<Record<number, string>>({})
  const [createLabels, setCreateLabels] = useState<Record<number, string>>({})
  const [mode, setMode] = useState<'skip' | 'overwrite' | 'new'>('skip')
  const [result, setResult] = useState<{ added: number; skipped: number; overwritten: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setStep(1)
    setSource(null)
    setMapping({})
    setCreateLabels({})
    setMode('skip')
    setResult(null)
    setLoading(false)
  }

  const handleFile = async (file: File) => {
    setLoading(true)
    try {
      const text = await file.text()
      const lower = file.name.toLowerCase()
      if (lower.endsWith('.vcf') || text.includes('BEGIN:VCARD')) {
        const cards = parseVCards(text)
        if (cards.length === 0) throw new Error('未解析到 vCard 记录')
        const headers = ['姓名', '电话', '邮箱', '公司', '地址', '备注']
        const rows = cards.map((c) => [
          c.fn ?? '',
          c.tels.join(';'),
          c.emails.join(';'),
          c.org ?? '',
          c.adr ?? '',
          c.note ?? '',
        ])
        const parsed: ParsedSource = { kind: 'vcard', headers, rows, fileName: file.name }
        setSource(parsed)
        setMapping(autoMapping(headers, fieldDefinitions))
        setStep(2)
      } else {
        const rows = parseCSV(text)
        if (rows.length < 2) throw new Error('CSV 至少需要表头与一行数据')
        const headers = rows[0].map((h, i) => h.trim() || `列${i + 1}`)
        const parsed: ParsedSource = { kind: 'csv', headers, rows: rows.slice(1), fileName: file.name }
        setSource(parsed)
        setMapping(autoMapping(headers, fieldDefinitions))
        setStep(2)
      }
      if (file.size > 10 * 1024 * 1024) toast('文件超过 10MB，建议拆分后导入', 'warn')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const previewRows = useMemo(() => source?.rows.slice(0, 20) ?? [], [source])

  const runImport = () => {
    if (!source) return
    if (source.rows.length > 2000) {
      toast('单次上限 2000 条，请分批导入', 'error')
      return
    }
    // 创建新字段
    const createdKeys: Record<number, string> = {}
    for (const [idxStr, target] of Object.entries(mapping)) {
      if (target !== 'create') continue
      const idx = Number(idxStr)
      const label = createLabels[idx] || source.headers[idx]
      const key = `custom_${uid('f')}`
      const def: Omit<FieldDefinition, 'createdAt' | 'updatedAt'> = {
        key,
        label,
        type: 'text',
        required: false,
        visible: true,
        sortOrder: 100 + Object.keys(createdKeys).length,
        isBuiltIn: false,
        isLocked: false,
        group: 'custom',
        config: { maxLength: 200 },
      }
      addField(def)
      createdKeys[idx] = key
    }
    const defs = useStore.getState().fieldDefinitions
    const persons = source.rows.map((row) => {
      const values: Record<string, unknown> = {}
      source.headers.forEach((_, idx) => {
        const target = mapping[idx]
        if (!target || target === 'ignore') return
        const key = target === 'create' ? createdKeys[idx] : target
        if (!key) return
        const def = defs.find((d) => d.key === key)
        const parsed = parseImportValue(row[idx] ?? '', def)
        if (parsed !== '' && parsed !== undefined) values[key] = parsed
      })
      const p = newPersonFromValues(values)
      return p
    }).filter((p) => String(p.fields.name ?? '').trim() !== '')

    // 引用字段：导入表里的「引荐人/关联人」多为姓名文本，按姓名解析成 person id
    const nameMap = new Map<string, string>()
    for (const p of useStore.getState().persons) {
      const n = String(p.fields.name ?? '').trim()
      if (n) nameMap.set(n, p.id)
    }
    for (const p of persons) {
      const n = String(p.fields.name ?? '').trim()
      if (n) nameMap.set(n, p.id)
    }
    for (const p of persons) {
      for (const def of defs) {
        if (def.type !== 'personRef') continue
        const raw = p.fields[def.key]
        if (typeof raw !== 'string' || !raw.trim()) continue
        const multiple = def.config?.multiple === true
        const ids = raw
          .split(/[;；,，、|/]/)
          .map((s) => s.trim())
          .map((n) => nameMap.get(n))
          .filter((id): id is string => !!id && id !== p.id)
        if (ids.length === 0) {
          delete p.fields[def.key]
          continue
        }
        p.fields[def.key] = multiple ? ids : ids[0]
      }
    }

    const res = bulkAddPersons(persons, mode)
    setResult(res)
    setStep(4)
    toast(`导入完成：新增 ${res.added} 条`, 'success')
  }

  const duplicateCount = useMemo(() => {
    if (!source) return 0
    const nameIdx = Object.entries(mapping).find(([, v]) => v === 'name')?.[0]
    if (!nameIdx) return 0
    const seen = new Map<string, number>()
    for (const row of source.rows) {
      const k = (row[Number(nameIdx)] ?? '').trim()
      if (!k) continue
      seen.set(k, (seen.get(k) ?? 0) + 1)
    }
    return [...seen.values()].filter((n) => n > 1).reduce((a, b) => a + b - 1, 0)
  }, [source, mapping])

  return (
    <Modal
      open={open}
      onClose={() => {
        close()
        reset()
      }}
      wide
      title="导入人脉"
      footer={
        step === 1 ? (
          <button
            className="btn"
            onClick={() => {
              close()
              reset()
            }}
          >
            取消
          </button>
        ) : step === 2 ? (
          <>
            <button className="btn ghost left" onClick={() => setStep(1)}>
              上一步
            </button>
            <button className="btn primary" onClick={() => setStep(3)}>
              下一步：冲突处理
            </button>
          </>
        ) : step === 3 ? (
          <>
            <button className="btn ghost left" onClick={() => setStep(2)}>
              上一步
            </button>
            <button className="btn primary" onClick={runImport}>
              开始导入 {source?.rows.length ?? 0} 条
            </button>
          </>
        ) : (
          <button
            className="btn primary"
            onClick={() => {
              close()
              reset()
            }}
          >
            完成
          </button>
        )
      }
    >
      <div className="wizard-steps">
        {['上传文件', '字段映射', '冲突处理', '完成'].map((label, i) => (
          <React.Fragment key={label}>
            <div className={cn('wiz-step', step === i + 1 && 'active', step > i + 1 && 'done')}>
              <span className="num">{step > i + 1 ? <CheckCircle2 size={12} /> : i + 1}</span>
              {label}
            </div>
            {i < 3 && <span className="wiz-line" />}
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <div className="stack" style={{ gap: 14 }}>
          <div
            className={cn('drop-zone', dragging && 'over')}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const file = e.dataTransfer.files?.[0]
              if (file) void handleFile(file)
            }}
          >
            <FileUp size={28} className="muted" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>{loading ? '解析中…' : '点击选择或拖拽文件到此处'}</div>
            <div className="field-hint" style={{ marginTop: 4 }}>
              支持 CSV、vCard(.vcf)、存知 JSON 快照 / .czdb 数据包
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".csv,.vcf,.json,.czdb,text/csv,text/vcard,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void handleFile(f)
            }}
          />
          <div className="set-card">
            <div className="set-card-body">
              <div className="field-hint">
                • 单次上限 2000 条，文件 ≤10MB；超过 5000 条请分批处理。
                <br />• vCard 中的照片在当前版本不导入，导入结果会注明。
                <br />• 存知数据包（.czdb / JSON）请到「设置 → 数据包管理」做完整恢复或合并导入。
              </div>
              <button
                className="btn sm"
                onClick={() => {
                  const sample = [
                    ['姓名', '手机', '公司', '城市', '标签', '生日'],
                    ['林小满', '13900001111', '云栖科技', '杭州', '产品;校友', '1993-04-18'],
                    ['周予安', '13700002222', '一方资本', '上海', '投资', '1986-09-02'],
                  ]
                  const text = sample.map((r) => r.join(',')).join('\n')
                  const blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = '存知_导入模板.csv'
                  a.click()
                }}
              >
                下载 CSV 模板
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && source && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="row between">
            <span className="field-hint">
              {source.fileName} · {source.rows.length} 条记录 · 已自动匹配字段，可逐列调整
            </span>
            <span className="chip sm">预览前 20 行</span>
          </div>
          <div className="map-grid">
            {source.headers.map((h, idx) => (
              <React.Fragment key={idx}>
                <div className="chip" title={h}>
                  {h}
                </div>
                <ArrowRight size={13} className="arrow" />
                <div className="row" style={{ gap: 6 }}>
                  <select
                    className="input sm"
                    value={mapping[idx] ?? 'ignore'}
                    onChange={(e) => setMapping((m) => ({ ...m, [idx]: e.target.value }))}
                  >
                    <option value="ignore">忽略此列</option>
                    {fieldDefinitions
                      .filter((d) => d.type !== 'timeline')
                      .map((d) => (
                        <option key={d.key} value={d.key}>
                          {d.label}
                        </option>
                      ))}
                    <option value="memo">关系备忘</option>
                    <option value="create">＋ 创建为新自定义字段</option>
                  </select>
                  {mapping[idx] === 'create' && (
                    <input
                      className="input sm"
                      style={{ width: 120 }}
                      placeholder="字段名"
                      value={createLabels[idx] ?? ''}
                      onChange={(e) => setCreateLabels((c) => ({ ...c, [idx]: e.target.value }))}
                    />
                  )}
                </div>
              </React.Fragment>
            ))}
          </div>
          <div className="table-scroll">
            <table className="preview-table">
              <thead>
                <tr>
                  {source.headers.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i}>
                    {source.headers.map((_, j) => (
                      <td key={j} title={row[j]}>
                        {row[j] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 3 && source && (
        <div className="stack" style={{ gap: 14 }}>
          <div className="set-card">
            <div className="set-card-body">
              <div className="row between">
                <div>
                  <div className="lbl" style={{ fontWeight: 600, fontSize: 13 }}>按「姓名 + 电话」检测重复</div>
                  <div className="field-hint">预计 {duplicateCount} 条与现有或导入数据重复</div>
                </div>
                <span className="chip accent">{source.rows.length} 条待导入</span>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {[
                  { v: 'skip', t: '跳过重复项', d: '保留现有记录不变' },
                  { v: 'overwrite', t: '覆盖现有记录', d: '用导入值更新已有字段' },
                  { v: 'new', t: '全部作为新记录', d: '可能产生重复联系人，稍后可在数据健康中合并' },
                ].map((o) => (
                  <label key={o.v} className="row" style={{ gap: 8, cursor: 'pointer', alignItems: 'flex-start' }}>
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === o.v}
                      onChange={() => setMode(o.v as typeof mode)}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{o.t}</span>
                      <span className="field-hint" style={{ display: 'block' }}>{o.d}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          {duplicateCount > 0 && (
            <div className="banner" style={{ borderRadius: 10, border: '1px solid #f0dfc7' }}>
              <AlertTriangle size={14} /> 检测到姓名重复：{duplicateCount} 条。合并重复联系人可在「设置 → 数据健康」中批量处理。
            </div>
          )}
        </div>
      )}

      {step === 4 && result && (
        <div className="stack" style={{ gap: 12, alignItems: 'center', padding: '12px 0' }}>
          <div style={{ color: 'var(--ok)' }}>
            <CheckCircle2 size={38} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 650 }}>导入完成</div>
          <div className="row" style={{ gap: 12 }}>
            <span className="chip accent">新增 {result.added}</span>
            <span className="chip">覆盖 {result.overwritten}</span>
            <span className="chip">跳过 {result.skipped}</span>
          </div>
          <p className="field-hint" style={{ textAlign: 'center', maxWidth: 380 }}>
            导入的人脉会出现在「最近添加」视图中。建议接下来补全缺失字段，或为活动来源统一打标签。
          </p>
          {store.persons.length > 0 && (
            <button
              className="btn"
              onClick={() => {
                close()
                reset()
                useUI.getState().navigate('people')
              }}
            >
              <Upload size={14} /> 去看看
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}

function autoMapping(headers: string[], defs: FieldDefinition[]): Record<number, string> {
  const out: Record<number, string> = {}
  headers.forEach((h, i) => {
    const guess = guessFieldKey(h, defs)
    out[i] = guess ?? 'ignore'
  })
  return out
}
