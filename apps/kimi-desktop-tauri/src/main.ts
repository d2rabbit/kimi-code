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

// Apply the persisted color scheme before mounting the app to avoid a flash.
// This replaces the inline <script> that was blocked by Tauri's production CSP.
try {
  const scheme = localStorage.getItem('kimi-web.color-scheme');
  if (scheme === 'light' || scheme === 'dark' || scheme === 'system') {
    document.documentElement.dataset.colorScheme = scheme;
  }
} catch {
  // localStorage may be unavailable.
}

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
