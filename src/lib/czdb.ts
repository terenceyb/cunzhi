import type { DataPackage, FieldDefinition, Person, PersonRef, RefSnapshot, Settings } from '../types'
import { APP_VERSION, FORMAT_VERSION, createDefaultFieldDefinitions, createDefaultSettings } from '../defaults'
import { nowISO } from './utils'
import { decryptPackage, encryptPackage, type EncryptedEnvelope } from './crypto'
import {
  isNative,
  listLocalPackages,
  readLocalPackage,
  writeLocalPackage,
} from './nativeFs'
import { nativePickPackage } from './nativeBridge'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type DataSlots = Pick<
  DataPackage,
  | 'fieldDefinitions'
  | 'groups'
  | 'tags'
  | 'persons'
  | 'todos'
  | 'anniversaries'
  | 'timelineEvents'
  | 'attachments'
  | 'settings'
>

export interface PkgBuildMeta {
  revision?: number
  createdAt?: string
  updatedAt?: string
}

export function buildPackage(slots: DataSlots, meta: PkgBuildMeta = {}): DataPackage {
  return {
    magic: 'CZDB',
    formatVersion: FORMAT_VERSION,
    appVersion: APP_VERSION,
    createdAt: meta.createdAt ?? nowISO(),
    updatedAt: meta.updatedAt ?? nowISO(),
    revision: meta.revision ?? 1,
    ...slots,
  }
}

export function serializePackage(pkg: DataPackage): string {
  return JSON.stringify(pkg, null, 2)
}

export interface ParsedPackage {
  pkg: DataPackage
  encrypted: boolean
  migrated: boolean
}

function normalizeRefs(person: Person, validIds: Set<string>): Person {
  const normalize = (v: unknown, multiple: boolean): unknown => {
    const list = Array.isArray(v) ? v : v ? [v] : []
    const out: PersonRef[] = list.map((item) => {
      if (typeof item === 'string') {
        if (!validIds.has(item)) return { refId: item, snapshotName: '已删除联系人', deleted: true } as RefSnapshot
        return item
      }
      if (item && typeof item === 'object' && (item as RefSnapshot).refId) return item as RefSnapshot
      return { refId: '', snapshotName: '未知联系人', deleted: true } as RefSnapshot
    })
    if (multiple) return out
    return out[0] ?? ''
  }
  const fields = { ...person.fields }
  for (const key of ['relatedPersons', 'referrer']) {
    if (key in fields) fields[key] = normalize(fields[key], key !== 'referrer')
  }
  return { ...person, fields }
}

