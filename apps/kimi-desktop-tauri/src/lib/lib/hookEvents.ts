// hookEvents.ts — Kimi Code 官方 hook 事件目录（对齐 docs/zh/customization/hooks.md）。
//
// 每条 hook 规则：{ event, matcher?, command, timeout? }，写在 config.toml 的
// [[hooks]] 数组里（只允许这四个字段）。触发时 daemon 把事件详情以 JSON 经
// stdin 传给脚本；退出码 0 放行、2 阻断（stderr 为原因）、其他/超时 fail-open。
// 只有可阻断事件（PreToolUse / Stop / UserPromptSubmit）的返回值影响主流程。

export interface HookEventMeta {
  /** 官方事件名（config.toml 中的 event 值）。 */
  event: string;
  /** matcher 正则匹配的是什么的官方描述。 */
  matcher: string;
  /** 阻断后会影响主流程。 */
  canBlock: boolean;
  /** 官方行为说明。 */
  desc: string;
  /** matcher 输入框的占位示例。 */
  matcherPlaceholder?: string;
}

export const HOOK_EVENTS: HookEventMeta[] = [
  { event: 'UserPromptSubmit', matcher: '用户提交的文本内容', canBlock: true,
    desc: '用户发送消息时触发；返回文本会附加到上下文；若阻断，本轮不调用模型。',
    matcherPlaceholder: '如：.*（全部）或匹配特定关键词' },
  { event: 'UserPromptQueued', matcher: '排队消息的文本内容', canBlock: false,
    desc: '上一回合仍在运行、消息进入队列时触发；payload 含 prompt_id、prompt 和 queue_length（观察用）。' },
  { event: 'PreToolUse', matcher: '工具名', canBlock: true,
    desc: '工具调用前触发（权限检查前）；阻断后工具不会执行。',
    matcherPlaceholder: '如：Bash 或 Write|Edit' },
  { event: 'Stop', matcher: '空字符串', canBlock: true,
    desc: '模型准备结束本轮时触发；阻断后可追加一条消息让模型继续。' },
  { event: 'TurnStarted', matcher: '回合来源类型（user / task / system_trigger）', canBlock: false,
    desc: '新回合开始时触发；payload 含 turn_id、origin_kind、origin_name 和 prompt（观察用）。',
    matcherPlaceholder: '如：user' },
  { event: 'PostToolUse', matcher: '工具名', canBlock: false,
    desc: '工具成功执行后触发（观察用）。',
    matcherPlaceholder: '如：Bash' },
  { event: 'PostToolUseFailure', matcher: '工具名', canBlock: false,
    desc: '工具失败或被阻断后触发（观察用）。',
    matcherPlaceholder: '如：Bash' },
  { event: 'PermissionRequest', matcher: '工具名', canBlock: false,
    desc: '即将等待用户审批前触发（观察用）。',
    matcherPlaceholder: '如：Bash' },
  { event: 'PermissionResult', matcher: '工具名', canBlock: false,
    desc: '审批结束后触发（观察用）。',
    matcherPlaceholder: '如：Bash' },
  { event: 'SessionStart', matcher: 'startup 或 resume', canBlock: false,
    desc: '新会话启动或历史会话恢复后触发；payload 含 source、model 和 profile。',
    matcherPlaceholder: '如：startup|resume' },
  { event: 'SessionEnd', matcher: 'exit 或 archive', canBlock: false,
    desc: '会话关闭后触发；archive 表示会话被归档而非退出。',
    matcherPlaceholder: '如：exit|archive' },
  { event: 'SessionHeartbeat', matcher: '空字符串', canBlock: false,
    desc: '会话存活期间每 60 秒触发一次；仅当配置了本事件时计时器才会运行。payload 含 uptime_ms（观察用）。' },
  { event: 'SubagentStart', matcher: '子 Agent 名称', canBlock: false,
    desc: '子 Agent 开始运行前触发。',
    matcherPlaceholder: '如：coder' },
  { event: 'SubagentStop', matcher: '子 Agent 名称', canBlock: false,
    desc: '子 Agent 成功完成后触发（观察用）。',
    matcherPlaceholder: '如：coder' },
  { event: 'TaskStarted', matcher: '任务类型（agent / process / question）', canBlock: false,
    desc: '后台任务启动时触发；payload 含 task_id、description 和 detached（观察用）。',
    matcherPlaceholder: '如：agent' },
  { event: 'StopFailure', matcher: '错误类型', canBlock: false,
    desc: '本轮因错误失败后触发（观察用）。' },
  { event: 'Interrupt', matcher: '空字符串', canBlock: false,
    desc: '用户中断本轮时触发（例如按下 Esc）；超时或其他程序性中断不会触发，此时 Stop 也不会触发。payload 含 reason（观察用）。' },
  { event: 'PreCompact', matcher: 'manual 或 auto', canBlock: false,
    desc: '上下文压缩开始前触发；返回值被完全忽略。',
    matcherPlaceholder: '如：manual|auto' },
  { event: 'PostCompact', matcher: 'manual 或 auto', canBlock: false,
    desc: '上下文压缩完成后触发（观察用）。',
    matcherPlaceholder: '如：manual|auto' },
  { event: 'Notification', matcher: '通知类型（如 task.completed）', canBlock: false,
    desc: '后台任务状态变化时触发（观察用）。',
    matcherPlaceholder: '如：task\\.completed' },
];

export const HOOK_EVENT_MAP: ReadonlyMap<string, HookEventMeta> = new Map(
  HOOK_EVENTS.map((e) => [e.event, e]),
);

/** 一条 [[hooks]] 规则（官方只允许这四个字段）。 */
export interface HookDef {
  event: string;
  matcher?: string;
  command: string;
  timeout?: number;
}

/** 从 /config 的 unknown[] 投影出合法 hook 规则（丢弃残缺项）。 */
export function parseHooks(raw: unknown): HookDef[] {
  if (!Array.isArray(raw)) return [];
  const out: HookDef[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const h = item as Record<string, unknown>;
    if (typeof h['event'] !== 'string' || typeof h['command'] !== 'string' || h['command'] === '') {
      continue;
    }
    out.push({
      event: h['event'],
      command: h['command'],
      matcher: typeof h['matcher'] === 'string' ? h['matcher'] : undefined,
      timeout: typeof h['timeout'] === 'number' ? h['timeout'] : undefined,
    });
  }
  return out;
}
