// config.ts — builds REST/WS URLs, manages stable clientId.
//
// Adapted from kimi-web for the Tauri desktop app. Unlike the web app there is
// no same-origin proxy: the Svelte frontend connects directly to the daemon
// origin (http://127.0.0.1:58627 by default). The origin is injected at build
// time via __KIMI_DAEMON_ORIGIN__ (defined in vite.config.ts), but can be
// overridden at runtime via setDaemonOrigin() once the Rust ensure_server
// command returns the real origin (the daemon port may differ from the default).

import { safeGetString, safeSetString, STORAGE_KEYS } from '../lib/storage';

const CLIENT_ID_KEY = STORAGE_KEYS.clientId;
const WEB_CLIENT_NAME = 'kimi-code-desktop';
const WEB_CLIENT_UI_MODE = 'desktop';

/** The daemon origin resolved at runtime (set by the daemon store after ensure_server). */
let runtimeDaemonOrigin: string | null = null;

/** Override the daemon origin at runtime (e.g. after the Rust side resolves the real port).
 *  Pass '' for same-origin (browser dev mode via Vite proxy). */
export function setDaemonOrigin(origin: string): void {
  // Empty string = same-origin (browser dev proxy). Keep as-is.
  runtimeDaemonOrigin = origin === '' ? '' : normalizeServerOrigin(origin);
}

export interface KimiApiConfig {
  serverHttpUrl: string;
  clientId: string;
  clientName: string;
  clientVersion: string;
  clientUiMode: string;
}

export function readKimiApiConfig(): KimiApiConfig {
  return {
    serverHttpUrl: normalizeServerOrigin(daemonOrigin()),
    clientId: getClientId(),
    clientName: WEB_CLIENT_NAME,
    clientVersion: webClientVersion(),
    clientUiMode: WEB_CLIENT_UI_MODE,
  };
}

// The daemon origin comes from (in priority order):
//  1. runtimeDaemonOrigin — set by setDaemonOrigin() after the Rust ensure_server
//     command returns the real origin (the daemon may bind a non-default port).
//  2. __KIMI_DAEMON_ORIGIN__ — injected at build time by Vite (default 127.0.0.1:58627).
//  3. fallback — the well-known default.
function daemonOrigin(): string {
  // runtimeDaemonOrigin can be '' (browser dev mode, same-origin via proxy).
  if (runtimeDaemonOrigin !== null) return runtimeDaemonOrigin;
  if (typeof __KIMI_DAEMON_ORIGIN__ !== 'undefined') return __KIMI_DAEMON_ORIGIN__;
  return 'http://127.0.0.1:58627';
}

export function normalizeServerOrigin(value: string | undefined): string {
  // Empty string = same-origin (browser dev proxy). Preserve it.
  if (value === '') return '';
  const raw = value && value.trim() ? value : daemonOrigin();
  const url = new URL(raw);
  url.pathname = url.pathname.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

/** Strip the scheme for a compact display origin: `http://127.0.0.1:58627` → `127.0.0.1:58627`. */
function shortOrigin(origin: string): string {
  return origin.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function serverEndpointLabel(): string {
  return shortOrigin(daemonOrigin());
}

// The real server serves everything (incl. healthz + ws) under the /api/v1 prefix.
// Empty origin = same-origin (browser dev proxy).
export function buildRestUrl(origin: string, path: string): string {
  return `${origin}/api/v1${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildWsUrl(origin: string, clientId: string, token?: string): string {
  // Empty origin = same-origin; use location to build an absolute URL for WebSocket.
  const base = origin || (typeof location !== 'undefined' ? location.origin : '');
  const url = new URL(`${base}/api/v1/ws`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('client_id', clientId);
  // In browser mode (no Tauri), the Vite proxy strips Sec-WebSocket-Protocol.
  // Pass the token as a query param so the daemon can authenticate the upgrade.
  if (token && !origin && typeof location !== 'undefined') {
    url.searchParams.set('token', token);
  }
  return url.toString();
}

function getClientId(): string {
  const stored = safeGetString(CLIENT_ID_KEY);
  if (stored) return stored;
  const generated = `web_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  safeSetString(CLIENT_ID_KEY, generated);
  return generated;
}

function webClientVersion(): string {
  return '0.1.0-internal';
}
