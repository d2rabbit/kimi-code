import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Kimi Code Desktop (Tauri) — Vite config.
//
// Unlike kimi-web, there is no dev proxy: the Svelte frontend talks directly to
// the daemon (http://127.0.0.1:58627) over REST + WS. In dev the daemon must be
// running (start it via `kimi server run` or `pnpm dev:server` from the repo
// root); the frontend connects to it cross-origin (the daemon allows localhost).
const daemonOrigin = process.env.KIMI_SERVER_URL || 'http://127.0.0.1:58627';

export default defineConfig({
  plugins: [svelte()],
  define: {
    __KIMI_DAEMON_ORIGIN__: JSON.stringify(daemonOrigin),
    __KIMI_WEB_DESKTOP__: JSON.stringify(true),
  },
  // Tauri expects a fixed port; clear the default to avoid conflicts.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Tauri webview production build target; keep inline for smaller bundle.
    target: 'esnext',
  },
});
