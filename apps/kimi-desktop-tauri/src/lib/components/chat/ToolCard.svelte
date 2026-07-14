<!-- ToolCard.svelte — tool call rendering with expand/collapse.
     Replaces kimi-web's ToolCall + ToolGroup + toolRegistry chain.
     Shows status, name, arg summary, timing, and expandable output. -->
<script lang="ts">
  import type { ToolCall } from '../../types';
  import StatusDot from '../ui/StatusDot.svelte';
  import Icon from '../ui/Icon.svelte';
  import { toolLabel, toolSummary } from '../../lib/toolMeta';

  let {
    tool,
  }: {
    tool: ToolCall;
  } = $props();

  // Auto-expand running tools, collapse completed ones.
  let expanded = $state(tool.status === 'running');

  // Diff stats for edit/write tools.
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
      <span class="tool-arg" title={tool.arg}>{toolSummary(tool.name, tool.arg)}</span>
    {/if}
    {#if diffStats}
      <span class="diff-chip add">+{diffStats.added}</span>
      <span class="diff-chip del">−{diffStats.removed}</span>
    {/if}
    {#if tool.timing}
      <span class="tool-timing">{tool.timing}</span>
    {/if}
    <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size="sm" />
  </button>

  {#if expanded && tool.output && tool.output.length > 0}
    <div class="tool-output">
      {#each tool.output.slice(0, 200) as line, i (i)}
        <div class="output-line" class:add={line.startsWith('+') && !line.startsWith('+++')} class:del={line.startsWith('-') && !line.startsWith('---')}>
          {line}
        </div>
      {/each}
      {#if tool.output.length > 200}
        <div class="output-truncated">… {tool.output.length - 200} more lines</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tool-card {
    margin: 4px 0;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--color-line, #2a2a2e);
    overflow: hidden;
    transition: border-color var(--duration-fast, 120ms);
  }
  .tool-card:hover {
    border-color: var(--color-line-strong, #3a3a3e);
  }

  .tool-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    border: none;
    background: var(--color-surface-raised, transparent);
    color: var(--color-text-muted, #9a9aa2);
    font-size: var(--text-xs, 12px);
    cursor: pointer;
    text-align: left;
    transition: background var(--duration-fast, 120ms);
  }
  .tool-header:hover {
    background: var(--color-hover, rgba(255,255,255,0.04));
  }

  .tool-name {
    font-weight: var(--weight-medium, 500);
    color: var(--color-text, #e7e7ea);
    flex: none;
  }
  .tool-arg {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono, monospace);
    opacity: 0.7;
    min-width: 0;
  }
  .tool-timing {
    flex: none;
    color: var(--color-text-faint, #6a6a72);
    font-size: 11px;
  }

  .diff-chip {
    flex: none;
    font-size: 10px;
    padding: 0 4px;
    border-radius: var(--radius-xs, 3px);
    font-weight: var(--weight-medium, 500);
  }
  .diff-chip.add { background: var(--color-success-soft, rgba(78,201,176,0.15)); color: var(--color-success, #4ec9b0); }
  .diff-chip.del { background: var(--color-danger-soft, rgba(255,107,107,0.15)); color: var(--color-danger, #ff6b6b); }

  .tool-output {
    border-top: 1px solid var(--color-line, #2a2a2e);
    padding: 8px 10px;
    max-height: 300px;
    overflow-y: auto;
    background: var(--color-surface-sunken, rgba(0,0,0,0.15));
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    line-height: 1.5;
  }
  .output-line {
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--color-text-muted, #9a9aa2);
  }
  .output-line.add { color: var(--color-success, #4ec9b0); }
  .output-line.del { color: var(--color-danger, #ff6b6b); }
  .output-truncated {
    color: var(--color-text-faint, #6a6a72);
    font-style: italic;
    padding-top: 4px;
  }
</style>
