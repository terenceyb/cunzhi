import React, { useEffect, useRef, useState } from 'react'
import { FileText, Upload, X } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * 全局上传弹窗（transitions.dev Community · Upload modal）
 * 动效参数与曲线保持不变：开 250ms / 关 150ms / scale 0.96 / ease (.22,1,.36,1)，
 * 图标交换 250ms，文字交换 150ms，进度条 150ms，按下 0.97 / 150ms。
 * prefers-reduced-motion 下全部瞬时完成。
 */

export interface UploadConfig {
  title?: string
  meta?: string
  accept?: string
  multiple?: boolean
}

type Req = { cfg: UploadConfig; resolve: (files: File[] | null) => void }

let listener: ((r: Req) => void) | null = null

/** 在任意位置唤起上传弹窗，返回选中的文件（取消返回 null） */
export function openUpload(cfg: UploadConfig = {}): Promise<File[] | null> {
  return new Promise((resolve) => {
    if (listener) listener({ cfg, resolve })
    else resolve(null)
  })
}

function SwapText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(text)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const el = ref.current
    if (!el) return
    el.classList.add('is-exit')
    const t = window.setTimeout(() => {
      setShown(text)
      el.classList.remove('is-exit')
      el.classList.add('is-enter-start')
      void el.offsetHeight
      el.classList.remove('is-enter-start')
    }, 150)
    return () => window.clearTimeout(t)
  }, [text])
  return <span ref={ref} className="t-text-swap">{shown}</span>
}

export function UploadHost() {
  const [state, setState] = useState<'closed' | 'open' | 'closing'>('closed')
  const [phase, setPhase] = useState<'idle' | 'picked' | 'uploading' | 'done'>('idle')
  const [pct, setPct] = useState(0)
  const [cfg, setCfg] = useState<UploadConfig>({})
  const [files, setFiles] = useState<File[]>([])
  const reqRef = useRef<Req | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listener = (r) => {
      reqRef.current = r
      setCfg(r.cfg)
      setFiles([])
      setPhase('idle')
      setPct(0)
      setState('open')
    }
    return () => {
      listener = null
    }
  }, [])

  useEffect(() => () => window.clearInterval(timer.current), [])

  const finish = (out: File[] | null) => {
    setState('closing')
    window.clearInterval(timer.current)
    window.setTimeout(() => {
      setState('closed')
      setPhase('idle')
      setPct(0)
      setFiles([])
      reqRef.current?.resolve(out)
      reqRef.current = null
    }, 150)
  }

  const close = () => finish(null)

  const pick = (list: FileList | null) => {
    if (!list || !list.length) return
    const arr = Array.from(list).slice(0, cfg.multiple ? 20 : 1)
    setFiles(arr)
    setPhase('picked')
    setPct(0)
  }

  const start = () => {
    if (phase === 'done') return finish(files)
    if (phase === 'idle') {
      inputRef.current?.click()
      return
    }
    if (phase !== 'picked') return
    setPhase('uploading')
    setPct(0)
    let p = 0
    timer.current = window.setInterval(() => {
      p = Math.min(100, p + 8 + Math.random() * 12)
      setPct(Math.round(p))
      if (p >= 100) {
        window.clearInterval(timer.current)
        window.setTimeout(() => setPhase('done'), 200)
      }
    }, 110)
  }

  const reduce =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const label = phase === 'done' ? '完成' : phase === 'uploading' ? '上传中' : phase === 'picked' ? '上传' : '选择文件'
  const first = files[0]
  const sizeText = first ? `${(first.size / 1024 / 1024).toFixed(1)} MB` : '—'

  return (
    <div className="up-root">
      <div
        className={cn('up-scrim', state === 'open' && 'is-open')}
        onClick={close}
        style={{ visibility: state === 'closed' ? 'hidden' : 'visible' }}
      >
        <div
          className={cn('up-modal', state === 'open' && 'is-open', state === 'closing' && 'is-closing')}
          role="dialog"
          aria-modal="true"
          aria-label={cfg.title ?? '上传文件'}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="up-head">
            <div className="up-txt">
              <div className="up-title">{cfg.title ?? '上传文件'}</div>
              <div className="up-meta">{cfg.meta ?? '拖入或选择一个文件，最大 10 MB'}</div>
            </div>
            <button type="button" className="up-x" aria-label="关闭" onClick={close}>
              <X size={16} />
            </button>
          </div>

          <div
            className="up-zone"
            data-phase={phase}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              pick(e.dataTransfer.files)
            }}
          >
            <div className="up-drop" onClick={() => inputRef.current?.click()}>
              <Upload size={30} strokeWidth={1.2} />
              <span className="up-meta">{cfg.accept ? `支持 ${cfg.accept}` : '把文件放到这里'}</span>
            </div>
            <div className="up-file">
              <div className="up-row">
                <div className="up-ico">
                  <div className="up-swap" data-state={phase === 'done' ? 'b' : 'a'}>
                    <span className="up-icon" data-icon="a">
                      <FileText size={16} />
                    </span>
                    <span className="up-icon" data-icon="b">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5.25 12.7 9.4 17.37 18.75 6.87" />
                      </svg>
                    </span>
                  </div>
                </div>
                <div className="up-txt">
                  <div className="up-name">{first?.name ?? '未选择文件'}</div>
                  <div className="up-meta">
                    <SwapText text={phase === 'done' ? '已完成' : phase === 'uploading' ? '上传中' : '待上传'} /> · {sizeText}
                    {files.length > 1 ? ` · 共 ${files.length} 个` : ''}
                  </div>
                </div>
                <span className="up-pct">{pct}%</span>
              </div>
              <div className="up-bar">
                <div className="up-fill" style={{ transform: `scaleX(${reduce ? 1 : pct / 100})` }} />
              </div>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            hidden
            accept={cfg.accept}
            multiple={cfg.multiple}
            onChange={(e) => {
              pick(e.target.files)
              e.target.value = ''
            }}
          />

          <div className="up-foot">
            <button type="button" className="up-btn is-secondary" onClick={close}>
              取消
            </button>
            <button type="button" className="up-btn" onClick={start} disabled={phase === 'uploading'}>
              <SwapText text={label} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
