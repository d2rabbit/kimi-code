// daemon.svelte.ts — daemon connection state store.
//
// Uses Svelte 5 runes ($state). On startup, calls the Rust `ensure_server`
// command to start (or reuse) the shared Kimi daemon, then reads the bearer
// token so the frontend can authenticate.
//
// Phase 1: just manages connection state + origin. The API layer (REST + WS)
// will be wired in Phase 2 and consume `origin` + `token` from this store.

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type DaemonStatus = 'connecting' | 'connected' | 'error';

interface DaemonState {
  status: DaemonStatus;
  /** Daemon origin, e.g. "http://127.0.0.1:58627". Set when connected. */
  origin: string | null;
  /** Bearer token read from ~/.kimi-code/server.token. May be null. */
  token: string | null;
  /** Error message when status === 'error'. */
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

  /** Start the daemon connection flow. Call once on app mount. */
  async connect(): Promise<void> {
    // Only register the event listener once, not on every retry.
    if (this.unlisteners.length === 0) {
      this.unlisteners.push(
        await listen<string>('daemon:error', (event) => {
          if (this.state.status !== 'connected') {
            this.state.status = 'error';
            this.state.error = event.payload;
          }
        }),
      );
    }

    try {
      // The frontend is the sole caller of ensure_server — the Rust setup()
      // intentionally does NOT spawn a duplicate background call.
      const result = await invoke<{ origin: string }>('ensure_server');
      const token = await invoke<string | null>('read_server_token');
      this.state.status = 'connected';
      this.state.origin = result.origin;
      this.state.token = token;
    } catch (e) {
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
