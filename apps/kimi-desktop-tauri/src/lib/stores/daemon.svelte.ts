// daemon.svelte.ts — daemon connection state store.
//
// Uses Svelte 5 runes ($state). On startup:
// - In Tauri mode: the app owns its embedded agent (Rust spawns it as a
//   private child process with an isolated home and an ephemeral port).
//   Origin + token come from Rust over IPC — we NEVER probe the well-known
//   shared-daemon port or attach to a foreign daemon.
// - In browser mode: use same-origin Vite proxy.

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { setCredential } from '../api/daemon/serverAuth';

export type DaemonStatus = 'connecting' | 'connected' | 'error';

/** How long to wait for a healthz response before declaring the agent down. */
const HEALTH_CHECK_TIMEOUT_MS = 3_000;

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

  /** Check if the agent at the given origin is healthy. */
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
        const res = await fetch('/api/v1/healthz');
        if (!res.ok) throw new Error(`healthz returned ${res.status}`);
        this.state.status = 'connected';
        this.state.origin = origin;
      } catch (error) {
        this.state.status = 'error';
        this.state.error = error instanceof Error ? error.message : String(error);
      }
      return;
    }

    // --- Tauri mode: app-owned embedded agent ---
    // Rust spawns the embedded SEA (private home + ephemeral port) and reports
    // the origin; the token lives under the agent's private home. No fallback
    // to any independently started daemon — by design there is none.
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

      const [{ origin }, token] = await Promise.all([
        invoke<{ origin: string }>('ensure_server'),
        invoke<string | null>('read_server_token').catch(() => null),
      ]);
      if (token) {
        this.state.token = token;
        setCredential(token);
      }
      // Final confirmation from the WebView side (Rust already health-checked,
      // but this proves reachability from our origin context, incl. CSP).
      if (!(await this.checkHealth(origin))) {
        throw new Error(`embedded agent at ${origin} is not reachable from the app`);
      }
      this.state.status = 'connected';
      this.state.origin = origin;
    } catch (error) {
      this.state.status = 'error';
      this.state.error = error instanceof Error ? error.message : String(error);
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
