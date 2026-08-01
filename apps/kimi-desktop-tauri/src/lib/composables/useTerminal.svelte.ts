// useTerminal.svelte.ts — Svelte 5 runes port of kimi-web's useTerminal.ts.
//
// Owns the lifecycle of a single interactive terminal for a session: lists or
// creates a terminal via REST, attaches over a dedicated WebSocket connection,
// forwards user input + resize over WS, and dispatches output/exit events to
// registered handlers (typically the xterm host). Mirrors the reference
// implementation 1:1 — only the reactivity layer changed (Vue refs → $state).
//
// Terminal output is intentionally NOT routed through the reducer / client
// store: it streams straight into the xterm buffer, matching kimi-web. The
// WS connection here is a module-level singleton keyed by sessionId, separate
// from the client store's main event stream — this matches kimi-web's layout
// (its useTerminal also holds a private module-level `conn`).

import type { AppTerminal, KimiEventConnection } from '../api/types';
import { getKimiWebApi } from '../api';

export interface TerminalHandle {
  terminal: () => AppTerminal | null;
  loading: () => boolean;
  error: () => string | null;
  connected: () => boolean;
  readOnly: () => boolean;
  start: (size?: { cols?: number; rows?: number }) => Promise<void>;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  close: () => Promise<void>;
  restart: () => Promise<void>;
  onOutput: (handler: (data: string) => void) => () => void;
  onExit: (handler: (exitCode: number | null) => void) => () => void;
  dispose: () => void;
}

// Module-level singleton connection cache, keyed by sessionId. Each entry
// holds the KimiEventConnection plus the handler Sets that all useTerminal
// instances for that session share. This avoids opening a new WS per panel
// mount while keeping the terminal side-channel off the main client store.
interface SessionChannel {
  conn: KimiEventConnection;
  outputHandlers: Set<(data: string) => void>;
  exitHandlers: Set<(exitCode: number | null) => void>;
  connected: boolean;
  refCount: number;
}
const channels = new Map<string, SessionChannel>();
const channelResetHandlers = new Set<() => void>();
let channelGeneration = 0;

export function resetTerminalChannels(): void {
  channelGeneration += 1;
  for (const channel of channels.values()) {
    try {
      channel.conn.close();
    } catch {
      // best-effort
    }
  }
  channels.clear();
  for (const handler of channelResetHandlers) handler();
}

function acquireChannel(
  sessionId: () => string,
  onConnectedChange: (v: boolean) => void,
  onOutput: (s: string, tid: string, data: string, seq: number) => void,
  onExit: (s: string, tid: string, exitCode: number | null) => void,
): SessionChannel | null {
  const sid = sessionId();
  if (!sid) return null;
  let ch = channels.get(sid);
  if (!ch) {
    const outputHandlers = new Set<(data: string) => void>();
    const exitHandlers = new Set<(exitCode: number | null) => void>();
    const api = getKimiWebApi();
    const conn = api.connectEvents({
      onConnectionChange: (v) => {
        if (ch) ch.connected = v;
        onConnectedChange(v);
      },
      onTerminalOutput: (s, tid, data, seq) => {
        if (s !== sid) return;
        onOutput(s, tid, data, seq);
        for (const h of outputHandlers) h(data);
      },
      onTerminalExit: (s, tid, exitCode) => {
        if (s !== sid) return;
        onExit(s, tid, exitCode);
        for (const h of exitHandlers) h(exitCode);
      },
      // The reducer event stream is owned by the client store; we only need
      // the terminal side-channel here. Provide a no-op onEvent so the api
      // layer does not double-dispatch (the store registers its own handlers).
      onEvent: () => {},
      onResync: () => {},
      onError: () => {},
    });
    ch = { conn, outputHandlers, exitHandlers, connected: false, refCount: 0 };
    channels.set(sid, ch);
  }
  ch.refCount += 1;
  return ch;
}

function releaseChannel(sid: string): void {
  const ch = channels.get(sid);
  if (!ch) return;
  ch.refCount -= 1;
  if (ch.refCount <= 0) {
    try {
      ch.conn.close();
    } catch {
      // best-effort
    }
    channels.delete(sid);
  }
}

