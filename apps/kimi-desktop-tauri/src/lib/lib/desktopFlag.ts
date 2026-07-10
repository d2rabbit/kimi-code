// desktopFlag.ts — desktop environment detection for the Tauri app.
//
// In the Tauri desktop app we are ALWAYS desktop. Platform is detected via
// the @tauri-apps/plugin-os API (or navigator.platform as fallback).

import { platform as tauriPlatform } from '@tauri-apps/plugin-os';

function detectPlatform(): string {
  try {
    // tauriPlatform() returns 'macos' | 'windows' | 'linux' | etc.
    const p = tauriPlatform();
    if (p === 'macos') return 'darwin';
    if (p === 'windows') return 'win32';
    return p;
  } catch {
    return typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('mac')
      ? 'darwin'
      : 'win32';
  }
}

const platform = detectPlatform();

/** Always true in the Tauri app. */
export const isDesktop = true;

/** True only on macOS — used to reserve space for the floating traffic lights. */
export const isMacosDesktop = platform === 'darwin';

/** Current platform ('darwin' | 'win32' | 'linux'). */
export const desktopPlatform = platform;