export function hydratePackage(raw: any): ParsedPackage {
  if (!raw || typeof raw !== 'object') throw new Error('文件内容不是有效的存知数据包')
  if (raw.magic !== 'CZDB') throw new Error('文件标识不匹配：缺少 CZDB magic')
  let migrated = false
  const version = Number(raw.formatVersion ?? 0)
  if (!Number.isFinite(version) || version > FORMAT_VERSION) {
    throw new Error(`数据包版本 ${raw.formatVersion} 高于当前应用支持的版本 ${FORMAT_VERSION}`)
  }
  if (version < FORMAT_VERSION) migrated = true

  const defaults = createDefaultFieldDefinitions()
  const incoming: FieldDefinition[] = Array.isArray(raw.fieldDefinitions) ? raw.fieldDefinitions : []
  // 保证 14 个默认字段始终存在（锁定字段类型不可被覆盖）
  const fieldDefinitions: FieldDefinition[] = defaults.map((d) => {
    const match = incoming.find((f) => f && f.key === d.key)
    if (!match) return d
    if (d.key === 'referrer') {
      // 引荐人固定排在关联人上方；老数据包里的旧顺序在这里统一迁移
      return { ...d, label: match.label || d.label, disabled: false }
    }
    if (d.isLocked) {
      return { ...d, label: match.label || d.label, sortOrder: match.sortOrder ?? d.sortOrder, disabled: false }
    }
    return { ...d, ...match, type: d.type, key: d.key }
  })
  for (const f of incoming) {
    if (!f || !f.key) continue
    if (fieldDefinitions.some((x) => x.key === f.key)) continue
    fieldDefinitions.push({ ...f, isBuiltIn: !!f.isBuiltIn })
  }
  fieldDefinitions.sort((a, b) => a.sortOrder - b.sortOrder)
  /* 旧数据包里这个字段还叫「电话」，统一改名成「联系方式」（它现在带下级通道） */
  for (const f of fieldDefinitions) {
    if (f.key === 'phones' && f.label === '电话') f.label = '联系方式'
  }

  const settings: Settings = {
    ...createDefaultSettings(),
    ...(raw.settings ?? {}),
    profile: { ...createDefaultSettings().profile, ...(raw.settings?.profile ?? {}) },
    reminderPolicy: { ...createDefaultSettings().reminderPolicy, ...(raw.settings?.reminderPolicy ?? {}) },
    smartViews:
      Array.isArray(raw.settings?.smartViews) && raw.settings.smartViews.length > 0
        ? raw.settings.smartViews
        : createDefaultSettings().smartViews,
    auditLog: Array.isArray(raw.settings?.auditLog) ? raw.settings.auditLog : [],
  }

  const personsRaw: Person[] = Array.isArray(raw.persons) ? raw.persons : []
  const validIds = new Set(personsRaw.map((p) => p.id))
  const persons = personsRaw.map((p) => ({
    id: p.id,
    createdAt: p.createdAt ?? nowISO(),
    updatedAt: p.updatedAt ?? nowISO(),
    fields: p.fields && typeof p.fields === 'object' ? p.fields : {},
    reminderFrequencyDays: p.reminderFrequencyDays ?? null,
    ignoredReminders: p.ignoredReminders ?? 0,
    snoozeUntil: p.snoozeUntil ?? null,
    pinnedTimelineId: p.pinnedTimelineId ?? null,
    memo: p.memo ?? '',
  }))
  const hydratedPersons = persons.map((p) => normalizeRefs(p, validIds))

  const pkg: DataPackage = {
    magic: 'CZDB',
    formatVersion: FORMAT_VERSION,
    appVersion: raw.appVersion ?? APP_VERSION,
    createdAt: raw.createdAt ?? nowISO(),
    updatedAt: raw.updatedAt ?? nowISO(),
    revision: Number(raw.revision ?? 1),
    fieldDefinitions,
    groups: Array.isArray(raw.groups) && raw.groups.length ? raw.groups : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    persons: hydratedPersons,
    todos: Array.isArray(raw.todos) ? raw.todos : [],
    anniversaries: Array.isArray(raw.anniversaries) ? raw.anniversaries : [],
    timelineEvents: Array.isArray(raw.timelineEvents) ? raw.timelineEvents : [],
    attachments: raw.attachments && typeof raw.attachments === 'object' ? raw.attachments : {},
    settings,
  }
  return { pkg, encrypted: false, migrated }
}

export interface ParseResult {
  pkg: DataPackage
  encrypted: boolean
  migrated: boolean
  needsPassword?: boolean
}

export async function parsePackageText(text: string, password?: string): Promise<ParseResult> {
  const trimmed = text.trim().replace(/^\uFEFF/, '')
  if (!trimmed) throw new Error('文件为空')
  let raw: any
  try {
    raw = JSON.parse(trimmed)
  } catch {
    throw new Error('无法解析：文件不是合法的 UTF-8 JSON 文本')
  }
  if (raw?.encrypted) {
    if (!password) return { pkg: null as unknown as DataPackage, encrypted: true, migrated: false, needsPassword: true }
    const plain = await decryptPackage(raw as EncryptedEnvelope, password)
    const res = await parsePackageText(plain)
    return { ...res, encrypted: true }
  }
  const res = hydratePackage(raw)
  return { ...res, encrypted: false }
}