export function useTerminal(sessionId: () => string): TerminalHandle {
  let terminal = $state<AppTerminal | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let connected = $state(false);
  let readOnly = $state(false);
  let lastSeq = 0;
  let channel: SessionChannel | null = null;
  let acquiredGeneration = -1;
  const outputHandlers = new Set<(data: string) => void>();
  const exitHandlers = new Set<(exitCode: number | null) => void>();

  // Per-instance handler bridge: route the shared channel's events into this
  // instance's state + the local terminal buffer (via registered handlers).
  function attachChannel(): void {
    if (channel && acquiredGeneration === channelGeneration) return;
    channel = null;
    channel = acquireChannel(
      sessionId,
      (v) => {
        connected = v;
      },
      (_s, _tid, _data, seq) => {
        lastSeq = Math.max(lastSeq, seq);
      },
      (_s, tid, exitCode) => {
        if (terminal?.id !== tid) return;
        readOnly = true;
        if (terminal) terminal = { ...terminal, status: 'exited', exitCode };
      },
    );
    acquiredGeneration = channelGeneration;
    if (channel) {
      for (const handler of outputHandlers) channel.outputHandlers.add(handler);
      for (const handler of exitHandlers) channel.exitHandlers.add(handler);
    }
  }

  /** Register a per-instance output handler. Returns an unsubscribe. */
  function onOutput(handler: (data: string) => void): () => void {
    outputHandlers.add(handler);
    if (!channel) attachChannel();
    channel?.outputHandlers.add(handler);
    return () => {
      outputHandlers.delete(handler);
      channel?.outputHandlers.delete(handler);
    };
  }

  function onExit(handler: (exitCode: number | null) => void): () => void {
    exitHandlers.add(handler);
    if (!channel) attachChannel();
    channel?.exitHandlers.add(handler);
    return () => {
      exitHandlers.delete(handler);
      channel?.exitHandlers.delete(handler);
    };
  }

  function handleChannelReset(): void {
    channel = null;
    acquiredGeneration = -1;
    connected = false;
    terminal = null;
    readOnly = false;
    lastSeq = 0;
    error = null;
  }

  channelResetHandlers.add(handleChannelReset);

  /** List existing terminals, reuse a running one, else create. */
  async function start(size?: { cols?: number; rows?: number }): Promise<void> {
    const sid = sessionId();
    if (!sid) return;
    if (!channel) attachChannel();
    loading = true;
    error = null;
    try {
      const api = getKimiWebApi();
      const existing = (await api.listTerminals(sid)).find((t) => t.status === 'running');
      const next =
        existing ??
        (await api.createTerminal(sid, {
          cols: size?.cols,
          rows: size?.rows,
        }));
      terminal = next;
      readOnly = next.status === 'exited';
      channel?.conn.terminalAttach(sid, next.id, lastSeq);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  function write(data: string): void {
    const sid = sessionId();
    if (!terminal || readOnly || !sid || !channel) return;
    channel.conn.terminalInput(sid, terminal.id, data);
  }

  function resize(cols: number, rows: number): void {
    const sid = sessionId();
    if (!terminal || readOnly || !sid || !channel) return;
    channel.conn.terminalResize(sid, terminal.id, cols, rows);
  }

  async function close(): Promise<void> {
    const sid = sessionId();
    if (!terminal || !sid || !channel) return;
    try {
      channel.conn.terminalClose(sid, terminal.id);
      await getKimiWebApi().closeTerminal(sid, terminal.id);
    } catch {
      // best-effort
    }
    readOnly = true;
    if (terminal) terminal = { ...terminal, status: 'exited' };
  }

  async function restart(): Promise<void> {
    const sid = sessionId();
    if (!terminal || !sid || !channel) return;
    channel.conn.terminalDetach(sid, terminal.id);
    terminal = null;
    readOnly = false;
    lastSeq = 0;
    await start();
  }

  function dispose(): void {
    const sid = sessionId();
    if (channel && terminal && sid) {
      try {
        channel.conn.terminalDetach(sid, terminal.id);
      } catch {
        // best-effort
      }
      // Remove this instance's handlers (registered via onOutput/onExit).
      // The Set entries are per-instance closures; clearing by identity match
      // is handled by the unsubscribe functions the caller already holds.
    }
    if (sid) releaseChannel(sid);
    channel = null;
    channelResetHandlers.delete(handleChannelReset);
    outputHandlers.clear();
    exitHandlers.clear();
  }

  return {
    terminal: () => terminal,
    loading: () => loading,
    error: () => error,
    connected: () => connected,
    readOnly: () => readOnly,
    start,
    write,
    resize,
    close,
    restart,
    onOutput,
    onExit,
    dispose,
  };
}
