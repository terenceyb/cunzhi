import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'cn.evanhub.cunzhi',
  appName: '存知',
  webDir: 'dist',
  // 不使用 server.url：资源全部打进 APK 本地 assets，离线可用，非 webapp
  android: {
    // AllowCleartext: 不需要；本地 assets 加载
    allowMixedContent: false,
  },
  plugins: {
    Filesystem: {
      // 本地数据根目录：EXTERNAL (/sdcard/Android/data/cn.evanhub.cunzhi/files) 下的 cunzhi 文件夹
      // 由 JS 层用 Directory.External + path:'cunzhi' 访问
    },
  },
}

export default config
