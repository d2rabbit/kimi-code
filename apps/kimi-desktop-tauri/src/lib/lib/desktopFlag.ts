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

/**
 * The keyboard modifier symbol users expect to see in shortcuts.
 * - macOS: '⌘' (Command)
 * - Linux/Windows: 'Ctrl'
 *
 * Use this in UI labels (button hints, settings pages, toasts). Key event
 * handlers should keep matching both metaKey and ctrlKey — see `matchMod()`
 * below.
 */
export const modKeySymbol = isMacosDesktop ? '⌘' : 'Ctrl';

/**
 * Build a platform-appropriate shortcut string from a key letter, e.g.
 * `shortcut('K')` → '⌘K' on macOS, 'Ctrl+K' elsewhere.
 */
export function shortcut(letter: string): string {
  return isMacosDesktop ? `⌘${letter}` : `Ctrl+${letter}`;
}

/**
 * Match a keyboard event against the platform-native modifier.
 * Use this in keydown handlers instead of `(e.metaKey || e.ctrlKey)` when
 * you want strict platform behavior (e.g. only Cmd on macOS, only Ctrl on
 * Linux/Windows). Most existing handlers accept both — keep using OR for
 * those; this helper is for cases where the distinction matters.
 */
export function matchMod(e: KeyboardEvent): boolean {
  return isMacosDesktop ? e.metaKey : e.ctrlKey;
}

