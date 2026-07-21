// dispatchSlash.ts — client-side slash command dispatcher.
//
// Mirrors `apps/kimi-code/src/tui/commands/dispatch.ts` but only for the
// subset of commands that have a meaningful client-side effect in the
// desktop GUI. Commands not handled here fall through to sendPrompt() and
// the daemon interprets them (so `/init <text>`, `/goal <text>`, etc. keep
// working without us duplicating the backend logic).
//
// Returns `true` if the command was handled locally and the composer should
// be cleared; `false` if the input should fall through to sendPrompt().

import {
  client,
  activeSessionId,
  planMode,
} from '../stores/client.svelte';
import { toast } from '../stores/toast.svelte';

export type Client = typeof client;

export type DispatchResult =
  | { handled: true; message?: string }      // command consumed locally; optional toast message
  | { handled: false };                       // fall through to sendPrompt

const LOCAL_COMMANDS = new Set([
  '/clear', '/new', '/fork', '/compact', '/undo',
  '/init', '/theme', '/permission', '/settings',
  '/title', '/export-md', '/plan', '/auto', '/yolo',
  '/logout',
]);

/** Quick guard: does this input string look like a local slash command? */
export function looksLikeLocalSlash(input: string): boolean {
  if (!input.startsWith('/')) return false;
  const head = input.split(/\s/, 1)[0] ?? '';
  return LOCAL_COMMANDS.has(head);
}

/**
 * Dispatch a parsed `{ cmd, arg }` against the client. Returns whether it was
 * handled locally. Caller is responsible for clearing the composer when
 * handled=true; this helper surfaces the toast itself on success.
 */
export async function dispatchSlash(
  c: Client,
  cmd: string,
  arg: string,
): Promise<DispatchResult> {
  try {
    switch (cmd) {
      case '/clear':
      case '/new':
        // arg is ignored — desktop has no named-new-session UX; just clear.
        c.clearActiveSession();
        return { handled: true, message: '已开始新会话' };

      case '/fork':
        await c.forkSession();
        return { handled: true, message: '已 fork 当前会话' };

      case '/compact': {
        // Empty arg means "summarize"; non-empty means use as instruction.
        await c.compact(arg.trim() || undefined);
        return { handled: true, message: '对话已压缩' };
      }

      case '/undo': {
        const count = parseInt(arg, 10);
        await c.undo(Number.isFinite(count) && count > 0 ? count : 1);
        return { handled: true, message: '已撤销最近一轮' };
      }

      case '/init':
        // init takes a goal text — pass through to backend (agent will read
        // the project, not the GUI's job). Fall through with the original text.
        return { handled: false };

      case '/theme':
        // No GUI theme picker pops from composer — surface a hint.
        return { handled: true, message: '使用 ⌘, 打开设置 → 主题切换' };

      case '/permission':
        return { handled: true, message: '使用 ⌘, 打开设置 → 权限模式' };

      case '/settings':
        return { handled: true, message: '使用 ⌘, 打开设置面板' };

      case '/title': {
        const t = arg.trim();
        if (!t) return { handled: true, message: '用法：/title <新标题>' };
        const sid = activeSessionId();
        if (!sid) return { handled: true, message: '没有活动会话' };
        await c.renameSession(sid, t);
        return { handled: true, message: `已重命名为：${t}` };
      }

      case '/export-md': {
        // Delegate to the backend agent (it has file-write access); the agent
        // path receives the original /export-md <path> instruction.
        return { handled: false };
      }

      case '/plan':
        if (!planMode()) c.togglePlanMode();
        return { handled: true, message: '计划模式：开' };

      case '/auto':
        c.setPermission('auto');
        return { handled: true, message: '权限模式：自动批准' };

      case '/yolo':
        c.setPermission('yolo');
        return { handled: true, message: '权限模式：YOLO（全部自动批准）' };

      case '/logout':
        await c.logout();
        return { handled: true, message: '已退出登录' };

      default:
        return { handled: false };
    }
  } catch (e) {
    toast.err(`/${cmd.slice(1)} 失败：${e instanceof Error ? e.message : String(e)}`);
    return { handled: true };  // consume to avoid double-send
  }
}

/**
 * High-level entry: parse a raw input string, run dispatchSlash, show toast
 * on success. Returns true if the composer should clear.
 */
export async function tryDispatchSlash(input: string): Promise<boolean> {
  if (!looksLikeLocalSlash(input)) return false;
  const spaceIdx = input.indexOf(' ');
  const cmd = spaceIdx === -1 ? input : input.slice(0, spaceIdx);
  const arg = spaceIdx === -1 ? '' : input.slice(spaceIdx + 1);
  const r = await dispatchSlash(client, cmd, arg);
  if (r.handled && r.message) toast.ok(r.message);
  return r.handled;
}


