// notify.ts — 系统通知封装（tauri-plugin-notification）。
// 首次调用时请求权限；浏览器/dev 模式降级为 no-op。

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

const isTauri = '__TAURI_INTERNALS__' in globalThis;
let permissionChecked = false;
let granted = false;

/** 发送一条系统通知（无权限或浏览器环境下静默忽略）。 */
export async function notify(title: string, body: string): Promise<void> {
  if (!isTauri) return;
  try {
    if (!permissionChecked) {
      granted = await isPermissionGranted();
      if (!granted) {
        granted = (await requestPermission()) === 'granted';
      }
      permissionChecked = true;
    }
    if (!granted) return;
    sendNotification({ title, body });
  } catch {
    // 通知失败不影响主流程
  }
}
