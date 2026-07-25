<!-- GoalStrip.svelte — active goal banner shown above the chat transcript.

  Renders the live `AppGoal` for the active session (objective, status, token
  budget, turns, wall clock) plus pause / resume / cancel controls. Mirrors
  kimi-web's chat/GoalStrip.vue structure in Svelte 5 Runes; status terms
  follow docs/zh/guides/goals.md (active / paused / blocked / complete).

  Hidden automatically when there is no active goal (the reducer clears
  goalBySession[sid] on completion — see eventReducer.ts goalUpdated case).
-->
<script lang="ts">
  import * as client from '../../stores/client.svelte';
  import type { AppGoalStatus } from '../../api/types';
  import Button from '../ui/Button.svelte';

  const goal = $derived(client.goal());

  const STATUS_META: Record<AppGoalStatus, { label: string; cls: string }> = {
    active: { label: '进行中', cls: 'st-active' },
    paused: { label: '已暂停', cls: 'st-paused' },
    blocked: { label: '已阻塞', cls: 'st-blocked' },
    complete: { label: '已完成', cls: 'st-complete' },
  };

  /** Token budget usage 0–100, or null when no budget is set. */
  const tokenPct = $derived.by(() => {
    const g = goal;
    if (!g || !g.budget.tokenBudget || g.budget.tokenBudget <= 0) return null;
    return Math.max(0, Math.min(100, Math.round((g.tokensUsed / g.budget.tokenBudget) * 100)));
  });

  /** Wall-clock elapsed formatted as e.g. "3m 12s" (matches kimi-web GoalStrip). */
  const elapsed = $derived.by(() => {
    const g = goal;
    if (!g) return '';
    const sec = Math.max(0, Math.round(g.wallClockMs / 1000));
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    if (min <= 0) return `${rem}s`;
    if (min < 60) return `${min}m ${rem}s`;
    const hour = Math.floor(min / 60);
    return `${hour}h ${min % 60}m`;
  });

  function control(action: 'pause' | 'resume' | 'cancel') {
    void client.client.setGoalControl(action);
  }
</script>

{#if goal}
  {@const g = goal}
  {@const meta = STATUS_META[g.status]}
  <section class="goal-strip {meta.cls}" role="status" aria-live="polite">
    <div class="gs-main">
      <span class="gs-dot" aria-hidden="true"></span>
      <div class="gs-objective">
        <span class="gs-label">目标</span>
        <span class="gs-text" title={g.objective}>{g.objective}</span>
      </div>
      <span class="gs-status">{meta.label}</span>
    </div>

    <div class="gs-meta">
      {#if tokenPct !== null}
        <div class="gs-meter" title="Token 预算用量">
          <div class="gs-meter-bar"><i style="width: {tokenPct}%"></i></div>
          <span class="gs-meter-pct mono">{tokenPct}%</span>
        </div>
      {/if}
      {#if g.budget.turnBudget}
        <span class="gs-stat mono" title="已用轮次 / 预算">{g.turnsUsed}/{g.budget.turnBudget} 轮</span>
      {:else}
        <span class="gs-stat mono" title="已用轮次">{g.turnsUsed} 轮</span>
      {/if}
      {#if elapsed}
        <span class="gs-stat mono" title="已用时长">{elapsed}</span>
      {/if}
      {#if g.terminalReason}
        <span class="gs-reason" title={g.terminalReason}>{g.terminalReason}</span>
      {/if}
    </div>

    <div class="gs-actions">
      {#if g.status === 'active'}
        <Button size="sm" onclick={() => control('pause')}>暂停</Button>
      {:else if g.status === 'paused'}
        <Button size="sm" variant="primary" onclick={() => control('resume')}>继续</Button>
      {/if}
      {#if g.status === 'active' || g.status === 'paused'}
        <Button size="sm" variant="danger" onclick={() => control('cancel')}>取消</Button>
      {/if}
    </div>
  </section>
{/if}

<style>
  .goal-strip {
    flex: none;
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    grid-template-areas:
      "main actions"
      "meta meta";
    gap: 6px 12px;
    align-items: center;
    padding: 8px 14px;
    margin: 8px 20px 0;
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd2));
    border-radius: var(--g-radius-card, 4px);
    background: var(--mat-surface-2, var(--l1));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    box-shadow: var(--elev-card, var(--toplight));
    font-size: 12px;
  }

  .gs-main { grid-area: main; display: flex; align-items: center; gap: 8px; min-width: 0; }
  .gs-meta { grid-area: meta; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; color: var(--tx3); font-size: 11px; }
  .gs-actions { grid-area: actions; display: flex; gap: 4px; }

  .gs-dot {
    width: 8px; height: 8px; border-radius: 50%; flex: none;
    background: var(--ac);
    box-shadow: 0 0 8px var(--ac);
  }
  .st-active .gs-dot { animation: goal-pulse 1.5s ease-in-out infinite; }
  .st-paused .gs-dot { background: var(--warn); box-shadow: 0 0 8px var(--warn); }
  .st-blocked .gs-dot { background: var(--err); box-shadow: 0 0 8px var(--err); }
  .st-complete .gs-dot { background: var(--ok); box-shadow: 0 0 8px var(--ok); }

  @keyframes goal-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  @media (prefers-reduced-motion: reduce) {
    .st-active .gs-dot { animation: none; }
  }

  .gs-objective { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 1px; }
  .gs-label { color: var(--tx3); font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; }
  .gs-text {
    color: var(--tx); font-size: 13px; font-weight: 600; line-height: 1.3;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .gs-status {
    flex: none; padding: 2px 8px; border-radius: var(--g-radius-chip, 999px);
    font-size: 10.5px; font-weight: 600;
  }
  .st-active .gs-status { background: var(--ac-soft); color: var(--ac); }
  .st-paused .gs-status { background: var(--amb-soft); color: var(--warn); }
  .st-blocked .gs-status { background: var(--err-soft); color: var(--err); }
  .st-complete .gs-status { background: var(--ok-soft); color: var(--ok); }

  .gs-meter { display: flex; align-items: center; gap: 6px; }
  .gs-meter-bar { width: 64px; height: 4px; border-radius: 999px; background: var(--bd2); overflow: hidden; }
  .gs-meter-bar > i { display: block; height: 100%; background: var(--ac); border-radius: 999px; }
  .st-blocked .gs-meter-bar > i { background: var(--err); }
  .st-complete .gs-meter-bar > i { background: var(--ok); }
  .gs-meter-pct { color: var(--tx2); }

  .gs-stat { color: var(--tx2); }
  .gs-reason { color: var(--tx3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
</style>
