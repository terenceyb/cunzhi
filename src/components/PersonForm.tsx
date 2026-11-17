import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import type { AttachmentMeta, DateValue, FieldDefinition, Person, PhoneValue } from '../types'
import { useStore } from '../store'
import { useUI } from '../ui'
import { Modal } from './ui'
import { EMAIL_RE, FieldInput } from './FieldInput'
import { cn, dateIssue } from '../lib/utils'
import { replayShake } from '../lib/motion'
import { FieldIcon, iconNameForField } from './FieldIcon'

const groupLabel: Record<string, string> = {
  basic: '基础信息',
  contact: '联系方式',
  custom: '自定义字段',
}

export function PersonForm({
  open,
  onClose,
  person,
}: {
  open: boolean
  onClose: () => void
  person?: Person | null
}) {
  const fieldDefinitions = useStore((s) => s.fieldDefinitions)
  const createPerson = useStore((s) => s.createPerson)
  const updatePerson = useStore((s) => s.updatePerson)
  const patchPerson = useStore((s) => s.patchPerson)
  const attachments = useStore((s) => s.attachments)
  const toast = useUI((s) => s.toast)
  const openPerson = useUI((s) => s.openPerson)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [memo, setMemo] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [shakeSeq, setShakeSeq] = useState(0)

  const editable = useMemo(
    () =>
      fieldDefinitions
        .filter((d) => !d.disabled && d.type !== 'timeline' && d.key !== 'avatar')
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [fieldDefinitions],
  )

  useEffect(() => {
    if (!open) return
    if (person) {
      setValues(JSON.parse(JSON.stringify(person.fields)))
      setMemo(person.memo ?? '')
    } else {
      const init: Record<string, unknown> = {}
      for (const d of fieldDefinitions) {
        if (d.type === 'timeline' || d.type === 'attachment') continue
        if (d.defaultValue !== undefined && d.defaultValue !== null) init[d.key] = d.defaultValue
      }
      init.groups = init.groups ?? ''
      init.tags = init.tags ?? []
      init.relatedPersons = init.relatedPersons ?? []
      init.phones = [{ label: 'mobile', number: '' }]
      setValues(init)
      setMemo('')
    }
    setErrors({})
  }, [open, person, fieldDefinitions])

  const setField = (key: string, v: unknown) => {
    setValues((prev) => ({ ...prev, [key]: v }))
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    for (const def of editable) {
      const v = values[def.key]
      if (def.required && (v === undefined || v === '' || (Array.isArray(v) && v.length === 0))) {
        errs[def.key] = `${def.label}为必填`
        continue
      }
      /* 联系方式是「一组下级通道」，只要任意一项填了就成立 */
      if (def.type === 'phone' && def.required) {
        const list = (v as PhoneValue[]) ?? []
        if (!list.some((x) => (x?.number ?? '').trim())) {
          errs[def.key] = '请至少填写一项联系方式，手机或微信都可以'
        }
      }
      if (def.type === 'date') {
        const dv = v as DateValue | undefined
        const issue = dateIssue(dv?.value?.slice(0, 10))
        if (issue) errs[def.key] = issue
      }
      if (def.type === 'email' && Array.isArray(v)) {
        const bad = (v as { address: string }[]).filter((x) => x.address && !EMAIL_RE.test(x.address))
        if (bad.length) errs[def.key] = '邮箱格式不正确，请修正后保存'
      }
      if (def.type === 'number' && v !== '' && v !== undefined && def.config.min !== undefined && Number(v) < def.config.min) {
        errs[def.key] = `不能小于 ${def.config.min}`
      }
      if (def.type === 'number' && v !== '' && v !== undefined && def.config.max !== undefined && Number(v) > def.config.max) {
        errs[def.key] = `不能大于 ${def.config.max}`
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const save = (again = false) => {
    if (!validate()) {
      setShakeSeq((n) => n + 1)
      toast('请检查标红字段', 'error')
      return
    }
    if (person) {
      updatePerson(person.id, values)
      patchPerson(person.id, { memo })
      toast('已保存', 'success')
      onClose()
    } else {
      const id = createPerson(values, memo)
      toast('已创建人脉', 'success')
      if (again) {
        setValues((prev) => ({
          ...prev,
          name: '',
          phones: [{ label: 'mobile', number: '' }],
          company: '',
          tags: [],
        }))
      } else {
        onClose()
        if (window.innerWidth >= 768) setTimeout(() => openPerson(id), 60)
      }
    }
  }

  const sections = ['basic', 'contact', 'custom'] as const

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={person ? `编辑「${String(person.fields.name ?? '')}」` : '新建人脉'}
      formId="person-form"
      onSubmit={() => save(false)}
      footer={
        <>
          {!person && (
            <button className="btn ghost left" type="button" onClick={() => save(true)}>
              保存并继续添加
            </button>
          )}
          <button className="btn" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="submit" form="person-form" disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 20 }}>
        <AvatarField
          metas={(values.avatar as AttachmentMeta[]) ?? []}
          attachments={attachments}
          name={String(values.name ?? '')}
          onChange={(next) => setField('avatar', next)}
        />
        {sections.map((sec) => {
          const defs = editable.filter((d) => (sec === 'custom' ? d.group === 'custom' || !d.isBuiltIn : d.group === sec && d.isBuiltIn))
          if (defs.length === 0) return null
          return (
            <div key={sec}>
              <div className="section-title">
                <h3>{groupLabel[sec]}</h3>
                {sec === 'custom' && <span className="count">可在「设置 → 字段管理」中增删</span>}
              </div>
              <div className="form-grid">
                {defs.map((def) => (
                  <FieldBlock
                    key={def.key}
                    def={def}
                    value={values[def.key]}
                    onChange={(v) => setField(def.key, v)}
                    personId={person?.id}
                    error={errors[def.key]}
                    shakeSeq={shakeSeq}
                    full={def.type === 'longtext' || def.type === 'personRef' || def.type === 'address' || def.type === 'attachment'}
                  />
                ))}
              </div>
            </div>
          )
        })}

        <div>
          <div className="section-title">
            <h3>关系备忘</h3>
            <span className="count">自由文本，参与全局搜索</span>
          </div>
          <textarea
            className="textarea"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="怎么认识的、聊过什么、下次可以聊什么…"
            rows={4}
          />
        </div>
      </div>
    </Modal>
  )
}

export function FieldBlock({
  def,
  value,
  onChange,
  personId,
  error,
  full,
  shakeSeq = 0,
  hideLabel,
}: {
  def: FieldDefinition
  value: unknown
  onChange: (v: unknown) => void
  personId?: string
  error?: string
  full?: boolean
  /** 每次保存失败 +1，用来重播 transitions.dev 的 error shake */
  shakeSeq?: number
  /** 详情页已经有一列字段名，编辑时不再重复渲染 */
  hideLabel?: boolean
}) {
  const inputRef = useRef<HTMLDivElement>(null)
  const uid = useId()
  const inputId = `f-${def.key}-${uid}`

  // transitions.dev · error-state-shake：error 的输入框左右甩一下（280ms / 4 段缓动）
  useEffect(() => {
    if (!shakeSeq || !error) return
    replayShake(inputRef.current)
  }, [shakeSeq, error])

  return (
    <div className={cn('field', 't-input-wrap', full && 'full', error && 'has-error')} data-state={error ? 'error' : 'closed'}>
      <label className={cn('field-label', hideLabel && 'sr-only')} htmlFor={inputId}>
        {/* 字段前的小图标：和详情页那一列字段名保持同一套图形 */}
        <FieldIcon name={iconNameForField(def)} size={13} className="field-label-icon" />
        {def.label}
        {def.required && <span style={{ color: 'var(--danger)' }}>*</span>}
        {def.isLocked && <span className="field-hint">锁定</span>}
      </label>
      {def.type === 'attachment' && !personId ? (
        <div className="field-hint" style={{ padding: '8px 0' }}>
          保存人脉后可在详情页添加{def.label}
        </div>
      ) : (
        <div className="t-input" ref={inputRef} data-state="closed">
          <FieldInput
            def={def}
            value={value}
            onChange={onChange}
            personId={personId}
            invalid={!!error}
            id={inputId}
          />
        </div>
      )}
      <span className="field-hint t-error-msg" role={error ? 'alert' : undefined}>
        {error ?? ''}
      </span>
    </div>
  )
}

/* 头像：点一下直接唤起系统选图（不再套一层「上传头像」弹窗），
   圆形预览 + 相机角标，和详情页、名片上的头像保持同一个形状语言 */
function AvatarField({
  metas,
  attachments,
  name,
  onChange,
}: {
  metas: AttachmentMeta[]
  attachments: Record<string, { data?: string; thumbnail?: string }>
  name: string
  onChange: (next: AttachmentMeta[]) => void
}) {
  const addAttachmentFile = useStore((s) => s.addAttachmentFile)
  const toast = useUI((s) => s.toast)
  const fileRef = useRef<HTMLInputElement>(null)
  const src = attachments[metas[0]?.id ?? '']?.thumbnail || attachments[metas[0]?.id ?? '']?.data
  return (
    <div className="pf-avatar">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          if (!/^image\//.test(f.type)) {
            toast('请选择图片文件（JPG / PNG / WebP）', 'error')
            return
          }
          try {
            onChange([await addAttachmentFile(f)])
          } catch {
            toast('这张图片读取失败，换一张试试', 'error')
          }
        }}
      />
      <button
        type="button"
        className="pf-avatar-btn"
        onClick={() => fileRef.current?.click()}
        aria-label={src ? '更换头像' : '上传头像'}
      >
        {src ? (
          <img src={src} alt="头像预览" />
        ) : (
          <span className="pf-avatar-ph">
            {name.trim() ? name.trim().slice(0, 1) : <Camera size={20} strokeWidth={1.8} />}
          </span>
        )}
        <span className="pf-avatar-cam" aria-hidden>
          <Camera size={12} />
        </span>
      </button>
      <div className="pf-avatar-info">
        <div className="pf-avatar-title">
          头像
          {metas.length > 0 && (
            <button type="button" className="link-btn pf-avatar-del" onClick={() => onChange([])}>
              <X size={11} /> 移除
            </button>
          )}
        </div>
        <div className="field-hint">点头像即可选择本机图片，JPG / PNG / WebP，会自动压缩成正方形</div>
      </div>
    </div>
  )
}
