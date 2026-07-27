<!-- ToolCard.svelte — tool call rendering with expand/collapse.
     Replaces kimi-web's ToolCall + ToolGroup + toolRegistry chain.
     Shows status, name, arg summary, timing, and expandable output.
     Enhanced: copy output button, JSON output pretty-render, status badge
     in header (not just the dot). -->
<script lang="ts">
  import type { ToolCall } from '../../types';
  import Icon from '../ui/Icon.svelte';
  import JsonTreeCard from './JsonTreeCard.svelte';
  import { toolSummary } from '../../lib/toolMeta';
  import { toast } from '../../stores/toast.svelte';
  import * as client from '../../stores/client.svelte';
  import SwarmCard from './SwarmCard.svelte';

  let {
    tool,
  }: {
    tool: ToolCall;
  } = $props();

  // Expand state: defaults to expanded when running. The $effect below
  // keeps it in sync when tool.status changes at runtime.
  let expanded = $state(false);

  // Auto-expand running tools; once completed, collapse by default.
  // Re-opens if the tool transitions back to running.
  $effect(() => {
    if (tool.status === 'running') expanded = true;
  });

  function toggle() {
    expanded = !expanded;
  }

  function copyOutput() {
    const text = tool.output?.join('\n') ?? '';
    if (!text) {
      toast.info('无输出可复制');
      return;
    }
    void navigator.clipboard.writeText(text).then(() => toast.ok('输出已复制'));
  }

  function copyCommand() {
    const text = bashCmd || tool.arg || '';
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => toast.ok('命令已复制'));
  }

  // Detect JSON output (first non-empty line starts with { or [).
  const isJsonOutput = $derived.by(() => {
    if (!tool.output || tool.output.length === 0) return false;
    const first = tool.output.find((l) => l.trim()) ?? '';
    const trimmed = first.trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
  });

  // Pretty-printed JSON (only if isJsonOutput).
  const prettyJson = $derived.by(() => {
    if (!isJsonOutput) return null;
    const raw = tool.output?.join('\n') ?? '';
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return null;
    }
  });

  // Extract file path from arg for click-to-preview.
  const filePath = $derived.by(() => {
    if (!tool.arg) return null;
    const trimmed = tool.arg.replace(/^[·\s]+/, '').trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return parsed.file_path ?? parsed.path ?? parsed.filePath ?? null;
      }
    } catch {
      // Not JSON — treat as path string.
    }
    if (/^[\w./-]+\.\w+$/.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('./')) {
      return trimmed.split(/\s+/)[0];
    }
    return null;
  });

  const isEditTool = $derived(['edit', 'write', 'multi_edit', 'multiedit'].includes(tool.name.toLowerCase()));

  const diffStats = $derived.by(() => {
    if (!isEditTool || !tool.output) return null;
    let added = 0, removed = 0;
    for (const line of tool.output) {
      if (line.startsWith('+') && !line.startsWith('+++')) added++;
      if (line.startsWith('-') && !line.startsWith('---')) removed++;
    }
    return added || removed ? { added, removed } : null;
  });

  // ---- Rich classification ----
  const kind = $derived.by(() => {
    const n = tool.name.toLowerCase();
    if (n.startsWith('mcp__')) return 'mcp';
    if (['bash', 'shell', 'execute', 'run', 'exec'].includes(n)) return 'bash';
    if (['edit', 'write', 'multi_edit', 'multiedit'].includes(n)) return 'edit';
    if (['read', 'readfile'].includes(n)) return 'read';
    if (['agentswarm', 'swarm'].includes(n)) return 'swarm';
    return 'generic';
  });

  // MCP：mcp__server__tool → { server, tool }
  const mcpParts = $derived.by(() => {
    if (kind !== 'mcp') return null;
    const parts = tool.name.split('__');
    if (parts.length < 3) return { server: parts[1] ?? 'mcp', tool: parts.slice(2).join('__') || tool.name };
    return { server: parts[1]!, tool: parts.slice(2).join('__') };
  });

  // Arg 的 JSON 解析（用于 Params 树状展示）
  const argJson = $derived.by(() => {
    const raw = (tool.arg ?? '').replace(/^[·\s]+/, '').trim();
    if (!raw || (!raw.startsWith('{') && !raw.startsWith('['))) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  const bashCmd = $derived.by(() => {
    if (kind !== 'bash') return '';
    const raw = (tool.arg ?? '').replace(/^[·\s]+/, '').trim();
    try {
      const parsed = JSON.parse(raw);
      return parsed.command ?? parsed.cmd ?? raw;
    } catch { return raw; }
  });

  // Edit/Read: numbered line sequence (enhanced diff-line coloring).
  const numberedLines = $derived.by(() => {
    if (!tool.output) return [];
    let ln = 0;
    return tool.output.map((line) => {
      const isAdd = line.startsWith('+') && !line.startsWith('+++');
      const isDel = line.startsWith('-') && !line.startsWith('---');
      const isMeta = line.startsWith('@@') || line.startsWith('+++') || line.startsWith('---');
      if (!isAdd) ln++;
      return { n: isAdd ? ln : ln, text: line, add: isAdd, del: isDel, meta: isMeta };
    });
  });

  // Tool icon by name / kind.
  function toolIcon(name: string): string {
    const n = name.toLowerCase();
    if (n.startsWith('mcp__')) return 'plugin';
    if (['bash', 'shell', 'execute'].includes(n)) return 'terminal';
    if (['read', 'readfile'].includes(n)) return 'file';
    if (['write', 'edit', 'multi_edit', 'multiedit'].includes(n)) return 'file-edit';
    if (['search', 'grep', 'glob'].includes(n)) return 'search';
    if (['task', 'agent'].includes(n)) return 'user';
    if (['agentswarm', 'swarm'].includes(n)) return 'bolt';
    if (['list', 'todolist', 'todowrite'].includes(n)) return 'check-list';
    return 'tool';
  }

  // Header 标签：MCP 用 mcp::server/tool，其余用 tool::name（mono）。
  const headLabel = $derived.by(() => {
    if (kind === 'mcp' && mcpParts) return `mcp::${mcpParts.server}/${mcpParts.tool}`;
    return `tool::${tool.name}`;
  });
</script>

<div class="tool-card kind-{kind}" class:expanded>
  <button class="tool-header" onclick={toggle} type="button">
    <span class="kind-ic"><Icon name={toolIcon(tool.name) as never} size="sm" /></span>
    <span class="tool-name mono">{headLabel}</span>
    {#if kind === 'mcp'}
      <span class="mcp-chip">MCP Server</span>
    {/if}
    {#if tool.arg && !argJson}
      {#if filePath}
        <span
          class="tool-arg tool-arg-link"
          title={filePath}
          role="link"
          tabindex="0"
          onclick={(e) => { e.stopPropagation(); client.client.openFilePreview(filePath); }}
          onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); client.client.openFilePreview(filePath); } }}
        >{toolSummary(tool.name, tool.arg)}</span>
      {:else}
        <span class="tool-arg" title={tool.arg}>{toolSummary(tool.name, tool.arg)}</span>
      {/if}
    {/if}
    {#if diffStats}
      <span class="diff-chip add">+{diffStats.added}</span>
      <span class="diff-chip del">−{diffStats.removed}</span>
    {/if}
    {#if tool.timing}
      <span class="tool-timing" class:ok={tool.status === 'ok'} class:err={tool.status === 'error'}>{tool.timing}</span>
    {/if}
    <span class="status-badge" class:sb-run={tool.status === 'running'} class:sb-ok={tool.status === 'ok'} class:sb-err={tool.status === 'error'}>
      {#if tool.status === 'running'}● 运行中{:else if tool.status === 'ok'}✓ 已成功{:else if tool.status === 'error'}✕ 失败{:else}{tool.status}{/if}
    </span>
    <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size="sm" />
  </button>

  {#if expanded && (argJson || (tool.output && tool.output.length > 0))}
    <div class="tool-expand-area">
      {#if argJson}
        <div class="params-box">
          <div class="params-label"><span>PARAMS</span><span class="params-fmt">JSON</span></div>
          <JsonTreeCard data={argJson} label="params.json" />
        </div>
      {/if}
      {#if tool.output && tool.output.length > 0}
        <div class="tool-output-toolbar">
          {#if kind === 'bash' && bashCmd}
            <button class="tool-action-btn" onclick={copyCommand} type="button" title="复制命令">
              <Icon name="copy" size="sm" /> 复制命令
            </button>
          {/if}
          <button class="tool-action-btn" onclick={copyOutput} type="button" title="复制输出">
            <Icon name="copy" size="sm" /> 复制输出
          </button>
        </div>
        {#if kind === 'swarm'}
          <SwarmCard {tool} />
        {:else if prettyJson}
          <!-- JSON 输出：树状卡片（可切 Raw） -->
          <div class="params-box">
            <div class="params-label"><span>RESULT</span><span class="params-fmt">JSON</span></div>
            <JsonTreeCard data={JSON.parse(tool.output?.join('\n') ?? 'null')} label="output.json" />
          </div>
        {:else if kind === 'bash'}
          <!-- Bash：mac 三点终端卡 -->
          <div class="term">
            <div class="term-head">
              <span class="term-dot d-r"></span>
              <span class="term-dot d-y"></span>
              <span class="term-dot d-g"></span>
              <span class="term-title">Bash Terminal</span>
              <span class="term-spacer"></span>
              {#if bashCmd}
                <button class="term-copy" onclick={copyCommand} type="button" title="复制命令"><Icon name="copy" size="sm" /></button>
              {/if}
            </div>
            <div class="term-body">
              {#if bashCmd}<div class="term-cmd"><span class="term-prompt">$</span>{bashCmd}</div>{/if}
              <div class="tool-output term-out">
                {#each tool.output.slice(0, 200) as line, i (i)}
                  <div class="output-line">{line}</div>
                {/each}
                {#if tool.output.length > 200}
                  <div class="output-truncated">… {tool.output.length - 200} more lines</div>
                {/if}
              </div>
            </div>
          </div>
        {:else if kind === 'edit'}
          <!-- 改动文件：带行号的 diff 视图 -->
          <div class="tool-output diff-view">
            {#each numberedLines.slice(0, 200) as line, i (i)}
              {#if line.meta}
                <div class="dline meta">{line.text}</div>
              {:else}
                <div class="dline" class:add={line.add} class:del={line.del}>
                  <span class="dln">{line.n}</span><span class="dtx">{line.text}</span>
                </div>
              {/if}
            {/each}
            {#if tool.output.length > 200}
              <div class="output-truncated">… {tool.output.length - 200} more lines</div>
            {/if}
          </div>
        {:else}
          <div class="tool-output" class:ln-view={kind === 'read'}>
            {#each tool.output.slice(0, 200) as line, i (i)}
              {#if kind === 'read'}
                <div class="dline"><span class="dln">{i + 1}</span><span class="dtx">{line}</span></div>
              {:else}
                <div class="output-line" class:add={line.startsWith('+') && !line.startsWith('+++')} class:del={line.startsWith('-') && !line.startsWith('---')}>
                  {line}
                </div>
              {/if}
            {/each}
            {#if tool.output.length > 200}
              <div class="output-truncated">… {tool.output.length - 200} more lines</div>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .tool-expand-area {
    animation: kimi-fade-in var(--duration-fast, 120ms) var(--ease-out, ease);
  }
  .tool-card {
    margin: 6px 0;
    border-radius: var(--g-radius-card, var(--r-lg));
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    background: var(--mat-surface-2, var(--l2));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    box-shadow: var(--elev-card, var(--toplight));
    overflow: hidden;
    transition: border-color var(--duration-fast) var(--ease);
  }
  .tool-card:hover {
    border-color: var(--bd2);
  }
  /* MCP 紫卡 */
  .kind-mcp.tool-card {
    border-color: color-mix(in srgb, var(--color-done) 30%, transparent);
  }

  .tool-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 9px 12px;
    border: none;
    background: transparent;
    color: var(--tx2);
    font-size: var(--text-xs);
    cursor: pointer;
    text-align: left;
    transition: background var(--duration-fast) var(--ease);
  }
  .tool-header:hover {
    background: var(--color-hover);
  }

  .tool-name {
    font-weight: var(--weight-semibold);
    color: var(--warn);
    flex: none;
    white-space: nowrap;
  }
  /* 类型着色小图标（generic=amber / mcp=purple / bash=slate / 其余=accent） */
  .kind-ic { display: inline-flex; flex: none; color: var(--warn); }
  .kind-mcp .kind-ic { color: var(--color-done); }
  .kind-bash .kind-ic { color: var(--tx3); }
  .kind-read .kind-ic,
  .kind-edit .kind-ic,
  .kind-swarm .kind-ic { color: var(--ac); }
  .kind-mcp .tool-name { color: var(--color-done); }
  .kind-bash .tool-name, .kind-read .tool-name, .kind-edit .tool-name, .kind-swarm .tool-name { color: var(--tx); }
  .mono { font-family: var(--font-mono, monospace); }

  .mcp-chip {
    flex: none;
    font-size: 9.5px;
    padding: 1px 7px;
    border-radius: var(--g-radius-chip, 999px);
    background: var(--color-done-soft);
    color: var(--color-done);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--color-done-bd, transparent);
  }

  /* 右对齐状态徽章（参考原型：✓ 已成功 / ● 运行中 / ✕ 失败） */
  .status-badge {
    margin-left: auto;
    flex: none;
    font-size: 9.5px;
    padding: 1px 7px;
    border-radius: var(--g-radius-chip, 999px);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) transparent;
    white-space: nowrap;
  }
  .status-badge.sb-run { background: var(--ac-soft); color: var(--ac); border-color: var(--ac-bd); }
  .status-badge.sb-ok { background: var(--ok-soft); color: var(--ok); border-color: color-mix(in srgb, var(--ok) 30%, transparent); }
  .status-badge.sb-err { background: var(--err-soft); color: var(--err); border-color: color-mix(in srgb, var(--err) 30%, transparent); }

  /* Params / Result 树状盒 */
  .params-box {
    border-top: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    padding: 8px 10px;
    background: var(--mat-surface-1, var(--l1));
  }
  .params-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 9px;
    letter-spacing: 0.06em;
    color: var(--tx3);
    font-family: var(--font-mono, monospace);
    margin-bottom: 6px;
    text-transform: uppercase;
  }
  .params-fmt { opacity: 0.7; }

  /* Output toolbar — copy buttons, floats above the output panel. */
  .tool-output-toolbar {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    padding: 5px 10px;
    background: var(--mat-surface-2, var(--l2));
    border-top: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    border-bottom: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
  }
  .tool-action-btn {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 9px;
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd2));
    border-radius: var(--g-radius-control, var(--r-sm));
    background: var(--mat-control-bg, var(--l1));
    box-shadow: var(--elev-control, none);
    color: var(--tx2);
    font-size: 10.5px;
    font-family: var(--font-mono, monospace);
    cursor: pointer;
    transition: color var(--duration-fast) var(--ease), border-color var(--duration-fast) var(--ease);
  }
  .tool-action-btn:hover {
    color: var(--tx); border-color: var(--ac);
  }

  .tool-arg {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 11px;
    opacity: 0.8;
    min-width: 0;
  }
  .tool-arg-link {
    cursor: pointer;
    color: var(--ac);
    text-decoration: underline;
    text-underline-offset: 2px;
    opacity: 1;
  }
  .tool-arg-link:hover {
    color: var(--ac-h);
  }
  .tool-timing {
    flex: none;
    color: var(--tx3);
    font-size: 10.5px;
    font-family: var(--font-mono);
    padding: 1px 5px;
    border-radius: var(--r-sm);
    transition: color var(--duration-fast) var(--ease);
  }
  .tool-timing.ok { color: var(--ok); }
  .tool-timing.err { color: var(--err); }

  .diff-chip {
    flex: none;
    font-size: 10px;
    padding: 1px 5px;
    border-radius: var(--g-radius-chip, var(--r-sm));
    font-weight: var(--weight-medium);
    font-family: var(--font-mono);
  }
  .diff-chip.add { background: var(--ok-soft); color: var(--ok); }
  .diff-chip.del { background: var(--err-soft); color: var(--err); }

  .tool-output {
    border-top: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    padding: 9px 12px;
    max-height: 300px;
    overflow-y: auto;
    background: var(--mat-surface-1, var(--l1));
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.65;
  }

  /* Bash mac 三点终端卡 */
  .term {
    border-top: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    border-radius: 0 0 var(--g-radius-card, 4px) var(--g-radius-card, 4px);
    overflow: hidden;
  }
  .term-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    background: var(--mat-surface-2, var(--l2));
    border-bottom: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    font-size: 10.5px;
    color: var(--tx3);
  }
  .term-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .term-dot.d-r { background: var(--err); opacity: 0.8; }
  .term-dot.d-y { background: var(--warn); opacity: 0.8; }
  .term-dot.d-g { background: var(--ok); opacity: 0.8; }
  .term-title { margin-left: 6px; font-weight: 600; color: var(--tx2); }
  .term-spacer { flex: 1; }
  .term-copy {
    border: none;
    background: transparent;
    color: var(--tx3);
    cursor: pointer;
    display: inline-flex;
    padding: 2px;
    border-radius: var(--g-radius-control, 4px);
  }
  .term-copy:hover { color: var(--tx); background: var(--color-hover); }
  .term-cmd {
    display: flex; align-items: center; gap: 7px;
    padding: 7px 12px;
    background: var(--mat-surface-1, var(--l1));
    font-family: var(--font-mono); font-size: 11px; color: var(--tx);
  }
  .term-prompt { color: var(--ok); font-weight: 700; }
  .term-out { border-top: none; }

  /* diff / 行号视图 */
  .dline { display: flex; white-space: pre; }
  .dln { flex: 0 0 30px; text-align: right; padding-right: 8px; color: var(--tx3); opacity: 0.55; user-select: none; }
  .dtx { flex: 1; padding-right: 8px; white-space: pre-wrap; word-break: break-all; }
  .dline.add { background: var(--ok-soft); }
  .dline.add .dtx { color: var(--ok); }
  .dline.del { background: var(--err-soft); }
  .dline.del .dtx { color: var(--err); }
  .dline.meta { color: var(--tx3); font-size: 10px; padding: 3px 0; background: var(--ac-soft); }
  .output-line {
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--tx2);
  }
  .output-line.add { color: var(--ok); background: var(--ok-soft); }
  .output-line.del { color: var(--err); background: var(--err-soft); }
  .output-truncated {
    color: var(--tx3);
    font-style: italic;
    padding-top: 4px;
  }
</style>
