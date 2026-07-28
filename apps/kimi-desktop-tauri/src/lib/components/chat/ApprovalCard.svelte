<!-- ApprovalCard.svelte — 敏感操作权限申请卡（参考原型第 9 卡：琥珀边/盾徽/命令框/允许·拒绝）。 -->
<script lang="ts">
  import type { AppApprovalRequest } from '../../api/types';
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Button from '../ui/Button.svelte';
  import * as client from '../../stores/client.svelte';
  import { toast } from '../../stores/toast.svelte';

  let {
    request,
  }: {
    request: AppApprovalRequest;
  } = $props();

  let busy = $state(false);
  let minimized = $state(false);
  let resolved = $state<'approved' | 'rejected' | null>(null);

  async function decide(decision: 'approved' | 'rejected') {
    busy = true;
    try {
      await client.client.respondApproval(request.approvalId, decision);
      resolved = decision;
      toast.ok(decision === 'approved' ? '已授权允许执行' : '已拒绝授权');
    } catch (e) {
      toast.err(`操作失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busy = false;
    }
  }
</script>

<div class="approval-card" class:minimized class:ap-resolved={resolved !== null}>
  <div class="approval-header" onclick={() => minimized = !minimized} role="button" tabindex="0"
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); minimized = !minimized; } }}>
    <span class="approval-title"><Icon name="alert-triangle" size="sm" /> 敏感操作权限申请</span>
    <IconButton name={minimized ? 'chevron-down' : 'chevron-right'} label={minimized ? '展开' : '折叠'} size="sm"
      onclick={(e) => { e.stopPropagation(); minimized = !minimized; }} />
  </div>

  {#if !minimized}
    <div class="approval-body">
      <p class="approval-desc">Agent 申请以提升的权限执行以下操作，请确认是否授权：</p>
      <div class="approval-cmd mono">
        <span class="cmd-exec">exec:</span> {request.toolName} · {request.action}
      </div>
    </div>

    <div class="approval-actions">
      {#if resolved}
        <span class="ap-chip" class:ap-ok={resolved === 'approved'} class:ap-no={resolved === 'rejected'}>
          {#if resolved === 'approved'}✓ 已授权允许执行{:else}✕ 已拒绝授权{/if}
        </span>
      {:else}
        <Button variant="primary" size="sm" onclick={() => decide('approved')} disabled={busy}>
          允许执行 <kbd>1</kbd>
        </Button>
        <Button variant="default" size="sm" onclick={() => decide('approved')} disabled={busy}>
          本会话同意 <kbd>2</kbd>
        </Button>
        <Button variant="danger" size="sm" onclick={() => decide('rejected')} disabled={busy}>
          拒绝授权 <kbd>3</kbd>
        </Button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .approval-card {
    margin: 6px 0 8px;
    border: var(--g-border-w, 1px) var(--g-border-style, solid) color-mix(in srgb, var(--warn) 45%, transparent);
    border-radius: var(--g-radius-card, var(--r-lg));
    overflow: hidden;
    background: var(--mat-surface-2, var(--l2));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    box-shadow: var(--elev-card, var(--toplight));
  }
  .approval-card.minimized {
    border-color: var(--g-border-color, var(--bd));
  }
  .approval-card.ap-resolved {
    border-color: var(--g-border-color, var(--bd));
    opacity: 0.85;
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
  .approval-title {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    font-weight: 600;
    color: var(--warn);
  }

  .approval-body {
    padding: 10px 12px 4px;
  }
  .approval-desc {
    font-size: 11.5px;
    color: var(--tx2);
    margin: 0 0 8px;
    line-height: 1.55;
  }
  .approval-cmd {
    padding: 8px 10px;
    border-radius: var(--g-radius-control, 4px);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    background: var(--mat-surface-1, var(--l1));
    color: var(--warn);
    font-size: 11px;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cmd-exec { color: var(--tx3); margin-right: 4px; }

  .approval-actions {
    display: flex;
    gap: 8px;
    align-items: center;
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
  .ap-chip {
    font-size: 10.5px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: var(--g-radius-chip, 999px);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) transparent;
  }
  .ap-chip.ap-ok {
    background: var(--ok-soft);
    color: var(--ok);
    border-color: color-mix(in srgb, var(--ok) 30%, transparent);
  }
  .ap-chip.ap-no {
    background: var(--err-soft);
    color: var(--err);
    border-color: color-mix(in srgb, var(--err) 30%, transparent);
  }
  .mono { font-family: var(--font-mono, monospace); }
</style>
