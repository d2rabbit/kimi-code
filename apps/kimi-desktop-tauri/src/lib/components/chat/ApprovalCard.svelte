<!-- ApprovalCard.svelte — tool approval card with approve/reject.
     Renders the pending approval request from the daemon.
     Placed in the dock area (above Composer). -->
<script lang="ts">
  import type { AppApprovalRequest } from '../../api/types';
  import Icon from '../ui/Icon.svelte';
  import Button from '../ui/Button.svelte';
  import IconButton from '../ui/IconButton.svelte';
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

<div class="approval-card" class:minimized>
  <div class="approval-header">
    <Icon name="alert-triangle" size="sm" />
    <span class="approval-kind">{request.toolName} — {request.action}</span>
    <IconButton
      name={minimized ? 'chevron-down' : 'chevron-right'}
      label={minimized ? '展开' : '折叠'}
      size="sm"
      onclick={() => minimized = !minimized}
    />
  </div>

  {#if !minimized}
    <div class="approval-body">
      <div class="approval-detail">
        工具: <code>{request.toolName}</code>
        · 操作: <code>{request.action}</code>
      </div>
    </div>

    <div class="approval-actions">
      <Button size="sm" variant="primary" onclick={() => decide('approved')} disabled={busy}>
        同意 (1)
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
  .approval-kind { flex: 1; }

  .approval-body {
    padding: 0 12px 8px;
    font-size: var(--text-xs, 12px);
  }
  .approval-detail {
    color: var(--color-text-muted, #9a9aa2);
  }
  .approval-detail code {
    font-family: var(--font-mono, monospace);
    background: var(--color-surface-raised, rgba(128,128,128,0.15));
    padding: 1px 4px;
    border-radius: 3px;
  }

  .approval-actions {
    display: flex;
    gap: 8px;
    padding: 0 12px 10px;
  }
</style>
