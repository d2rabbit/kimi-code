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
    border: 1px solid var(--warn);
    border-radius: var(--r-lg);
    overflow: hidden;
    background: var(--l2);
    box-shadow: var(--toplight);
    margin-bottom: 8px;
  }
  .approval-card.minimized {
    border-color: var(--bd);
    background: var(--l2);
  }

  .approval-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    cursor: pointer;
    user-select: none;
    background: var(--warn-soft);
  }
  .approval-card.minimized .approval-header { background: transparent; }
  .approval-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px; height: 22px;
    border-radius: var(--r-sm);
    color: var(--warn);
    flex-shrink: 0;
  }
  .approval-kind {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    color: var(--warn);
  }
  .minimize-btn {
    width: 24px; height: 24px;
    border: none; border-radius: var(--r-sm);
    background: transparent;
    color: var(--warn);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background var(--duration-fast) var(--ease);
  }
  .minimize-btn:hover { background: var(--color-hover); }

  .approval-body {
    padding: 10px 12px 4px;
  }
  .approval-detail {
    font-size: 12px;
    color: var(--tx2);
  }
  .approval-detail code {
    font-family: var(--font-mono);
    background: var(--l3);
    border: 1px solid var(--bd);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 11px;
    color: var(--ac);
  }

  .approval-actions {
    display: flex;
    gap: 8px;
    padding: 8px 12px 12px;
  }
  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 10px;
    border-radius: var(--r-sm);
    border: 1px solid var(--bd2);
    background: transparent;
    color: var(--tx2);
    font-size: 11px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease), border-color var(--duration-fast) var(--ease);
  }
  .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .action-btn kbd {
    font-size: 8px;
    padding: 0 4px;
    border-radius: 4px;
    border: 1px solid var(--bd2);
    font-family: var(--font-mono);
    color: var(--tx3);
    opacity: 0.8;
  }
  .action-btn.approve {
    background: var(--ac);
    border-color: transparent;
    color: #fff;
  }
  .action-btn.approve:hover:not(:disabled) { background: var(--ac-h); }
  .action-btn.approve-session:hover:not(:disabled) {
    background: var(--ac-soft);
    color: var(--ac);
    border-color: var(--ac-bd);
  }
  .action-btn.reject {
    border-color: var(--err);
    color: var(--err);
  }
  .action-btn.reject:hover:not(:disabled) {
    background: var(--err-soft);
  }
</style>
