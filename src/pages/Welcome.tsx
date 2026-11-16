import React from 'react'
import { ArrowRight, Database, FolderOpen, HardDrive, Sparkles } from 'lucide-react'
import { useStore } from '../store'
import { useUI } from '../ui'
import { Logo } from '../components/ui'
import { Modal } from '../components/ui'

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

  return (
    <div className="welcome">
      <div className="welcome-inner">
        {/* 品牌锁：logo 与「存知」放大，副标题落在右下 */}
        <div className="w-brand">
          <div className="w-lockup">
            <Logo size={54} />
            <span className="w-wordmark">存知</span>
          </div>
          <span className="w-tagline">本地优先的人脉管理工作台</span>
        </div>

        <h1>
          海内存知己，
          <br />
          天涯若比邻。
        </h1>
        <p className="lede">
          有些人只是名片上的一行字，有些人会慢慢长成你生活的一部分。存知想替你记住那些容易被日子冲淡的细节：
          他在哪座城市、最近在忙什么、上次聊到深夜的话题，还有那句说好要兑现的约定。
          它不催你社交，只在你想起某个人时，让你更快找到他；在关系快要凉下来的时候，轻轻提醒你问候一声。
        </p>
        <p className="lede lede--tool">
          所有内容都写进你选中的那个文件里 —— 不用注册，不上传服务器，换台电脑也能原样打开。
        </p>

        <div className="w-actions">
          <button
            className="w-btn w-btn--primary"
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
            <span className="w-btn-ic">
              <FolderOpen size={18} />
            </span>
            <span className="w-btn-text">
              <span className="w-btn-title">打开数据包</span>
              <span className="w-btn-sub">我已有 .czdb 文件</span>
            </span>
            <ArrowRight size={16} className="w-btn-arrow" />
          </button>
          <button
            className="w-btn"
            onClick={() => {
              setPrefs({ landingSeen: true })
              navigate('dashboard')
            }}
          >
            <span className="w-btn-ic">
              <HardDrive size={18} />
            </span>
            <span className="w-btn-text">
              <span className="w-btn-title">从零开始</span>
              <span className="w-btn-sub">先建空工作台，稍后录入</span>
            </span>
          </button>
          <button className="w-btn w-btn--text" onClick={startDemo}>
            <Sparkles size={15} />
            先看看演示数据
          </button>
        </div>

        <div className="welcome-cards">
          <div className="welcome-card">
            <div className="ic"><Sparkles size={15} /></div>
            <h3>该联系谁，替你排好</h3>
            <p>按你为每个人设定的联系频率算关系冷却度，逾期越久越靠前，连续忽略会降权，避免提醒疲劳。</p>
          </div>
          <div className="welcome-card">
            <div className="ic"><Database size={15} /></div>
            <h3>聊过什么，不用再想</h3>
            <p>一句话速记、纪念日、待办都挂在具体的人身上。下次见面之前，翻一眼就知道上次说到哪儿。</p>
          </div>
          <div className="welcome-card">
            <div className="ic"><ArrowRight size={15} /></div>
            <h3>数据是你的，一直是</h3>
            <p>`.czdb` 是能被文本编辑器打开的 UTF-8 JSON，放进任意同步盘即可搬运、检查、长期持有。</p>
          </div>
        </div>

        <p className="w-foot">
          建议：桌面端编辑数据包，手机端作为查看器与速记器。当前浏览器
          {supportsFsa ? '支持 File System Access API，可实现实时回写。' : '不支持 File System Access API，将以「导出覆盖」方式保存。'}
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
