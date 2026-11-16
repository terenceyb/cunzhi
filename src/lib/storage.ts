/**
 * 本地存储体检与清理
 * 只碰「可再生」的东西：Cache Storage 里的静态资源副本、sessionStorage 的临时状态。
 * IndexedDB 与人脉数据包是数据本体，只在报告里统计体积，永不删除。
 */

export type StorageReport = {
  /** Cache Storage 条目数 */
  cacheEntries: number
  /** Cache Storage 占用字节 */
  cacheBytes: number
  /** 可清理的 localStorage 键（非 prefs 的临时键） */
  localKeys: string[]
  /** sessionStorage 键数 */
  sessionKeys: number
  /** 浏览器估算的总占用与配额 */
  usage: number
  quota: number
  /** 数据包（IndexedDB + 附件）体积，只统计不清理 */
  dataBytes: number
}

const KEEP_LOCAL = new Set(['cunzhi.prefs.v1'])

function sizeOfString(s: string): number {
  return new Blob([s]).size
}

async function measureCaches(): Promise<{ entries: number; bytes: number }> {
  if (typeof caches === 'undefined') return { entries: 0, bytes: 0 }
  let entries = 0
  let bytes = 0
  const keys = await caches.keys()
  for (const key of keys) {
    const cache = await caches.open(key)
    const reqs = await cache.keys()
    entries += reqs.length
    for (const req of reqs) {
      const res = await cache.match(req)
      if (!res) continue
      try {
        const blob = await res.clone().blob()
        bytes += blob.size
      } catch {
        /* 跨源响应拿不到 body，跳过 */
      }
    }
  }
  return { entries, bytes }
}

/** 扫描：只读，不改任何数据 */
export async function scanStorage(dataBytes = 0): Promise<StorageReport> {
  const { entries, bytes } = await measureCaches()

  let usage = 0
  let quota = 0
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate()
      usage = est.usage ?? 0
      quota = est.quota ?? 0
    }
  } catch {
    /* 部分浏览器不支持 */
  }

  const localKeys: string[] = []
  let localBytes = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      if (KEEP_LOCAL.has(k)) continue
      if (!k.startsWith('cunzhi')) continue
      localKeys.push(k)
      localBytes += sizeOfString(localStorage.getItem(k) ?? '')
    }
  } catch {
    /* 隐私模式下可能抛错 */
  }

  let sessionKeys = 0
  let sessionBytes = 0
  try {
    sessionKeys = sessionStorage.length
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (!k) continue
      sessionBytes += sizeOfString(sessionStorage.getItem(k) ?? '')
    }
  } catch {
    /* ignore */
  }

  return {
    cacheEntries: entries,
    cacheBytes: bytes + localBytes + sessionBytes,
    localKeys,
    sessionKeys,
    usage,
    quota,
    dataBytes: Math.max(dataBytes, usage - (bytes + localBytes + sessionBytes)),
  }
}

/** 清理：返回释放的字节数 */
export async function cleanStorage(report: StorageReport | null): Promise<number> {
  let freed = report?.cacheBytes ?? 0

  if (typeof caches !== 'undefined') {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    } catch {
      freed -= report?.cacheBytes ?? 0
    }
  }

  try {
    for (const k of report?.localKeys ?? []) localStorage.removeItem(k)
  } catch {
    /* ignore */
  }

  try {
    sessionStorage.clear()
  } catch {
    /* ignore */
  }

  return Math.max(0, freed)
}
