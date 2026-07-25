<!-- ApprovalCard.svelte — glass tool approval card with approve/reject.
     Renders the pending approval request from the daemon.
     Placed in the dock area (above Composer). -->
<script lang="ts">
  import type { AppApprovalRequest } from '../../api/types';
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Button from '../ui/Button.svelte';
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
  <div class="approval-header" onclick={() => minimized = !minimized} role="button" tabindex="0"
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); minimized = !minimized; } }}>
    <span class="approval-icon"><Icon name="alert-triangle" size="sm" /></span>
    <span class="approval-kind">{request.toolName} — {request.action}</span>
    <IconButton name={minimized ? 'chevron-down' : 'chevron-right'} label={minimized ? '展开' : '折叠'} size="sm"
      onclick={(e) => { e.stopPropagation(); minimized = !minimized; }} />
  </div>

  {#if !minimized}
    <div class="approval-body">
      <div class="approval-detail">
        工具 <code>{request.toolName}</code> · 操作 <code>{request.action}</code>
      </div>
    </div>

    <div class="approval-actions">
      <Button variant="primary" size="sm" onclick={() => decide('approved')} disabled={busy}>
        同意 <kbd>1</kbd>
      </Button>
      <Button variant="default" size="sm" onclick={() => decide('approved')} disabled={busy}>
        本会话同意 <kbd>2</kbd>
      </Button>
      <Button variant="danger" size="sm" onclick={() => decide('rejected')} disabled={busy}>
        拒绝 <kbd>3</kbd>
      </Button>
    </div>
  {/if}
</div>

<style>
  .approval-card {
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--warn);
    border-radius: var(--g-radius-card, var(--r-lg));
    overflow: hidden;
    background: var(--mat-surface-2, var(--l2));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    box-shadow: var(--elev-card, var(--toplight));
    margin-bottom: 8px;
  }
  .approval-card.minimized {
    border-color: var(--g-border-color, var(--bd));
  }

  .approval-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    cursor: pointer;
    user-select: none;
    /* 语义 warning 底色，无契约等价物，保留 */
    background: var(--warn-soft);
  }
  .approval-card.minimized .approval-header { background: transparent; }
  .approval-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px; height: 22px;
    border-radius: var(--g-radius-control, var(--r-sm));
    color: var(--warn);
    flex-shrink: 0;
  }
  .approval-kind {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    color: var(--warn);
  }

  .approval-body {
    padding: 10px 12px 4px;
  }
  .approval-detail {
    font-size: 12px;
    color: var(--tx2);
  }
  .approval-detail code {
    font-family: var(--font-mono);
    background: var(--mat-surface-3, var(--l3));
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    padding: 1px 5px;
    border-radius: var(--g-radius-chip, 4px);
    font-size: 11px;
    color: var(--ac);
  }

  .approval-actions {
    display: flex;
    gap: 8px;
    padding: 8px 12px 12px;
  }
  .approval-actions kbd {
    font-size: 8px;
    padding: 0 4px;
    border-radius: 4px;
    border: 1px solid var(--bd2);
    font-family: var(--font-mono);
    opacity: 0.8;
  }
  .approval-actions :global(.btn-primary kbd),
  .approval-actions :global(.btn-danger kbd) {
    border-color: rgba(255, 255, 255, 0.35);
  }
</style>