export async function encodePackageForWrite(pkg: DataPackage, password?: string | null): Promise<string> {
  const text = serializePackage(pkg)
  if (!password) return text
  const env = await encryptPackage(text, password)
  return JSON.stringify(env, null, 2)
}

/* ---------------- 文件系统访问 ---------------- */

export const supportsFileSystemAccess = (): boolean =>
  typeof window !== 'undefined' && typeof (window as any).showOpenFilePicker === 'function'

export interface OpenedFile {
  handle: any
  name: string
  text: string
  lastModified: number
  size: number
}


/** showSaveFilePicker / showOpenFilePicker 需要用户激活，否则会挂起或抛错；不可用时退回 input/download */
function pickerAllowed(): boolean {
  const w = window as any
  if (typeof w.showSaveFilePicker !== 'function' && typeof w.showOpenFilePicker !== 'function') return false
  const ua = (navigator as any).userActivation
  if (ua && ua.isActive === false && ua.hasBeenActive === false) return false
  return true
}

/** 原生环境：应用内列出本地 cunzhi 文件夹的数据包，让用户选一个打开 */
async function pickNativePackage(): Promise<OpenedFile | null> {
  const files = await listLocalPackages()
  if (files.length === 0) return null
  const lines = files.map((f, i) => `${i + 1}. ${f.name} (${(f.size / 1024).toFixed(1)} KB)`)
  const answer = window.prompt(
    `本地 cunzhi 文件夹中的数据包：\n${lines.join('\n')}\n\n输入序号选择，取消则放弃：`,
    '1',
  )
  if (answer === null) return null
  const idx = Math.max(0, (parseInt(answer, 10) || 1) - 1)
  const picked = files[Math.min(idx, files.length - 1)]
  if (!picked) return null
  const text = await readLocalPackage(picked.path)
  const now = Date.now()
  return {
    handle: { __native: true, name: picked.name, path: picked.path, size: picked.size, lastModified: now },
    name: picked.name,
    text,
    lastModified: now,
    size: picked.size,
  }
}

export function isNativeHandle(handle: any): boolean {
  return !!(handle && handle.__native === true)
}

export async function pickPackageFile(): Promise<OpenedFile | null> {
  if (isNative()) {
    // 系统文件浏览器（SAF）可从设备任意文件夹选包；原生层已把文件复制到 cunzhi 文件夹，
    // 这里直接以副本为句柄，之后所有写回都落在应用数据目录，不依赖原文件的临时授权。
    try {
      const copied = await nativePickPackage()
      if (!copied) return null
      const text = await readLocalPackage(copied.path)
      const now = Date.now()
      return {
        handle: { __native: true, name: copied.name, path: copied.path, size: copied.size, lastModified: now },
        name: copied.name,
        text,
        lastModified: now,
        size: copied.size,
      }
    } catch {
      // 系统选择器异常时退回应用内数据包列表，保证功能仍可用
      return pickNativePackage()
    }
  }
  const w = window as any
  if (typeof w.showOpenFilePicker === 'function' && pickerAllowed()) {
    try {
      const [handle] = await w.showOpenFilePicker({
        types: [{ description: '存知数据包', accept: { 'application/json': ['.czdb'] } }],
        multiple: false,
      })
      const file = await handle.getFile()
      return {
        handle,
        name: file.name,
        text: await file.text(),
        lastModified: file.lastModified,
        size: file.size,
      }
    } catch (e) {
      // 用户取消：直接返回；其它情况退回 <input type=file>
      if ((e as { name?: string })?.name === 'AbortError') return null
    }
  }
  const handle = await pickFileFallback('.czdb,application/json')
  if (!handle) return null
  const file = handle as File
  return { handle: null, name: file.name, text: await file.text(), lastModified: file.lastModified, size: file.size }
}

