import React from 'react'
import {
  ChevronRight,
  CloudOff,
  FileCheck2,
  FolderOpen,
  HardDriveDownload,
  PenLine,
  Sparkles,
} from 'lucide-react'
import { useStore } from '../store'
import { useUI } from '../ui'
import { Logo } from '../components/ui'
import { Modal } from '../components/ui'
import { InlineTextMorph } from '../components/morph/InlineTextMorph'
import { isNative } from '../lib/nativeFs'

export function Welcome() {
  const openPackage = useStore((s) => s.openPackage)
  const loadDemo = useStore((s) => s.loadDemo)
  const setPrefs = useStore((s) => s.setPrefs)
  const toast = useUI((s) => s.toast)
  const navigate = useUI((s) => s.navigate)
  const persons = useStore((s) => s.persons)
  const prefs = useStore((s) => s.prefs)
  const supportsFsa = typeof window !== 'undefined' && 'showOpenFilePicker' in window

  /* 安卓端：启动页只在安装后第一次打开时出现。
     只要这一页被展示过就落盘标记，用户即使没点任何按钮就退出，下次也直接进工作台。 */
  React.useEffect(() => {
    if (isNative() && !prefs.landingSeen) setPrefs({ landingSeen: true })
  }, [prefs.landingSeen, setPrefs])

  const startFresh = () => {
    // 真正从零开始：不是体验态；首次进入弹「挂载本地文件夹」引导
    setPrefs({ landingSeen: true, demoMode: false })
    navigate('dashboard')
    if (!prefs.mountHintSeen) setTimeout(() => useUI.getState().openMountHint(), 280)
  }

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
      <div className="land-aura" aria-hidden="true" />

      <div className="land-inner">
        <div className="land-brand">
          <Logo size={76} />
          <h1 className="land-name">存知</h1>
          <p className="land-sub">本地优先的人脉工作台</p>
        </div>

        {/* 一行放完，窄屏靠 clamp 自动收字号，绝不折行 */}
        <p className="land-poem">海内存知己，天涯若比邻。</p>

        <InlineTextMorph
          className="land-morph"
          compact
          brand="存知"
          height={320}
          lines={['把见过的人，连成一张可 {0} 的网，', '让每一次 {1} 都有来处，', '也记得那些 {2}。']}
          pills={morphPills}
        />

        <div className="land-cta">
          {/* 首次使用只有这一条路是「点一下就能看到全部功能」，所以放在最上面 */}
          <button className="land-demo" onClick={startDemo}>
            <span className="land-demo-badge" aria-hidden="true">
              <Sparkles size={17} />
            </span>
            <span className="land-demo-text">
              <span className="land-demo-title">先看看演示数据</span>
              <span className="land-demo-sub">第一次使用？先用它体验全部功能</span>
            </span>
            <ChevronRight size={16} className="land-demo-arrow" aria-hidden="true" />
          </button>

          <button
            className="land-btn land-btn--plain"
            onClick={startFresh}
          >
            <PenLine size={17} />
            <span>从零开始</span>
          </button>

          <button
            className="land-btn land-btn--primary"
            onClick={async () => {
              const res = await openPackage()
              if (res.ok) {
                toast(res.message ?? (isNative() ? '数据包已复制到本地 cunzhi 文件夹并加载' : '数据包已加载'), 'success')
                setPrefs({ landingSeen: true, demoMode: false })
                navigate('dashboard')
              } else if (!res.needsPassword) {
                toast(res.message ?? '未选择文件', 'warn')
              }
            }}
          >
            <FolderOpen size={17} />
            <span>打开本地数据包</span>
          </button>
        </div>

        <p className="land-foot">
          {isNative()
            ? '数据保存在本机 cunzhi 文件夹 · 不用注册 · 不上传服务器 · 离线可用'
            : <>数据只写在你选中的那个文件里 · 不用注册 · 不上传服务器{supportsFsa ? '' : ' · 当前浏览器以「导出覆盖」方式保存'}</>}
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

/**
 * 首次「从零开始」的本地挂载引导。
 * 弹窗给用户两条清晰的路：把数据包落到本地文件夹（之后自动回写），
 * 或明确告知「只用浏览器缓存、有丢失风险」。选完一次就不再打扰（mountHintSeen）。
 */
export function MountHintDialog() {
  const open = useUI((s) => s.mountHintOpen)
  const close = useUI((s) => s.closeMountHint)
  const toast = useUI((s) => s.toast)
  const setPrefs = useStore((s) => s.setPrefs)
  const savePackageAsFile = useStore((s) => s.savePackageAsFile)
  const [busy, setBusy] = React.useState(false)
  const [tried, setTried] = React.useState(false)
  const native = isNative()
  const supportsPicker =
    native || (typeof window !== 'undefined' && typeof (window as any).showSaveFilePicker === 'function')

  if (!open) return null

  const finish = () => {
    setPrefs({ mountHintSeen: true })
    setTried(false)
    close()
  }

  const mountLocal = async () => {
    setBusy(true)
    try {
      // 系统文件夹/保存弹窗：让用户挑一个 .czdb 的位置，落盘后即建立句柄自动回写
      const ok = await savePackageAsFile('我的存知数据包.czdb')
      if (ok) {
        toast('数据包已挂载，之后的改动会自动保存进这个文件', 'success')
        finish()
      } else {
        // 用户取消系统弹窗：不强行关闭引导，允许改选「暂不」
        setTried(true)
      }
    } catch {
      setTried(true)
    } finally {
      setBusy(false)
    }
  }

  const useCache = () => {
    toast('数据将存储在浏览器本地缓存，有数据丢失风险', 'warn')
    finish()
  }

  if (native) {
    return (
      <Modal open onClose={finish} narrow title="把数据存到你的文件夹">
        <div className="mount-hint">
          <div className="mount-hint-hero" aria-hidden="true">
            <HardDriveDownload size={26} />
          </div>
          <p className="mount-hint-lead">给数据安一个固定的家</p>
          <p className="mount-hint-desc">
            数据已自动保存在本机的 <code>cunzhi</code> 文件夹中，每次改动都会实时写回，无需联网、不上传任何服务器。
          </p>
          <ul className="mount-hint-list">
            <li><FileCheck2 size={14} /> 数据包就在本地 cunzhi 文件夹，可随时拷走、备份</li>
            <li><FileCheck2 size={14} /> 不注册账号，不上传服务器，离线可用</li>
          </ul>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          <button className="btn primary" onClick={finish}>
            <FileCheck2 size={14} /> 知道了，开始使用
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={useCache} narrow title="把数据存到你的文件夹">
      <div className="mount-hint">
        <div className="mount-hint-hero" aria-hidden="true">
          <HardDriveDownload size={26} />
        </div>
        <p className="mount-hint-lead">给数据安一个固定的家</p>
        <p className="mount-hint-desc">
          选一个本地文件夹保存 <code>.czdb</code> 数据包，之后每次改动都会自动写回这个文件——换设备、清缓存都不怕丢。
        </p>
        {!supportsPicker && (
          <p className="mount-hint-warn">
            <CloudOff size={13} /> 当前浏览器不支持直接写入本地文件夹，将以「下载 / 导出覆盖」方式保存。
          </p>
        )}
        {tried && (
          <p className="mount-hint-warn">
            <CloudOff size={13} /> 未选择保存位置。你可以再试一次，或选择仅用浏览器缓存。
          </p>
        )}
        <ul className="mount-hint-list">
          <li>
            <FileCheck2 size={14} /> 数据是你自己的文件，可随时拷走、备份
          </li>
          <li>
            <FileCheck2 size={14} /> 不注册账号，不上传服务器
          </li>
        </ul>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        <button className="btn primary" disabled={busy} onClick={mountLocal}>
          <FolderOpen size={14} /> {busy ? '请选择保存位置…' : '选择本地文件夹'}
        </button>
        <button className="btn ghost" onClick={useCache}>
          暂不，用浏览器缓存
        </button>
      </div>
    </Modal>
  )
}
