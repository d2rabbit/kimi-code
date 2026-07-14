<!-- ApprovalCard.svelte — tool approval card with approve/reject.
     Renders diff/shell/file/generic approval blocks.
     Placed in the dock area (above Composer), not in the scroll stream. -->
<script lang="ts">
  import type { ApprovalBlock } from '../../types';
  import Icon from '../ui/Icon.svelte';
  import Button from '../ui/Button.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import * as client from '../../stores/client.svelte';

  let {
    approval,
    approvalId,
  }: {
    approval: ApprovalBlock;
    approvalId: string;
  } = $props();

  let busy = $state(false);
  let minimized = $state(false);
  let showFeedback = $state(false);
  let feedback = $state('');

  const KIND_LABELS: Record<string, string> = {
    diff: '文件修改',
    shell: '命令执行',
    file: '文件操作',
    fileop: '文件操作',
    url: '网络请求',
    search: '搜索操作',
    invocation: '工具调用',
    todo: '任务规划',
    plan_review: '计划审批',
    generic: '操作确认',
  };

  const kindLabel = $derived(KIND_LABELS[approval.kind] ?? '操作确认');

  async function decide(decision: 'approved' | 'rejected') {
    busy = true;
    try {
      await client.client.respondApproval(approvalId, decision);
    } catch {
      // Error shown by caller.
    } finally {
      busy = false;
    }
  }
</script>

<div class="approval-card" class:minimized>
  <!-- Header -->
  <div class="approval-header">
    <Icon name="alert-triangle" size="sm" />
    <span class="approval-kind">{kindLabel}</span>
    {#if minimized && approval.path}
      <span class="approval-path-min">{approval.path}</span>
    {/if}
    <IconButton
      name={minimized ? 'chevron-down' : 'chevron-right'}
      label={minimized ? '展开' : '折叠'}
      size="sm"
      onclick={() => minimized = !minimized}
    />
  </div>

  {#if !minimized}
    <!-- Body (by kind) -->
    <div class="approval-body">
      {#if approval.kind === 'shell'}
        {#if approval.command}
          <pre class="shell-cmd"><code>$ {approval.command}</code></pre>
        {/if}
        {#if approval.cwd}
          <div class="approval-meta">工作目录: {approval.cwd}</div>
        {/if}
      {:else if approval.kind === 'diff' && approval.diff}
        <div class="diff-preview">
          {#each approval.diff.slice(0, 50) as line, i (i)}
            <div class="diff-line" class:add={line.kind === 'add'} class:del={line.kind === 'rem'}>
              <span class="diff-sign">{line.kind === 'add' ? '+' : line.kind === 'rem' ? '-' : ' '}</span>
              <span class="diff-text">{line.text}</span>
            </div>
          {/each}
          {#if approval.diff.length > 50}
            <div class="diff-more">… {approval.diff.length - 50} more lines</div>
          {/if}
        </div>
      {:else if approval.path}
        <div class="approval-path">{approval.path}</div>
      {:else if approval.summary}
        <div class="approval-summary">{approval.summary}</div>
      {/if}
    </div>

    <!-- Feedback (optional) -->
    {#if showFeedback}
      <div class="feedback-area">
        <textarea
          bind:value={feedback}
          placeholder="反馈意见（可选）"
          rows="2"
          class="feedback-input"
        ></textarea>
      </div>
    {/if}

    <!-- Actions -->
    <div class="approval-actions">
      <Button size="sm" variant="primary" onclick={() => decide('approved')} disabled={busy}>
        同意 (1)
      </Button>
      <Button size="sm" variant="default" onclick={() => { showFeedback = !showFeedback; }} disabled={busy}>
        反馈 (4)
      </Button>
      <Button size="sm" variant="danger" onclick={() => decide('rejected')} disabled={busy}>
        拒绝 (3)
      </Button>
    </div>
  {/if}
</div>

<style>
  .approval-card {
    border: 1px solid var(--color-warning, #ffc107);
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    background: var(--color-warning-soft, rgba(255,193,7,0.05));
  }
  .approval-card.minimized {
    border-color: var(--color-line, #2a2a2e);
    background: var(--color-surface-raised, transparent);
  }

  .approval-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    color: var(--color-warning, #ffc107);
    font-size: var(--text-sm, 13px);
    font-weight: var(--weight-medium, 500);
  }
  .minimized .approval-header {
    color: var(--color-text-muted, #9a9aa2);
    font-weight: var(--weight-regular, 400);
  }
  .approval-kind { flex: none; }
  .approval-path-min {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    opacity: 0.7;
  }

  .approval-body {
    padding: 0 12px 8px;
    font-size: var(--text-xs, 12px);
  }
  .shell-cmd {
    background: var(--color-surface-sunken, rgba(0,0,0,0.2));
    padding: 8px 10px;
    border-radius: var(--radius-sm, 6px);
    font-family: var(--font-mono, monospace);
    margin: 0;
    overflow-x: auto;
  }
  .approval-meta {
    color: var(--color-text-muted, #9a9aa2);
    margin-top: 4px;
  }
  .diff-preview {
    max-height: 200px;
    overflow-y: auto;
    background: var(--color-surface-sunken, rgba(0,0,0,0.2));
    border-radius: var(--radius-sm, 6px);
    padding: 6px 8px;
    font-family: var(--font-mono, monospace);
  }
  .diff-line {
    display: flex;
    gap: 4px;
    white-space: pre;
  }
  .diff-sign { flex: none; width: 12px; }
  .diff-line.add .diff-sign, .diff-line.add .diff-text { color: var(--color-success, #4ec9b0); }
  .diff-line.del .diff-sign, .diff-line.del .diff-text { color: var(--color-danger, #ff6b6b); }
  .diff-text { overflow: hidden; text-overflow: ellipsis; }
  .diff-more { color: var(--color-text-faint, #6a6a72); font-style: italic; padding-top: 4px; }

  .approval-path {
    font-family: var(--font-mono, monospace);
    color: var(--color-text-muted, #9a9aa2);
  }
  .approval-summary {
    color: var(--color-text-muted, #9a9aa2);
  }

  .feedback-area {
    padding: 0 12px 8px;
  }
  .feedback-input {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--color-line, #2a2a2e);
    background: var(--color-surface-raised, #1a1a1e);
    color: var(--color-text, #e7e7ea);
    font-size: var(--text-sm, 13px);
    font-family: inherit;
    resize: vertical;
    outline: none;
  }

  .approval-actions {
    display: flex;
    gap: 8px;
    padding: 0 12px 10px;
  }
</style>
