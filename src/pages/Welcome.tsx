import React from 'react'
import { useStore } from '../store'
import { useUI } from '../ui'
import { Logo } from '../components/ui'
import { Modal } from '../components/ui'
import { InlineTextMorph } from '../components/morph/InlineTextMorph'

export function Welcome() {
  const openPackage = useStore((s) => s.openPackage)
  const loadDemo = useStore((s) => s.loadDemo)
  const setPrefs = useStore((s) => s.setPrefs)
  const toast = useUI((s) => s.toast)
  const navigate = useUI((s) => s.navigate)
  const persons = useStore((s) => s.persons)
  const supportsFsa = typeof window !== 'undefined' && 'showOpenFilePicker' in window

  const startDemo = () => {
    if (persons.length > 0) {
      useUI.getState().askConfirm({
        title: '载入演示数据？',
        message: '演示数据会覆盖当前所有人脉与设置（可用撤销回退）。',
        confirmText: '载入演示数据',
        onConfirm: () => {
          loadDemo()
          setPrefs({ landingSeen: true })
          navigate('dashboard')
          toast('已载入 14 位示例人脉与完整关系网', 'success')
        },
      })
    } else {
      loadDemo()
      setPrefs({ landingSeen: true })
      navigate('dashboard')
      toast('已载入 14 位示例人脉与完整关系网', 'success')
    }
  }

  /* 三行句子里嵌三枚可点的胶囊：点一下换词换贴纸，句子在流里重新居中。
     用中文写，词是这一页想说的三件事：怎么找、怎么联系、怎么记住。 */
  const morphPills = [
    {
      items: [
        { word: '检索', icon: 'languages' },
        { word: '回想', icon: 'motion' },
        { word: '翻阅', icon: 'themes' },
      ],
      angleSet: 'languages' as const,
    },
    {
      items: [
        { word: '问候', icon: 'icons' },
        { word: '拜访', icon: 'systems' },
        { word: '联系', icon: 'effects' },
      ],
      angleSet: 'models' as const,
    },
    {
      items: [
        { word: '约定', icon: 'states' },
        { word: '生日', icon: 'colors' },
        { word: '待办', icon: 'components' },
      ],
      angleSet: 'custom' as const,
    },
  ]

  return (
    <div className="land">
      <div className="land-inner">
        <div className="land-brand">
          <Logo size={84} />
          <h1 className="land-name">存知</h1>
          <p className="land-sub">本地优先的人脉工作台</p>
        </div>

        <p className="land-poem">
          海内存知己，
          <br />
          天涯若比邻。
        </p>

        <InlineTextMorph
          className="land-morph"
          compact
          brand="存知"
          height={320}
          lines={['把见过的人，连成一张可 {0} 的网，', '让每一次 {1} 都有来处，', '也记得那些 {2}。']}
          pills={morphPills}
        />

        <div className="land-actions">
          <button
            className="land-btn land-btn--primary"
            onClick={async () => {
              const res = await openPackage()
              if (res.ok) {
                toast(res.message ?? '数据包已加载', 'success')
                setPrefs({ landingSeen: true })
                navigate('dashboard')
              } else if (!res.needsPassword) {
                toast(res.message ?? '未选择文件', 'warn')
              }
            }}
          >
            打开数据包
          </button>
          <button
            className="land-btn"
            onClick={() => {
              setPrefs({ landingSeen: true })
              navigate('dashboard')
            }}
          >
            从零开始
          </button>
        </div>

        <button className="land-link" onClick={startDemo}>
          先看看演示数据
        </button>

        <p className="land-foot">
          数据只写在你选中的那个文件里 · 不用注册 · 不上传服务器
          {supportsFsa ? '' : ' · 当前浏览器以「导出覆盖」方式保存'}
        </p>
      </div>
    </div>
  )
}

