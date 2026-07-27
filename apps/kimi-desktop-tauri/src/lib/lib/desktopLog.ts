// desktopLog.ts — 渲染进程日志落盘到 <agent home>/logs/kimi-code-desktop.log，
// 供 kap-server 会话导出（客户端传 `desktop: true` 时）打包进诊断包。
// 行格式对齐服务端日志样例：`<ISO 时间> <LEVEL 左对齐 5 字符> [renderer] <消息>`
//（见 packages/kap-server/test/sessions.test.ts 的导出断言）。
// 只采集 warn/error 与未处理异常（info/log 太吵）；批量经 Tauri IPC 追加，
// 任何失败静默——诊断是好意，绝不能影响应用本身。

import { invoke } from '@tauri-apps/api/core';

type Level = 'WARN' | 'ERROR';

const FLUSH_INTERVAL_MS = 2000;
const MAX_MESSAGE_CHARS = 500;

let buffer: string[] = [];
let timer: number | undefined;
let installed = false;

// Minimal secret hygiene: never persist bearer tokens or API keys that a
// component accidentally logged.
function redact(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-[redacted]');
}

function formatArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack ?? arg.message;
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

function push(level: Level, args: unknown[]): void {
  const message = redact(args.map(formatArg).join(' ')).slice(0, MAX_MESSAGE_CHARS);
  buffer.push(`${new Date().toISOString()} ${level.padEnd(5)} [renderer] ${message}`);
  timer ??= globalThis.setTimeout(flush, FLUSH_INTERVAL_MS);
}

function flush(): void {
  timer = undefined;
  if (buffer.length === 0) return;
  const lines = buffer;
  buffer = [];
  void invoke('append_desktop_log', { lines }).catch(() => {});
}

/** Install the console tee + global error hooks. No-op outside Tauri. */
export function initDesktopLog(): void {
  if (installed) return;
  if (!('__TAURI_INTERNALS__' in globalThis)) return;
  installed = true;

  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      push(level.toUpperCase() as Level, args);
      original(...args);
    };
  }
  globalThis.addEventListener('error', (event) => {
    push('ERROR', [
      'uncaught',
      event.message,
      `${event.filename ?? ''}:${event.lineno ?? 0}:${event.colno ?? 0}`,
    ]);
  });
  globalThis.addEventListener('unhandledrejection', (event) => {
    push('ERROR', ['unhandledrejection', event.reason]);
  });
  // Best-effort final flushes — pending lines would otherwise die with the page.
  globalThis.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
