// main.ts — bootstrap.
//
// Mounts the root App.svelte. The daemon connection is handled inside
// App.svelte via the `daemon` store, which calls the Rust `ensure_server`
// command on startup and renders loading / error / connected states.

import { mount } from 'svelte';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './lib/styles/global.css';
import App from './App.svelte';
import { initDesktopLog } from './lib/lib/desktopLog';

// Renderer log tee → <agent home>/logs/kimi-code-desktop.log, so the daemon's
// session export (`desktop: true`) has a desktop app log to bundle. Install
// before mounting so early warnings are captured. No-op outside Tauri.
initDesktopLog();

// Apply the persisted color scheme before mounting the app to avoid a flash.
// Default to dark if no preference is stored. All 7 themes are recognized.
const VALID_SCHEMES = ['light', 'dark', 'system', 'clay', 'neon', 'glass', 'aqua'];
try {
  const scheme = localStorage.getItem('kimi-web.color-scheme');
  document.documentElement.dataset.colorScheme =
    scheme && VALID_SCHEMES.includes(scheme) ? scheme : 'dark';
} catch {
  document.documentElement.dataset.colorScheme = 'dark';
}

// MCP debug plugin — local only (not committed). Lets AI agents screenshot,
// inspect DOM, click, type, and execute JS in the webview.
// Unconditional init: tauri dev mode may not set import.meta.env.DEV.
import('tauri-plugin-mcp')
  .then(({ setupPluginListeners }) => setupPluginListeners())
  .catch(() => {});

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
