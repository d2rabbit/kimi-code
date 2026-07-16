<!-- ApprovalCard.svelte — glass tool approval card with approve/reject.
     Renders the pending approval request from the daemon.
     Placed in the dock area (above Composer). -->
<script lang="ts">
  import type { AppApprovalRequest } from '../../api/types';
  import Icon from '../ui/Icon.svelte';
  import * as client from '../../stores/client.svelte';

  let {
    request,
  }: {
    request: AppApprovalRequest;
  } = $props();

  let busy = $state(false);
  let minimized = $state(false);

  async function decide(decision: 'approved' | 'rejected') {
    busy = true;
    try {
      await client.client.respondApproval(request.approvalId, decision);
    } catch {
      // Error shown by caller.
    } finally {
      busy = false;
    }
  }
</script>

<div class="approval-card glass-panel" class:minimized>
  <div class="approval-header" onclick={() => minimized = !minimized} role="button" tabindex="0"
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); minimized = !minimized; } }}>
    <span class="approval-icon"><Icon name="alert-triangle" size="sm" /></span>
    <span class="approval-kind">{request.toolName} — {request.action}</span>
    <button class="minimize-btn" onclick={(e) => { e.stopPropagation(); minimized = !minimized; }} type="button" aria-label={minimized ? '展开' : '折叠'}>
      <Icon name={minimized ? 'chevron-down' : 'chevron-right'} size="sm" />
    </button>
  </div>

  {#if !minimized}
    <div class="approval-body">
      <div class="approval-detail">
        工具 <code>{request.toolName}</code> · 操作 <code>{request.action}</code>
      </div>
    </div>

    <div class="approval-actions">
      <button class="action-btn approve" onclick={() => decide('approved')} disabled={busy} type="button">
        同意 <kbd>1</kbd>
      </button>
      <button class="action-btn approve-session" onclick={() => decide('approved')} disabled={busy} type="button">
        本会话同意 <kbd>2</kbd>
      </button>
      <button class="action-btn reject" onclick={() => decide('rejected')} disabled={busy} type="button">
        拒绝 <kbd>3</kbd>
      </button>
    </div>
  {/if}
</div>

<style>
  .approval-card {
    border: 1px solid var(--color-warning, #ffd60a);
    border-left: 3px solid var(--color-warning, #ffd60a);
    border-radius: var(--radius-lg, 14px);
    overflow: hidden;
    background: rgba(255, 214, 10, 0.06);
    backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.6));
    -webkit-backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.6));
    margin-bottom: 8px;
  }
  .approval-card.minimized {
    border-color: var(--color-line, rgba(84,84,88,0.65));
    border-left-color: var(--color-line, rgba(84,84,88,0.65));
    background: var(--color-surface-raised, rgba(44,44,46,0.8));
  }

  .approval-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    cursor: pointer;
    user-select: none;
  }
  .approval-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px; height: 24px;
    border-radius: var(--radius-sm, 8px);
    background: rgba(255, 214, 10, 0.12);
    color: var(--color-warning, #ffd60a);
    flex-shrink: 0;
  }
  .approval-kind {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text, rgba(255,255,255,0.92));
  }
  .minimize-btn {
    width: 26px; height: 26px;
    border: none; border-radius: var(--radius-sm, 8px);
    background: transparent;
    color: var(--color-text-faint, rgba(235,235,245,0.3));
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 120ms, color 120ms;
  }
  .minimize-btn:hover { background: var(--color-hover, rgba(255,255,255,0.06)); color: var(--color-text-muted); }

  .approval-body {
    padding: 0 14px 8px;
  }
  .approval-detail {
    font-size: 12px;
    color: var(--color-text-muted, rgba(235,235,245,0.6));
  }
  .approval-detail code {
    font-family: var(--font-mono, monospace);
    background: rgba(255,255,255,0.06);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 11px;
  }

  .approval-actions {
    display: flex;
    gap: 8px;
    padding: 0 14px 12px;
  }
  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: var(--radius-md, 10px);
    border: 1px solid var(--color-line-strong, rgba(84,84,88,0.4));
    background: transparent;
    color: var(--color-text-muted, rgba(235,235,245,0.6));
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    transition: all 120ms;
  }
  .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .action-btn kbd {
    font-size: 10px;
    padding: 0 4px;
    border-radius: 4px;
    background: rgba(255,255,255,0.06);
    font-family: var(--font-mono, monospace);
    color: var(--color-text-faint);
  }
  .action-btn.approve {
    background: var(--color-accent, #2dd4bf);
    border-color: var(--color-accent, #2dd4bf);
    color: #0a0a0c;
    font-weight: 500;
  }
  .action-btn.approve:hover:not(:disabled) { background: var(--color-accent-hover, #5eead4); }
  .action-btn.approve-session:hover:not(:disabled) {
    background: var(--color-accent-soft, rgba(45,212,191,0.14));
    color: var(--color-accent, #2dd4bf);
    border-color: var(--color-accent-bd, rgba(45,212,191,0.28));
  }
  .action-btn.reject:hover:not(:disabled) {
    background: var(--color-danger-soft, rgba(255,69,58,0.16));
    color: var(--color-danger, #ff453a);
    border-color: rgba(255,69,58,0.3);
  }
</style>
