import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Camera,
  Check,
  Link2,
  MapPin,
  Plus,
  QrCode,
  ScanLine,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import type {
  AddressValue,
  AttachmentMeta,
  BarcodeValue,
  DateValue,
  EmailValue,
  FieldDefinition,
  LinkValue,
  PersonRef,
  PhoneValue,
  SelectOption,
} from '../types'
import { useStore } from '../store'
import { openUpload } from './UploadDialog'
import { cn, sanitizeUrl } from '../lib/utils'
import { useUI } from '../ui'
import { DateField } from './inputs'
import { isRefSnapshot } from '../lib/derive'
import { channelId, channelOf, normalizeChannels } from '../lib/channels'
import { PersonPicker } from './PersonPicker'
import { ChoiceField } from './Picker'

const PROVINCES = [
  '北京市', '天津市', '上海市', '重庆市', '河北省', '山西省', '辽宁省', '吉林省', '黑龙江省', '江苏省',
  '浙江省', '安徽省', '福建省', '江西省', '山东省', '河南省', '湖北省', '湖南省', '广东省', '海南省',
  '四川省', '贵州省', '云南省', '陕西省', '甘肃省', '青海省', '台湾省', '内蒙古自治区', '广西壮族自治区',
  '西藏自治区', '宁夏回族自治区', '新疆维吾尔自治区', '香港特别行政区', '澳门特别行政区',
]

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const PHONE_RE = /^(?:\+?\d{1,3}[-\s]?)?1[3-9]\d{9}$|^\+?\d{7,15}$/

export function fieldOptions(def: FieldDefinition): SelectOption[] {
  if (def.key === 'groups' || def.key === 'tags') return []
  return def.config.options ?? []
}


/** 日期文本框：自动补 -，只允许数字与短横线 */
function maskDate(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
}

