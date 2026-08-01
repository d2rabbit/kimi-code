import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Kimi Code Desktop (Tauri) — Vite config.
//
// In Tauri mode the Svelte frontend talks directly to the daemon
// (http://127.0.0.1:58627) over REST + WS — no proxy needed (no CORS in a
// WebView). In browser dev mode (opening localhost:1420 in a real browser),
// CORS applies, so we proxy /api/v1/* through Vite to avoid it.
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
    watch: {
      // The Rust target/ tree holds hundreds of thousands of build artifacts;
      // watching it exhausts inotify (ENOSPC) on long-lived dev sessions.
      ignored: ['**/src-tauri/target/**'],
    },
    // Browser dev proxy: forward /api/v1/* to the daemon to bypass CORS.
    proxy: {
      '/api/v1': {
        target: daemonOrigin,
        changeOrigin: true,
        // Also proxy WebSocket upgrade requests.
        ws: true,
        // Preserve the Sec-WebSocket-Protocol header (bearer token subprotocol)
        // so the daemon can authenticate WS connections through the proxy.
        configureWsProxy(proxy) {
          proxy.on('proxyReqWs', (proxyReq, req, _socket, _options, _head) => {
            // The browser's WebSocket() sends the protocol in the upgrade request.
            // Vite's http-proxy may strip it — re-add from the raw request headers.
            const proto = req.headers['sec-websocket-protocol'];
            if (proto && !proxyReq.getHeader('Sec-WebSocket-Protocol')) {
              proxyReq.setHeader('Sec-WebSocket-Protocol', proto);
            }
          });
        },
      },
    },
  },
  // Ensure Svelte resolves to the browser/client entry, not the server stub.
  resolve: {
    conditions: ['browser'],
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Tauri webview production build target; keep inline for smaller bundle.
    target: 'esnext',
  },
});