export function UnlockDialog() {
  const pending = useStore((s) => s.pendingUnlock)
  const unlock = useStore((s) => s.unlockPending)
  const toast = useUI((s) => s.toast)
  const [password, setPassword] = React.useState('')
  if (!pending) return null
  return (
    <Modal
      open
      narrow
      title="数据包已加密"
      onClose={() => useStore.setState({ pendingUnlock: null })}
      footer={
        <>
          <button className="btn" onClick={() => useStore.setState({ pendingUnlock: null })}>
            取消
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              const res = await unlock(password)
              if (res.ok) toast('数据包已解锁', 'success')
              else toast(res.message ?? '解锁失败', 'error')
            }}
          >
            解锁
          </button>
        </>
      }
    >
      <p className="field-hint" style={{ marginBottom: 10 }}>
        {pending.fileName} · 请输入口令。口令不存储于设备，忘记后无法恢复。
      </p>
      <input
        className="input"
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="数据包口令"
        onKeyDown={async (e) => {
          if (e.key === 'Enter') {
            const res = await unlock(password)
            if (res.ok) toast('数据包已解锁', 'success')
            else toast(res.message ?? '解锁失败', 'error')
          }
        }}
      />
    </Modal>
  )
}

export function ConflictDialog() {
  const conflict = useStore((s) => s.conflict)
  const resolve = useStore((s) => s.resolveConflict)
  if (!conflict) return null
  return (
    <Modal
      open
      onClose={() => useStore.setState({ conflict: null })}
      title="检测到文件被外部修改"
      footer={
        <>
          <button className="btn ghost left" onClick={() => resolve('saveAs')}>
            另存为
          </button>
          <button className="btn" onClick={() => resolve('reload')}>
            重新加载文件
          </button>
          <button className="btn primary" onClick={() => resolve('overwrite')}>
            用本地版本覆盖
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-2)' }}>
        「{conflict.fileName}」在应用之外被修改过。存知不会静默覆盖你的任何一份数据，请选择处理方式：
      </p>
      <div className="kv-list" style={{ marginTop: 12 }}>
        <div className="kv"><span className="k">本地版本</span><span className="v">修订 #{conflict.localRevision} · {new Date(conflict.localUpdatedAt).toLocaleString()}</span></div>
        <div className="kv"><span className="k">文件版本</span><span className="v">{new Date(conflict.remoteModified).toLocaleString()} · {(conflict.remoteSize / 1024).toFixed(0)} KB</span></div>
      </div>
      <p className="field-hint" style={{ marginTop: 10 }}>
        「重新加载」会放弃本地未保存的更改；「另存为」会保留两个版本，之后可手动比对。
      </p>
    </Modal>
  )
}

export function LockScreen() {
  const locked = useStore((s) => s.locked)
  const pinLock = useStore((s) => s.prefs.pinLock)
  const unlockApp = useStore((s) => s.unlockApp)
  const [pin, setPin] = React.useState('')
  const [err, setErr] = React.useState(false)
  if (!locked) return null
  return (
    <div className="lock-screen">
      <Logo size={44} />
      <div style={{ fontSize: 15, fontWeight: 600 }}>存知已锁定</div>
      <div className="field-hint" style={{ color: 'rgba(255,255,255,.45)' }}>输入 4 位 PIN 解锁</div>
      <input
        className="pin-input"
        type="password"
        inputMode="numeric"
        maxLength={4}
        value={pin}
        autoFocus
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '')
          setPin(v)
          setErr(false)
          if (v.length === 4) {
            if (!unlockApp(v)) {
              setErr(true)
              setPin('')
            }
          }
        }}
        aria-label="PIN"
      />
      {err && <div style={{ color: '#fca5a5', fontSize: 12 }}>PIN 不正确</div>}
      <button className="btn ghost" style={{ color: 'rgba(255,255,255,.6)' }} onClick={() => useStore.setState({ locked: false })}>
        忘记 PIN？继续使用（数据仍在本机）
      </button>
      {pinLock && <span className="sr-only">已设置 PIN</span>}
    </div>
  )
}
