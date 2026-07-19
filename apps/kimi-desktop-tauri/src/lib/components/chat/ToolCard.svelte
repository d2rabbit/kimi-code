<!-- ToolCard.svelte — tool call rendering with expand/collapse.
     Replaces kimi-web's ToolCall + ToolGroup + toolRegistry chain.
     Shows status, name, arg summary, timing, and expandable output. -->
<script lang="ts">
  import type { ToolCall } from '../../types';
  import StatusDot from '../ui/StatusDot.svelte';
  import Icon from '../ui/Icon.svelte';
  import { toolLabel, toolSummary } from '../../lib/toolMeta';
  import * as client from '../../stores/client.svelte';
  import SwarmCard from './SwarmCard.svelte';

  let {
    tool,
  }: {
    tool: ToolCall;
  } = $props();

  // Auto-expand running tools, collapse completed ones.
  let expanded = $derived(tool.status === 'running');

  // Extract file path from arg for click-to-preview.
  const filePath = $derived.by(() => {
    if (!tool.arg) return null;
    // tool.arg is typically JSON or a path string like "· src/foo.ts".
    const trimmed = tool.arg.replace(/^[·\s]+/, '').trim();
    // Try parsing as JSON (edit tools use {file_path: "..."}).
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return parsed.file_path ?? parsed.path ?? parsed.filePath ?? null;
      }
    } catch {
      // Not JSON — treat as path string.
    }
    // Check if it looks like a file path.
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

  function toggle() {
    expanded = !expanded;
  }

  // ---- 富渲染分类 ----
  const kind = $derived.by(() => {
    const n = tool.name.toLowerCase();
    if (['bash', 'shell', 'execute', 'run', 'exec'].includes(n)) return 'bash';
    if (['edit', 'write', 'multi_edit', 'multiedit'].includes(n)) return 'edit';
    if (['read', 'readfile'].includes(n)) return 'read';
    if (['agentswarm', 'swarm'].includes(n)) return 'swarm';
    return 'generic';
  });

  // Bash: $ 命令行 + 输出（exit code 由 status/输出推断）
  const bashCmd = $derived.by(() => {
    if (kind !== 'bash') return '';
    const raw = (tool.arg ?? '').replace(/^[·\s]+/, '').trim();
    try {
      const parsed = JSON.parse(raw);
      return parsed.command ?? parsed.cmd ?? raw;
    } catch { return raw; }
  });

  // Edit/Read: 带行号的行序列（diff 行着色的增强版）
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
    {#if kind === 'swarm'}
      <SwarmCard {tool} />
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
  {/if}
</div>

<style>
  .tool-card {
    margin: 6px 0;
    border-radius: var(--r-lg);
    border: 1px solid var(--bd);
    background: var(--l2);
    box-shadow: var(--toplight);
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
    border-radius: var(--r-sm);
    font-weight: var(--weight-medium);
    font-family: var(--font-mono);
  }
  .diff-chip.add { background: var(--ok-soft); color: var(--ok); }
  .diff-chip.del { background: var(--err-soft); color: var(--err); }

  .tool-output {
    border-top: 1px solid var(--bd);
    padding: 9px 12px;
    max-height: 300px;
    overflow-y: auto;
    background: var(--l1);
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.65;
  }

  /* Bash 终端块 */
  .term { border-top: 1px solid var(--bd); }
  .term-cmd {
    display: flex; align-items: center; gap: 7px;
    padding: 7px 12px;
    background: var(--l1);
    border-bottom: 1px solid var(--bd);
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
