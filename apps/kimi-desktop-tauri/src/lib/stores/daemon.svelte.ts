// daemon.svelte.ts — daemon connection state store.
//
// Uses Svelte 5 runes ($state). On startup:
// - In Tauri mode: read the server token via IPC, then directly fetch
//   healthz to check if the daemon is alive (bypassing ensure_server IPC
//   which can hang). Falls back to ensure_server only if daemon is down.
// - In browser mode: use same-origin Vite proxy.

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { setCredential } from '../api/daemon/serverAuth';

export type DaemonStatus = 'connecting' | 'connected' | 'error';

/** The well-known daemon port (matches kimi-code default). */
const DAEMON_PORT = 58627;
const DAEMON_ORIGIN = `http://127.0.0.1:${DAEMON_PORT}`;
/** How long to wait for a healthz response before declaring the daemon down. */
const HEALTH_CHECK_TIMEOUT_MS = 3_000;
/** How long to wait for ensure_server IPC before giving up. */
const ENSURE_SERVER_TIMEOUT_MS = 15_000;

interface DaemonState {
  status: DaemonStatus;
  origin: string | null;
  token: string | null;
  error: string | null;
}

class DaemonStore {
  state = $state<DaemonState>({
    status: 'connecting',
    origin: null,
    token: null,
    error: null,
  });

  private unlisteners: UnlistenFn[] = [];

  /** Check if the daemon at the given origin is healthy. */
  private async checkHealth(origin: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
      const res = await fetch(`${origin}/api/v1/healthz`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return false;
      const data = await res.json();
      return data?.code === 0 && data?.data?.ok === true;
    } catch {
      return false;
    }
  }

  /** Start the daemon connection flow. Call once on app mount. */
  async connect(): Promise<void> {
    const isTauri = '__TAURI_INTERNALS__' in globalThis;

    // --- Browser dev mode: same-origin via Vite proxy ---
    if (!isTauri) {
      try {
        const origin = ''; // same-origin → Vite proxy handles routing
        // Read token from localStorage or URL fragment.
        const urlToken = new URLSearchParams(location.search).get('token');
        const localToken = localStorage.getItem('kimi-dev-token');
        const fragmentToken = (() => {
          const hash = location.hash ?? '';
          if (!hash.startsWith('#')) return null;
          const params = new URLSearchParams(hash.slice(1));
          const t = params.get('token');
          if (t) {
            // Scrub the fragment for security.
            history.replaceState(null, '', location.pathname + location.search);
          }
          return t;
        })();
        const token = urlToken ?? fragmentToken ?? localToken;
        if (token) {
          setCredential(token);
          this.state.token = token;
        }
        // Verify daemon is alive via proxy.
        void await this.checkHealth('/api/v1/healthz'.replace('/api/v1', '') + 'api/v1/healthz');
        // Simpler: just fetch /api/v1/healthz (same-origin)
        const res = await fetch('/api/v1/healthz');
        if (!res.ok) throw new Error(`healthz returned ${res.status}`);
        this.state.status = 'connected';
        this.state.origin = origin;
      } catch (e) {
        this.state.status = 'error';
        this.state.error = e instanceof Error ? e.message : String(e);
      }
      return;
    }

    // --- Tauri mode ---
    // Step 1: Read the server token via IPC (fast, reliable).
    let token: string | null = null;
    try {
      token = await invoke<string | null>('read_server_token');
    } catch {
      // Non-fatal — token may not exist yet.
    }
    if (token) {
      this.state.token = token;
      setCredential(token);
    }

    // Step 2: Directly check if the daemon is already running (bypasses
    // ensure_server IPC which can hang). This is the fast path — if the
    // daemon is healthy, we skip the slow startup entirely.
    const isHealthy = await this.checkHealth(DAEMON_ORIGIN);
    if (isHealthy) {
      this.state.status = 'connected';
      this.state.origin = DAEMON_ORIGIN;
      return;
    }

    // Step 3: Daemon is not running — use ensure_server IPC to start it,
    // with a timeout so we don't hang forever.
    try {
      // Register error listener once.
      if (this.unlisteners.length === 0) {
        try {
          this.unlisteners.push(
            await listen<string>('daemon:error', (event) => {
              if (this.state.status !== 'connected') {
                this.state.status = 'error';
                this.state.error = event.payload;
              }
            }),
          );
        } catch {
          // listen may fail in some Tauri versions — non-fatal.
        }
      }

      const ensurePromise = invoke<{ origin: string }>('ensure_server');
      const result = await Promise.race([
        ensurePromise,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('ensure_server timed out — daemon may already be running on a different port')),
            ENSURE_SERVER_TIMEOUT_MS,
          ),
        ),
      ]);
      this.state.status = 'connected';
      this.state.origin = result.origin;
    } catch (e) {
      // Last resort: try direct healthz one more time (daemon might have
      // started during the ensure_server timeout).
      const retryHealthy = await this.checkHealth(DAEMON_ORIGIN);
      if (retryHealthy) {
        this.state.status = 'connected';
        this.state.origin = DAEMON_ORIGIN;
        return;
      }
      this.state.status = 'error';
      this.state.error = e instanceof Error ? e.message : String(e);
    }
  }

  /** Retry the connection (called from the error screen's "Retry" button). */
  async retry(): Promise<void> {
    this.state.status = 'connecting';
    this.state.error = null;
    await this.connect();
  }

  /** Clean up event listeners. */
  destroy(): void {
    for (const unlisten of this.unlisteners) {
      unlisten();
    }
    this.unlisteners = [];
  }
}

export const daemon = new DaemonStore();
