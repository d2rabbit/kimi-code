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
  sideChatVisible,
} from '../stores/client.svelte';
import { toast } from '../stores/toast.svelte';
import { shortcut } from './desktopFlag';

/** Issue tracker opened by /feedback and /bug (mirrors the CLI's fallback). */
const FEEDBACK_ISSUE_URL = 'https://github.com/MoonshotAI/kimi-code/issues';

/** Thinking levels accepted by /effort and /thinking (matches the model dialog). */
const THINKING_LEVELS = new Set(['off', 'on', 'minimal', 'low', 'medium', 'high', 'max']);

export type Client = typeof client;

export type DispatchResult =
  | { handled: true; message?: string }      // command consumed locally; optional toast message
  | { handled: false };                       // fall through to sendPrompt

const LOCAL_COMMANDS = new Set([
  '/clear', '/new', '/fork', '/compact', '/undo',
  '/init', '/theme', '/permission', '/settings',
  '/title', '/export-md', '/plan', '/auto', '/yolo',
  '/logout',
  // /goal and /swarm have GUI dialogs (text required, not pure toggles);
  // they surface a hint pointing the user at the Goal/Swarm buttons instead
  // of falling through to sendPrompt (which would just send the literal
  // text as a chat message).
  '/goal', '/swarm',
  // /btw opens the side chat in the right panel (optionally with a first prompt).
  '/btw',
  // /feedback (+/bug alias) opens the issue tracker; /secondary_model and
  // /effort (upstream rename of /thinking) map to GUI surfaces.
  '/feedback', '/bug', '/secondary_model', '/effort', '/thinking',
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
        return { handled: true, message: `使用 ${shortcut(',')} 打开设置 → 主题切换` };

      case '/permission':
        return { handled: true, message: `使用 ${shortcut(',')} 打开设置 → 权限模式` };

      case '/settings':
        return { handled: true, message: `使用 ${shortcut(',')} 打开设置面板` };

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

      case '/feedback':
      case '/bug': {
        // The CLI collects feedback in-app via the authenticated channel; the
        // desktop GUI has no feedback form, so open the issue tracker instead
        // (same fallback the CLI uses for signed-out users).
        if ('__TAURI_INTERNALS__' in globalThis) {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('open_external_url', { url: FEEDBACK_ISSUE_URL });
          return { handled: true, message: '已在浏览器中打开反馈页面' };
        }
        return { handled: true, message: `反馈渠道：${FEEDBACK_ISSUE_URL}` };
      }

      case '/secondary_model':
        // The settings panel owns the secondary-model picker (SettingsView).
        return { handled: true, message: `使用 ${shortcut(',')} 打开设置 → 辅助模型（子 Agent）` };

      case '/effort':
      case '/thinking': {
        const level = arg.trim().toLowerCase();
        if (!level) {
          return { handled: true, message: `用法：${cmd} <off|minimal|low|medium|high>，或在模型对话框中切换思考级别` };
        }
        if (!THINKING_LEVELS.has(level)) {
          return { handled: true, message: `未知思考级别：${level}（可选：off / minimal / low / medium / high）` };
        }
        c.setThinking(level);
        return { handled: true, message: `思考级别：${level}` };
      }

      case '/goal':
        // GUI surfaces this through the Goal mini-toggle → GoalDialog.
        // Sub-commands like /goal pause /goal resume /goal cancel are
        // handled by the GoalStrip banner's controls.
        return { handled: true, message: '点击底部 Goal 按钮设置或管理目标' };

      case '/swarm':
        // GUI surfaces this through the Swarm mini-toggle → SwarmDialog.
        return { handled: true, message: '点击底部 Swarm 按钮派发子智能体任务' };

      case '/btw': {
        // `/btw <question>` opens (creating if needed) the side chat and asks
        // it; bare `/btw` just opens/switches to the side-chat tab.
        if (!activeSessionId()) {
          return { handled: true, message: '先开始一个会话，再使用 /btw 侧聊' };
        }
        const hadTarget = sideChatVisible();
        await c.openSideChat(arg || undefined);
        if (arg) return { handled: true };
        return { handled: true, message: hadTarget ? '已切到侧聊（右栏）' : '侧聊已打开（右栏）' };
      }

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


