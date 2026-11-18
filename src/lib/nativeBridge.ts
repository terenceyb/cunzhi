/**
 * 安卓原生桥：状态栏主题同步 + SAF 数据包选择。
 * Web 端所有调用都是安全的空操作，业务层无需分支判断。
 */
import { registerPlugin } from '@capacitor/core'
import { isNative } from './nativeFs'

interface CunzhiNativeInterface {
  setStatusBar(options: { color: string; light: boolean }): Promise<void>
  pickPackage(): Promise<{ name: string; path: string; size: number }>
  isFirstLaunch(): Promise<{ first: boolean }>
}

const CunzhiNative = registerPlugin<CunzhiNativeInterface>('CunzhiNative')

export interface PickedNativePackage {
  name: string
  path: string
  size: number
}

/** 状态栏失败不应影响任何业务，静默降级 */
export async function nativeSetStatusBar(color: string, light: boolean): Promise<void> {
  if (!isNative()) return
  try {
    await CunzhiNative.setStatusBar({ color, light })
  } catch {
    /* ignore */
  }
}

/** 通过系统文件浏览器从任意文件夹选择数据包；原生层会自动复制到 cunzhi 文件夹 */
export async function nativePickPackage(): Promise<PickedNativePackage | null> {
  if (!isNative()) return null
  try {
    return await CunzhiNative.pickPackage()
  } catch (e) {
    const message = (e as { message?: string } | undefined)?.message ?? ''
    if (message.includes('cancelled')) return null
    throw e
  }
}

let firstLaunchPromise: Promise<boolean | null> | null = null

/** 安装后首次打开：原生层同步落盘标记；同进程只问一次，兼容 React 严格模式双调用 */
export function nativeIsFirstLaunch(): Promise<boolean | null> {
  if (!isNative()) return Promise.resolve(null)
  if (!firstLaunchPromise) {
    firstLaunchPromise = CunzhiNative.isFirstLaunch()
      .then((r) => !!r.first)
      .catch(() => null)
  }
  return firstLaunchPromise
}