export function pickFileFallback(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0'
    const done = (file: File | null) => {
      input.remove()
      resolve(file)
    }
    input.onchange = () => done(input.files?.[0] ?? null)
    input.oncancel = () => done(null)
    // 必须挂到 DOM 上，Safari / 部分 Firefox 版本对游离 input 不弹窗
    document.body.appendChild(input)
    input.click()
  })
}

export async function queryHandlePermission(handle: any): Promise<PermissionState> {
  if (isNativeHandle(handle)) return 'granted'
  if (!handle?.queryPermission) return 'granted'
  try {
    return await handle.queryPermission({ mode: 'readwrite' })
  } catch {
    return 'prompt'
  }
}

export async function ensureHandlePermission(handle: any): Promise<boolean> {
  if (!handle) return false
  if (isNativeHandle(handle)) return true
  const state = await queryHandlePermission(handle)
  if (state === 'granted') return true
  try {
    const res = await handle.requestPermission({ mode: 'readwrite' })
    return res === 'granted'
  } catch {
    return false
  }
}

export async function writeHandle(handle: any, text: string): Promise<{ lastModified: number; size: number }> {
  if (isNativeHandle(handle)) {
    const res = await writeLocalPackage(handle.name, text)
    return { lastModified: Date.now(), size: res.size }
  }
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
  const file = await handle.getFile()
  return { lastModified: file.lastModified, size: file.size }
}

export async function savePackageAs(text: string, suggestedName = '存知数据包.czdb'): Promise<OpenedFile | null> {
  if (isNative()) {
    const res = await writeLocalPackage(suggestedName, text)
    const now = Date.now()
    return {
      handle: { __native: true, name: res.name, path: `cunzhi/${res.name}`, size: res.size, lastModified: now },
      name: res.name,
      text,
      lastModified: now,
      size: res.size,
    }
  }
  const w = window as any
  if (typeof w.showSaveFilePicker === 'function' && pickerAllowed()) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName,
        types: [{ description: '存知数据包', accept: { 'application/json': ['.czdb'] } }],
      })
      const meta = await writeHandle(handle, text)
      return { handle, name: handle.name, text, ...meta }
    } catch (e) {
      const name = (e as { name?: string })?.name
      // 用户主动取消：什么都不做
      if (name === 'AbortError') return null
      // 无用户手势 / 权限被策略禁用 / 不支持：降级为浏览器下载
    }
  }
  downloadText(text, suggestedName, 'application/json')
  return { handle: null, name: suggestedName, text, lastModified: Date.now(), size: text.length }
}

const FILE_ERROR_TEXT: Record<string, string> = {
  AbortError: '操作已取消',
  NotAllowedError: '浏览器未授权访问该文件，请点「重新授权」后再试',
  SecurityError: '浏览器安全策略阻止了写入',
  NotFoundError: '文件已被移动或删除，请重新选择数据包',
  NoModificationAllowedError: '文件正被其它程序占用',
  NotReadableError: '文件无法读取',
  QuotaExceededError: '磁盘空间不足',
  InvalidStateError: '文件句柄已失效，请重新打开数据包',
  DataCloneError: '数据序列化失败',
}

/** 把浏览器的原生文件错误转成用户能看懂的中文提示 */
export function humanizeFileError(e: unknown): string {
  const err = e as { name?: string; message?: string } | undefined
  if (err?.name && FILE_ERROR_TEXT[err.name]) return FILE_ERROR_TEXT[err.name]
  const raw = (err?.message ?? '').trim()
  return raw ? raw.slice(0, 80) : '未知错误'
}

export function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  if (isNative()) {
    // 原生环境：没有浏览器下载，把导出文件直接写进本地 cunzhi 文件夹
    void writeLocalPackage(filename, text)
    return
  }
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function downloadBlob(blob: Blob, filename: string): void {  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
