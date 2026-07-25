<!-- ToolCard.svelte — tool call rendering with expand/collapse.
     Replaces kimi-web's ToolCall + ToolGroup + toolRegistry chain.
     Shows status, name, arg summary, timing, and expandable output.
     Enhanced: copy output button, JSON output pretty-render, status badge
     in header (not just the dot). -->
<script lang="ts">
  import type { ToolCall } from '../../types';
  import StatusDot from '../ui/StatusDot.svelte';
  import Chip from '../ui/Chip.svelte';
  import Icon from '../ui/Icon.svelte';
  import { toolLabel, toolSummary } from '../../lib/toolMeta';
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
    if (['bash', 'shell', 'execute', 'run', 'exec'].includes(n)) return 'bash';
    if (['edit', 'write', 'multi_edit', 'multiedit'].includes(n)) return 'edit';
    if (['read', 'readfile'].includes(n)) return 'read';
    if (['agentswarm', 'swarm'].includes(n)) return 'swarm';
    return 'generic';
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

  // Status badge label (alongside the colored dot).
  const statusLabel = $derived.by(() => {
    switch (tool.status) {
      case 'running': return '运行中';
      case 'ok': return '完成';
      case 'error': return '失败';
      default: return tool.status;
    }
  });

  // Tool icon by name.
  function toolIcon(name: string): string {
    const n = name.toLowerCase();
    if (['bash', 'shell', 'execute'].includes(n)) return 'terminal';
    if (['read', 'readfile'].includes(n)) return 'file';
    if (['write', 'edit', 'multi_edit', 'multiedit'].includes(n)) return 'file-edit';
    if (['search', 'grep', 'glob'].includes(n)) return 'search';
    if (['task', 'agent'].includes(n)) return 'user';
    if (['agentswarm', 'swarm'].includes(n)) return 'bolt';
    if (['list', 'todolist', 'todowrite'].includes(n)) return 'check-list';
    return 'tool';
  }
</script>

<div class="tool-card" class:expanded>
  <button class="tool-header" onclick={toggle} type="button">
    <StatusDot status={tool.status} />
    <Icon name={toolIcon(tool.name) as never} size="sm" />
    <span class="tool-name">{toolLabel(tool.name)}</span>
    <Chip tone={tool.status === 'running' ? 'accent' : tool.status === 'ok' ? 'success' : tool.status === 'error' ? 'danger' : 'neutral'}>{statusLabel}</Chip>
    {#if tool.arg}
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
    <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size="sm" />
  </button>

  {#if expanded && tool.output && tool.output.length > 0}
    <div class="tool-expand-area">
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
      <!-- JSON 输出：pretty-print + 折叠提示 -->
      <details class="json-output">
        <summary>JSON 输出（点击折叠/展开）</summary>
        <pre class="tool-output json-view"><code>{prettyJson}</code></pre>
      </details>
    {:else if kind === 'bash'}
      <!-- Bash：终端块（$ 命令 + 输出） -->
      <div class="term">
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
    color: var(--tx);
    flex: none;
  }

  /* Status badge 已由 <Chip> 原语渲染（tone 映射 running/ok/error）。 */

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

  /* JSON output pretty-print block. */
  .json-output > summary {
    cursor: pointer;
    padding: 6px 12px;
    font-size: 10.5px;
    color: var(--tx3);
    font-family: var(--font-mono, monospace);
    border-top: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    background: var(--mat-surface-2, var(--l2));
    user-select: none;
  }
  .json-output > summary:hover { color: var(--tx); }
  .json-view {
    margin: 0;
    max-height: 280px;
    background: var(--mat-surface-1, var(--l1));
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--tx);
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
    margin-left: auto;
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

  /* Bash 终端块 */
  .term { border-top: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd)); }
  .term-cmd {
    display: flex; align-items: center; gap: 7px;
    padding: 7px 12px;
    background: var(--mat-surface-1, var(--l1));
    border-bottom: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    font-family: var(--font-mono); font-size: 11px; color: var(--tx);
  }
  .term-prompt { color: var(--ac); font-weight: 700; }
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