export function FieldInput({
  def,
  value,
  onChange,
  personId,
  readOnly,
  invalid,
  compact,
  id,
}: {
  def: FieldDefinition
  value: unknown
  onChange: (v: unknown) => void
  personId?: string
  readOnly?: boolean
  invalid?: boolean
  compact?: boolean
  /** 供 label 的 htmlFor 关联，点标签即可聚焦输入框 */
  id?: string
}) {
  const channels = useStore((s) => normalizeChannels(s.settings.contactChannels))
  const groups = useStore((s) => s.groups)
  const tags = useStore((s) => s.tags)
  const attachments = useStore((s) => s.attachments)
  const addAttachmentFile = useStore((s) => s.addAttachmentFile)
  const addGroup = useStore((s) => s.addGroup)
  const addTag = useStore((s) => s.addTag)
  const updateField = useStore((s) => s.updateField)
  const updatePerson = useStore((s) => s.updatePerson)
  const toast = useUI((s) => s.toast)
  const fileRef = useRef<HTMLInputElement>(null)
  const [scanOpen, setScanOpen] = useState(false)

  const options: SelectOption[] = useMemo(() => {
    if (def.key === 'groups') return groups.map((g) => ({ id: g.id, label: g.name, color: g.color }))
    if (def.key === 'tags') return tags.map((t) => ({ id: t.id, label: t.name, color: '#5B6573' }))
    return def.config.options ?? []
  }, [def, groups, tags])

  /* 输入了不存在的选项：当场新建，写回字段管理的选项集，并返回新 id 直接选中 */
  const createOption = (label: string): string => {
    const v = label.trim()
    const exist = options.find((o) => o.label.trim().toLowerCase() === v.toLowerCase())
    if (exist) return exist.id
    const palette = ['#2F6FEB', '#0E9F6E', '#B4530A', '#7C3AED', '#DB2777', '#0891B2', '#5B6573']
    let id = ''
    if (def.key === 'groups') id = addGroup(v, palette[options.length % palette.length])
    else if (def.key === 'tags') id = addTag(v)
    else {
      id = `opt_${Date.now().toString(36)}`
      updateField(def.key, { config: { ...def.config, options: [...options, { id, label: v, color: '#5B6573' }] } })
    }
    toast(`已新建「${v}」，可在字段管理里统一维护`, 'success')
    return id
  }

  switch (def.type) {
    case 'text':
      return (
        <input
          id={id}
          className={cn('input', compact && 'sm', invalid && 'invalid')}
          value={(value as string) ?? ''}
          maxLength={def.config.maxLength ?? 200}
          onChange={(e) => onChange(e.target.value)}
          placeholder={readOnly ? '' : `输入${def.label}`}
          readOnly={readOnly}
          autoComplete="off"
          spellCheck={false}
        />
      )
    case 'longtext':
      return (
        <textarea
          id={id}
          className={cn('textarea', invalid && 'invalid')}
          value={(value as string) ?? ''}
          maxLength={def.config.maxLength ?? 5000}
          onChange={(e) => onChange(e.target.value)}
          placeholder={readOnly ? '' : `记录${def.label}，支持换行与表情`}
          rows={compact ? 3 : 5}
          readOnly={readOnly}
          autoComplete="off"
          spellCheck={false}
        />
      )
    case 'number':
      return (
        <div className="row">
          <input
            id={id}
            className={cn('input', compact && 'sm')}
            type="number"
            inputMode={def.config.decimals ? 'decimal' : 'numeric'}
            step={def.config.decimals ? Math.pow(10, -def.config.decimals) : 1}
            value={value === undefined || value === null ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            readOnly={readOnly}
          />
          {def.config.unit === 'percent' && <span className="muted">%</span>}
          {def.config.unit === 'custom' && <span className="muted">{def.config.unitText}</span>}
        </div>
      )
    case 'checkbox':
      return (
        <button
          type="button"
          className={cn('check', Boolean(value) && 'on')}
          onClick={() => !readOnly && onChange(!value)}
          aria-pressed={Boolean(value)}
          aria-label={def.label}
        >
          {value ? <Check size={13} strokeWidth={3} /> : null}
        </button>
      )
    case 'select': {
      const cur = (value as string) ?? ''
      const stale = !!cur && !options.some((o) => o.id === cur)
      return (
        <div className="stack" style={{ gap: 4 }}>
          <ChoiceField
            options={options}
            value={cur}
            readOnly={readOnly}
            invalid={invalid}
            placeholder="选择"
            onCreate={createOption}
            onChange={(next) => onChange(next as string)}
          />
          {stale && <span className="field-hint danger">原选项已被删除，请重新选一个</span>}
        </div>
      )
    }
    case 'multiselect': {
      const arr = ((value as string[]) ?? []).filter(Boolean)
      return (
        <ChoiceField
          options={options}
          value={arr}
          multiple
          readOnly={readOnly}
          invalid={invalid}
          onCreate={createOption}
          onChange={(next) => onChange(next as string[])}
        />
      )
    }
    case 'date': {
      const dv = (value as DateValue) ?? { value: '', hasTime: def.config.hasTime ?? false }
      return (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <DateField
            value={dv.value?.slice(0, 10) ?? ''}
            onChange={(v) => onChange({ value: v, hasTime: dv.hasTime })}
            readOnly={readOnly}
            compact={compact}
            invalid={invalid}
          />
          {def.config.hasTime && (
            <input
              className={cn('input', compact && 'sm')}
              style={{ maxWidth: 120 }}
              type="time"
              value={dv.value?.slice(11, 16) ?? ''}
              onChange={(e) =>
                onChange({
                  value: `${dv.value?.slice(0, 10) ?? ''}T${e.target.value || '00:00'}`,
                  hasTime: true,
                })
              }
              readOnly={readOnly}
            />
          )}
        </div>
      )
    }
    case 'link': {
      const lv = (value as LinkValue) ?? { url: '', displayText: '' }
      const valid = !lv.url || !!sanitizeUrl(lv.url)
      return (
        <div className="stack" style={{ gap: 6 }}>
          <div className="row">
            <Link2 size={15} className="muted" />
            <input
              className={cn('input', compact && 'sm', !valid && 'invalid')}
              value={lv.url ?? ''}
              placeholder="https://"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange({ ...lv, url: e.target.value })}
              readOnly={readOnly}
            />
          </div>
          <input
            className={cn('input', compact && 'sm')}
            value={lv.displayText ?? ''}
            placeholder="显示文字（可选）"
            onChange={(e) => onChange({ ...lv, displayText: e.target.value })}
            readOnly={readOnly}
          />
          {!valid && <span className="field-hint" style={{ color: 'var(--danger)' }}>仅支持 http/https 链接</span>}
        </div>
      )
    }
    case 'phone': {
      const arr = (value as PhoneValue[]) ?? []
      const used = new Set(arr.map((p) => channelId(p.label, channels)))
      const free = channels.find((c) => c.visible && !used.has(c.id)) ?? channels[0]
      return (
        <div className="multi-value">
          {arr.map((p, i) => {
            const cid = channelId(p.label, channels)
            const ch = channelOf(cid, channels)
            const bad = ch?.kind === 'tel' && !!p.number && !PHONE_RE.test(p.number)
            return (
              <div className="mv-row" key={i}>
                <select
                  className="input sm label-in"
                  value={cid}
                  onChange={(e) => {
                    const next = [...arr]
                    next[i] = { ...p, label: e.target.value }
                    onChange(next)
                  }}
                  disabled={readOnly}
                >
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  className={cn('input sm', bad && 'invalid')}
                  value={p.number}
                  type={ch?.kind === 'tel' ? 'tel' : 'text'}
                  inputMode={ch?.kind === 'tel' ? 'tel' : 'text'}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={ch?.hint ?? '填写内容'}
                  onChange={(e) => {
                    const next = [...arr]
                    next[i] = { ...p, number: e.target.value }
                    onChange(next)
                  }}
                  readOnly={readOnly}
                />
                {!readOnly && (
                  <button className="btn icon sm" onClick={() => onChange(arr.filter((_, x) => x !== i))} aria-label={`删除${ch?.label ?? ''}`}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            )
          })}
          {!readOnly && (
            <button
              className="btn sm ghost"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => onChange([...arr, { label: free?.id ?? 'mobile', number: '' }])}
            >
              <Plus size={13} /> 添加联系方式
            </button>
          )}
          {arr.some((p) => {
            const ch = channelOf(channelId(p.label, channels), channels)
            return ch?.kind === 'tel' && p.number && !PHONE_RE.test(p.number)
          }) && (
            <span className="field-hint" style={{ color: 'var(--warn)' }}>
              号码格式可能不符合所选地区规则，仍可保存
            </span>
          )}
        </div>
      )
    }
    case 'email': {
      const arr = (value as EmailValue[]) ?? []
      return (
        <div className="multi-value">
          {arr.map((p, i) => (
            <div className="mv-row" key={i}>
              <select
                className="input sm label-in"
                value={p.label}
                onChange={(e) => {
                  const next = [...arr]
                  next[i] = { ...p, label: e.target.value }
                  onChange(next)
                }}
                disabled={readOnly}
              >
                {['工作', '个人', '其他'].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
              <input
                className={cn('input sm', p.address && !EMAIL_RE.test(p.address) && 'invalid')}
                value={p.address}
                type="email"
                inputMode="email"
                autoComplete="email"
                spellCheck={false}
                placeholder="name@example.com"
                onChange={(e) => {
                  const next = [...arr]
                  next[i] = { ...p, address: e.target.value }
                  onChange(next)
                }}
                readOnly={readOnly}
              />
              {!readOnly && (
                <button className="btn icon sm" onClick={() => onChange(arr.filter((_, x) => x !== i))} aria-label="删除邮箱">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...arr, { label: '工作', address: '' }])}>
              <Plus size={13} /> 添加邮箱
            </button>
          )}
        </div>
      )
    }
    case 'address': {
      const arr = (value as AddressValue[]) ?? []
      return (
        <div className="multi-value">
          {arr.map((a, i) => (
            <div key={i} className="stack" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 9, gap: 6 }}>
              <div className="row">
                <MapPin size={14} className="muted" />
                <input
                  className="input sm"
                  style={{ width: 78, flex: '0 0 auto' }}
                  value={a.label}
                  placeholder="标签"
                  onChange={(e) => {
                    const next = [...arr]
                    next[i] = { ...a, label: e.target.value }
                    onChange(next)
                  }}
                  readOnly={readOnly}
                />
                <input
                  className="input sm"
                  value={a.province ?? ''}
                  list="province-list"
                  placeholder="省"
                  onChange={(e) => {
                    const next = [...arr]
                    next[i] = { ...a, province: e.target.value }
                    onChange(next)
                  }}
                  readOnly={readOnly}
                />
                <input
                  className="input sm"
                  value={a.city ?? ''}
                  placeholder="市"
                  onChange={(e) => {
                    const next = [...arr]
                    next[i] = { ...a, city: e.target.value }
                    onChange(next)
                  }}
                  readOnly={readOnly}
                />
                {!readOnly && (
                  <button className="btn icon sm" onClick={() => onChange(arr.filter((_, x) => x !== i))} aria-label="删除地址">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <input
                className="input sm"
                value={a.detail ?? ''}
                placeholder="详细地址（必填）"
                onChange={(e) => {
                  const next = [...arr]
                  next[i] = { ...a, detail: e.target.value }
                  onChange(next)
                }}
                readOnly={readOnly}
              />
            </div>
          ))}
          <datalist id="province-list">
            {PROVINCES.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          {!readOnly && (
            <button
              className="btn sm ghost"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => onChange([...arr, { label: '公司', detail: '', province: '', city: '' }])}
            >
              <Plus size={13} /> 添加地址
            </button>
          )}
        </div>
      )
    }
    case 'barcode': {
      /* 名片码：内容由本人资料生成，表单里不需要填写 */
      if (def.config?.source === 'personCard') {
        return (
          <div className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--text-3)' }}>
            <QrCode size={14} />
            由这位联系人的姓名、公司、联系方式自动生成，扫码即可存入通讯录
          </div>
        )
      }
      const bv = (value as BarcodeValue) ?? { format: '', rawValue: '' }
      return (
        <div className="stack" style={{ gap: 6 }}>
          <div className="row">
            <input
              className="input"
              value={bv.rawValue ?? ''}
              placeholder="扫描或手动输入条码原始值"
              onChange={(e) => onChange({ ...bv, rawValue: e.target.value })}
              readOnly={readOnly}
            />
            {!readOnly && (
              <button className="btn sm" onClick={() => setScanOpen(true)}>
                <ScanLine size={14} /> 扫码
              </button>
            )}
          </div>
          {bv.rawValue && (
            <div className="row" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
              <QrCode size={13} />
              码制：{bv.format || '未识别'}
              {/^https?:\/\//.test(bv.rawValue) && (
                <a href={bv.rawValue} target="_blank" rel="noopener noreferrer">
                  打开链接
                </a>
              )}
            </div>
          )}
          {scanOpen && (
            <ScanDialog
              onClose={() => setScanOpen(false)}
              onResult={(raw, format) => {
                onChange({ rawValue: raw, format })
                setScanOpen(false)
              }}
            />
          )}
        </div>
      )
    }
    case 'attachment': {
      const metas = (value as AttachmentMeta[]) ?? []
      const isAvatar = def.key === 'avatar'
      return (
        <div className="stack">
          <div className="chip-row">
            {metas.map((m) => {
              const data = attachments[m.id]
              return (
                <div
                  key={m.id}
                  style={{
                    position: 'relative',
                    width: isAvatar ? 64 : 76,
                    borderRadius: 10,
                    overflow: 'hidden',
                    border: '1px solid var(--line)',
                    background: 'var(--surface-2)',
                  }}
                >
                  {data?.thumbnail || data?.data ? (
                    <img
                      src={data.thumbnail || data.data}
                      alt={m.name}
                      style={{ width: '100%', height: isAvatar ? 64 : 64, objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, padding: 4, textAlign: 'center' }}>
                      {m.name.slice(0, 24)}
                    </div>
                  )}
                  {!readOnly && (
                    <button
                      className="btn icon sm"
                      style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,.55)', color: '#fff', width: 20, height: 20 }}
                      onClick={() => onChange(metas.filter((x) => x.id !== m.id))}
                      aria-label="移除附件"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              )
            })}
            {!readOnly && (
              <button
                className="btn sm"
                onClick={async () => {
                  const files = await openUpload({
                    title: isAvatar ? '上传头像' : '上传附件',
                    meta: isAvatar ? 'JPG / PNG / WebP，建议正方形' : '图片会自动压缩至长边 ≤2048px',
                    accept: def.config.acceptedMimeTypes ?? 'image/*',
                    multiple: def.config.multiple !== false,
                  })
                  if (!files?.length) return
                  const added = []
                  for (const f of files) added.push(await addAttachmentFile(f))
                  const limit = def.config.multiple === false ? 1 : 99
                  onChange([...(def.config.multiple === false ? [] : metas), ...added].slice(0, limit))
                }}
                disabled={readOnly}
              >
                {isAvatar ? <Camera size={14} /> : <Upload size={14} />}
                {isAvatar ? '上传头像' : '添加附件'}
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept={def.config.acceptedMimeTypes ?? undefined}
            multiple={def.config.multiple !== false}
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (!files.length) return
              const added = []
              for (const f of files) added.push(await addAttachmentFile(f))
              const limit = def.config.multiple === false ? 1 : 99
              onChange([...(def.config.multiple === false ? [] : metas), ...added].slice(0, limit))
            }}
          />
          <span className="field-hint">图片自动压缩至长边 ≤2048px，单文件 ≤20MB</span>
        </div>
      )
    }
    case 'personRef': {
      const multiple = def.config.multiple !== false
      return (
        <PersonPicker
          multiple={multiple}
          value={value as PersonRef | PersonRef[]}
          onChange={onChange}
          readOnly={readOnly}
          excludeId={personId}
        />
      )
    }
    default:
      return <span className="muted">该字段类型在详情页内展示</span>
  }
}

/* 摄像头扫码 */
function ScanDialog({ onClose, onResult }: { onClose: () => void; onResult: (raw: string, format: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [torch, setTorch] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  React.useEffect(() => {
    let cancelled = false
    let raf = 0
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        const AnyWin = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string; format: string }[]> } }
        if (AnyWin.BarcodeDetector) {
          const detector = new AnyWin.BarcodeDetector({
            formats: ['qr_code', 'ean_13', 'code_128', 'pdf417', 'ean_8', 'code_39'],
          })
          const tick = async () => {
            if (cancelled || !videoRef.current) return
            try {
              const codes = await detector.detect(videoRef.current)
              if (codes.length > 0) {
                onResult(codes[0].rawValue, codes[0].format.toUpperCase())
                return
              }
            } catch {
              /* ignore */
            }
            raf = requestAnimationFrame(tick)
          }
          raf = requestAnimationFrame(tick)
        } else {
          setError('当前浏览器不支持 BarcodeDetector，请手动输入条码原始值')
        }
      } catch {
        setError('无法访问摄像头，请检查浏览器权限或手动输入')
      }
    }
    void start()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [onResult])

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] })
      setTorch(!torch)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>扫描条码</h2>
          <button className="btn icon sm" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ background: '#000', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
            <video ref={videoRef} style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }} muted playsInline />
            <div
              style={{
                position: 'absolute',
                inset: '20% 12%',
                border: '2px solid rgba(255,255,255,.7)',
                borderRadius: 12,
                pointerEvents: 'none',
              }}
            />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn sm" onClick={toggleTorch}>
              {torch ? '关闭手电筒' : '打开手电筒'}
            </button>
            <span className="field-hint">将条码置于取景框内</span>
          </div>
          {error && <p className="field-hint" style={{ color: 'var(--warn)', marginTop: 8 }}>{error}</p>}
          <div className="divider" />
          <div className="field">
            <span className="field-label">手动输入</span>
            <div className="row">
              <input className="input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="条码原始值" />
              <button className="btn primary" onClick={() => manual && onResult(manual, 'MANUAL')}>
                确定
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function attachmentUrl(attachments: Record<string, { data?: string }>, id?: string): string | undefined {
  if (!id) return undefined
  return attachments[id]?.data
}

export const refName = (p: PersonRef): string => (isRefSnapshot(p) ? p.snapshotName : '')
