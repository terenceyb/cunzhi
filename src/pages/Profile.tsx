import React, { useRef } from 'react'
import { Camera, Copy, Download, Image as ImageIcon, UserRound } from 'lucide-react'
import { useStore } from '../store'
import { useUI } from '../ui'
import { Avatar, CopyButton, PageHead } from '../components/ui'
import { EMAIL_RE } from '../components/FieldInput'
import { cn, formatDate } from '../lib/utils'

export function ProfilePage() {
  const profile = useStore((s) => s.settings.profile)
  const attachments = useStore((s) => s.attachments)
  const updateProfile = useStore((s) => s.updateProfile)
  const uploadAvatar = useStore((s) => s.uploadProfileAvatar)
  const toast = useUI((s) => s.toast)
  const me = useStore((s) => s.settings.profile.nickname)
  const fileRef = useRef<HTMLInputElement>(null)
  const avatar = profile.avatarAttachmentId ? attachments[profile.avatarAttachmentId] : undefined

  return (
    <div className="page">
      <PageHead title="我的信息" />

      <div className="card pad" style={{ marginBottom: 16, background: 'linear-gradient(160deg,#fff,#f7f8fa)' }}>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <div style={{ position: 'relative' }}>
            <Avatar name={profile.nickname || '我'} src={avatar?.data} size={64} color="#131619" />
            <button
              className="btn icon sm"
              style={{ position: 'absolute', right: -6, bottom: -6, background: 'var(--surface)', boxShadow: 'var(--shadow-1)' }}
              onClick={() => fileRef.current?.click()}
              aria-label="上传头像"
            >
              <Camera size={13} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) await uploadAvatar(f)
              }}
            />
          </div>
          <div className="grow">
            <div style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-0.02em' }}>{profile.nickname || '未命名'}</div>
            <div className="field-hint" style={{ marginTop: 2 }}>
              {[profile.company, profile.city].filter(Boolean).join(' · ') || '补充公司、城市，名片会更完整'}
            </div>
            <div className="chip-row" style={{ marginTop: 10 }}>
              {profile.phone?.number && <span className="chip sm">{profile.phone.number}</span>}
              {profile.email?.address && <span className="chip sm">{profile.email.address}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="set-card">
        <div className="set-card-head">
          <h3>基本信息</h3>
        </div>
        <div className="set-card-body">
          <div className="form-grid">
            <div className="field">
              <span className="field-label">
                昵称 <span style={{ color: 'var(--danger)' }}>*</span>
              </span>
              <input
                className="input"
                value={profile.nickname}
                onChange={(e) => updateProfile({ nickname: e.target.value })}
                placeholder="我"
              />
            </div>
            <div className="field">
              <span className="field-label">公司/单位</span>
              <input className="input" value={profile.company ?? ''} onChange={(e) => updateProfile({ company: e.target.value })} />
            </div>
            <div className="field">
              <span className="field-label">城市</span>
              <input className="input" value={profile.city ?? ''} onChange={(e) => updateProfile({ city: e.target.value })} />
            </div>
            <div className="field">
              <span className="field-label">电话</span>
              <input
                className="input"
                value={profile.phone?.number ?? ''}
                onChange={(e) => updateProfile({ phone: { label: '手机', number: e.target.value } })}
                placeholder="13800138000"
              />
            </div>
            <div className="field">
              <span className="field-label">邮箱</span>
              <input
                className={cn('input', profile.email?.address && !EMAIL_RE.test(profile.email.address) && 'invalid')}
                value={profile.email?.address ?? ''}
                onChange={(e) => updateProfile({ email: { label: '工作', address: e.target.value } })}
                placeholder="hi@example.com"
              />
              {profile.email?.address && !EMAIL_RE.test(profile.email.address) && (
                <span className="field-hint" style={{ color: 'var(--danger)' }}>
                  邮箱格式不正确
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="set-card" style={{ marginTop: 16 }}>
        <div className="set-card-head">
          <h3>分享与导出</h3>
        </div>
        <div className="set-card-body">
          <div className="set-row">
            <div>
              <div className="lbl">导出 vCard</div>
              <div className="hint">可导入系统通讯录或其他联系人应用</div>
            </div>
            <button
              className="btn"
              onClick={() => {
                const lines = [
                  'BEGIN:VCARD',
                  'VERSION:3.0',
                  `FN:${profile.nickname || '我'}`,
                  `N:${profile.nickname || '我'};;;;`,
                  profile.company ? `ORG:${profile.company}` : '',
                  profile.phone?.number ? `TEL;TYPE=CELL:${profile.phone.number}` : '',
                  profile.email?.address ? `EMAIL;TYPE=WORK:${profile.email.address}` : '',
                  profile.bio ? `NOTE:${profile.bio}` : '',
                  'END:VCARD',
                ].filter(Boolean)
                const blob = new Blob([lines.join('\r\n')], { type: 'text/vcard;charset=utf-8' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = `我的名片_${profile.nickname || '我'}.vcf`
                a.click()
                toast('已导出 vCard', 'success')
              }}
            >
              <Download size={14} /> 导出 vCard
            </button>
          </div>
          <div className="set-row">
            <div>
              <div className="lbl">复制名片文字</div>
              <div className="hint">粘贴到聊天窗口，快速自我介绍</div>
            </div>
            <CopyButton
              variant="btn"
              label="复制名片文字"
              icon={<Copy size={14} />}
              text={`${profile.nickname || '我'}${profile.company ? ` · ${profile.company}` : ''}${profile.bio ? `\n${profile.bio}` : ''}${profile.phone?.number ? `\n电话：${profile.phone.number}` : ''}${profile.email?.address ? `\n邮箱：${profile.email.address}` : ''}`}
            >
              复制
            </CopyButton>
          </div>
          <div className="set-row">
            <div>
              <div className="lbl">个人头像</div>
              <div className="hint">与「我的名片」同步，导出数据包时一并携带</div>
            </div>
            <span className="chip sm">{avatar ? '已设置' : '未设置'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
