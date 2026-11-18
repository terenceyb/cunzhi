/**
 * 原生（Android / Capacitor）本地存储适配层
 * ---------------------------------------------------------------------------
 * 浏览器版：数据存 IndexedDB、偏好存 localStorage、文件靠 File System Access API。
 * 原生版：所有数据落到设备本地文件夹
 *   /sdcard/Android/data/cn.evanhub.cunzhi/files/cunzhi/
 * 使用 Capacitor Filesystem 的 Directory.External（应用专属外部目录）：
 *   - 无需任何运行时存储权限（Android 11+ 分区存储下应用对自己专属目录有完全读写权）
 *   - 卸载应用随应用一起清理；用户可用文件管理器在 Android/data/.../files/cunzhi 看到真实文件
 *   - 离线、不联网、不经任何托管平台
 *
 * 设计要点：
 * 1. 提供与 db.ts 同名的异步 KV 接口（get/set/del/clear），由 db.ts 在原生环境透明转发。
 * 2. 偏好是同步读取的，原生下用内存缓存 + 异步落盘；init() 时先从文件 hydrate 缓存。
 * 3. KV 值直接 JSON 序列化成文件；复杂对象（含 File handle 等不可序列化内容）会被安全跳过。
 */
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'

export const isNative = (): boolean =>
  typeof window !== 'undefined' && Capacitor.getPlatform() !== 'web'

/** 本地数据文件夹名（位于 Directory.External 根下） */
export const DATA_DIR = 'cunzhi'
/** 数据工作副本文件名 */
const DATA_FILE = 'data.czdb'
const PREFS_FILE = 'prefs.json'
const META_FILE = 'meta.json'
const SNAPSHOTS_FILE = 'snapshots.json'
const EMERGENCY_FILE = 'emergency.czdb'

const pathOf = (name: string) => `${DATA_DIR}/${name}`

let dirReady: Promise<void> | null = null
/** 确保 cunzhi 文件夹存在（幂等） */
export function ensureDataDir(): Promise<void> {
  if (!isNative()) return Promise.resolve()
  if (!dirReady) {
    dirReady = Filesystem.mkdir({ path: DATA_DIR, directory: Directory.External, recursive: true })
      .then(() => undefined)
      .catch(() => undefined)
  }
  return dirReady
}

/** 数据目录的绝对路径（用于「关于」页展示与提示） */
export async function dataDirPath(): Promise<string> {
  if (!isNative()) return ''
  await ensureDataDir()
  try {
    const uri = (await Filesystem.getUri({ path: DATA_DIR, directory: Directory.External })).uri
    return decodeURIComponent(uri.replace(/^file:\/\//, ''))
  } catch {
    return `/sdcard/Android/data/cn.evanhub.cunzhi/files/${DATA_DIR}`
  }
}

/** KV key → 本地文件名 */
function fileForKey(key: string): string {
  switch (key) {
    case 'data': return DATA_FILE
    case 'prefs': return PREFS_FILE
    case 'handleMeta': return META_FILE
    case 'snapshots': return SNAPSHOTS_FILE
    case 'emergency': return EMERGENCY_FILE
    // handle（File System Access handle）在原生下无意义，不落盘
    case 'handle': return ''
    default: return `${key.replace(/[^\w.-]/g, '_')}.json`
  }
}

/** 判断值是否可安全 JSON 序列化（File handle 等带循环引用/方法的对象要排除） */
function isSerializable(value: unknown): boolean {
  if (value === null || value === undefined) return true
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return true
  if (t !== 'object') return false
  try {
    JSON.stringify(value)
    return true
  } catch {
    return false
  }
}

export async function nativeGet<T>(key: string): Promise<T | undefined> {
  const file = fileForKey(key)
  if (!file) return undefined
  await ensureDataDir()
  try {
    const res = await Filesystem.readFile({ path: pathOf(file), directory: Directory.External, encoding: undefined })
    const text = typeof res.data === 'string' ? res.data : ''
    if (!text) return undefined
    return JSON.parse(text) as T
  } catch {
    return undefined
  }
}

export async function nativeSet(key: string, value: unknown): Promise<void> {
  const file = fileForKey(key)
  if (!file) return
  if (!isSerializable(value)) return
  await ensureDataDir()
  try {
    await Filesystem.writeFile({
      path: pathOf(file),
      data: JSON.stringify(value),
      directory: Directory.External,
      encoding: undefined,
      recursive: true,
    })
  } catch {
    /* 落盘失败不抛给业务层，避免中断编辑；flushDb 的错误状态由浏览器分支处理 */
  }
}

export async function nativeDel(key: string): Promise<void> {
  const file = fileForKey(key)
  if (!file) return
  await ensureDataDir()
  try {
    await Filesystem.deleteFile({ path: pathOf(file), directory: Directory.External })
  } catch {
    /* 文件不存在等，忽略 */
  }
}

export async function nativeClear(): Promise<void> {
  await ensureDataDir()
  for (const f of [DATA_FILE, PREFS_FILE, META_FILE, SNAPSHOTS_FILE, EMERGENCY_FILE]) {
    try {
      await Filesystem.deleteFile({ path: pathOf(f), directory: Directory.External })
    } catch {
      /* ignore */
    }
  }
}

/* ---------------- 偏好同步缓存（原生下） ---------------- */

let prefsCache: string | null = null

/** init() 里调用：从本地文件把偏好读入缓存（存原始 JSON 字符串） */
export async function hydratePrefsCache(): Promise<void> {
  if (!isNative()) return
  await ensureDataDir()
  try {
    const res = await Filesystem.readFile({ path: pathOf(PREFS_FILE), directory: Directory.External })
    prefsCache = typeof res.data === 'string' && res.data ? res.data : null
  } catch {
    prefsCache = null
  }
}

/** 同步读偏好缓存（原生，返回 JSON 字符串）；浏览器版返回 null 表示走 localStorage */
export function readPrefsCache(): string | null {
  if (!isNative()) return null
  return prefsCache
}

/** 同步写偏好缓存并异步落盘（原生） */
export function writePrefsCache(value: unknown): void {
  if (!isNative()) return
  prefsCache = JSON.stringify(value)
  void nativeSet('prefs', value)
}

/* ---------------- 本地数据包文件选择（原生） ---------------- */

export interface LocalFileEntry {
  name: string
  path: string
  size: number
}

/** 列出 cunzhi 文件夹里所有 .czdb 文件 */
export async function listLocalPackages(): Promise<LocalFileEntry[]> {
  await ensureDataDir()
  try {
    const res = await Filesystem.readdir({ path: DATA_DIR, directory: Directory.External })
    return res.files
      .filter((f) => f.type === 'file' && /\.czdb$/i.test(f.name))
      .map((f) => ({ name: f.name, path: pathOf(f.name), size: f.size ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

/** 读取 cunzhi 文件夹里某个数据包的文本 */
export async function readLocalPackage(path: string): Promise<string> {
  const res = await Filesystem.readFile({ path, directory: Directory.External })
  return typeof res.data === 'string' ? res.data : ''
}

/** 写数据包到 cunzhi 文件夹（自动补 .czdb） */
export async function writeLocalPackage(name: string, text: string): Promise<{ name: string; size: number }> {
  await ensureDataDir()
  const safe = name.endsWith('.czdb') ? name : `${name}.czdb`
  await Filesystem.writeFile({ path: pathOf(safe), data: text, directory: Directory.External, recursive: true })
  return { name: safe, size: new Blob([text]).size }
}
