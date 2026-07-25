<!-- SwarmCard.svelte — inline rendering for the AgentSwarm tool result.

  Replaces the generic tool output block with a structured aggregate view:
  summary counts (completed / failed / aborted) + one row per swarm member
  showing its phase dot (working / suspended / completed / failed) and latest
  activity. Consumes the copied kimi-web libs (parseSwarmResult / swarmGroups
  / swarmCardRows in src/lib/) that were present but unused until now.
-->
<script lang="ts">
  import type { ToolCall } from '../../types';
  import * as client from '../../stores/client.svelte';
  import { parseSwarmResult } from '../../lib/parseSwarmResult';
  import { swarmMembersByToolCall } from '../../lib/swarmGroups';
  import { buildSwarmCardRows } from '../../lib/swarmCardRows';
  import type { AppSubagentPhase } from '../../api/types';

  let {
    tool,
  }: {
    tool: ToolCall;
  } = $props();

  // Parse the terminal <agent_swarm_result> payload from the tool output.
  const result = $derived(parseSwarmResult(tool.output));

  // Live swarm members for this tool call (streamed via task events).
  // Falls back to the parsed terminal payload when no live tasks are wired.
  const liveMembers = $derived.by(() => {
    const byTool = swarmMembersByToolCall(client.tasks());
    return byTool.get(tool.id) ?? [];
  });

  const rows = $derived(buildSwarmCardRows(liveMembers, result));

  // Live done/total when streaming (terminal payload otherwise).
  const liveDone = $derived(liveMembers.filter((m) => m.phase === 'completed' || m.phase === 'failed').length);
  const liveTotal = $derived(liveMembers.length);

  const PHASE_DOT: Record<AppSubagentPhase, string> = {
    queued: 'phase-queued',
    working: 'phase-working',
    suspended: 'phase-suspended',
    completed: 'phase-completed',
    failed: 'phase-failed',
  };
</script>

<div class="swarm-card">
  {#if result}
    <div class="swarm-summary">
      <span class="ss-line mono">{result.summary}</span>
      {#if result.total > 0}
        <span class="ss-counts">
          <span class="ss-ok">✓ {result.completed}</span>
          {#if result.failed > 0}<span class="ss-err">✕ {result.failed}</span>{/if}
          {#if result.aborted > 0}<span class="ss-abort">⊘ {result.aborted}</span>{/if}
          <span class="ss-total">/ {result.total}</span>
        </span>
      {/if}
    </div>
  {:else if liveMembers.length > 0}
    <div class="swarm-summary">
      <span class="ss-line mono">进行中 · {liveDone}/{liveTotal}</span>
    </div>
  {/if}

  {#if rows.length > 0}
    <ul class="swarm-rows">
      {#each rows as row (row.id)}
        <li class="swarm-row">
          <span class="sr-dot {PHASE_DOT[row.phase]}" aria-hidden="true"></span>
          <span class="sr-name" title={row.name}>{row.name}</span>
          <span class="sr-activity" title={row.activity}>{row.activity}</span>
        </li>
      {/each}
    </ul>
  {:else if !result}
    <div class="swarm-empty mono">等待 swarm 结果…</div>
  {/if}

  {#if result?.resumeHint}
    <div class="swarm-hint mono">{result.resumeHint}</div>
  {/if}
</div>

<style>
  .swarm-card {
    border-top: 1px solid var(--bd);
    padding: 9px 12px;
    background: var(--mat-surface-1, var(--l1));
    font-size: 11px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .swarm-summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .ss-line { color: var(--tx2); font-size: 11px; }
  .ss-counts { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 10.5px; }
  .ss-ok { color: var(--ok); }
  .ss-err { color: var(--err); }
  .ss-abort { color: var(--tx3); }
  .ss-total { color: var(--tx3); }

  .swarm-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-height: 280px; overflow-y: auto; }
  .swarm-row {
    display: grid;
    grid-template-columns: 12px minmax(80px, auto) 1fr;
    align-items: center;
    gap: 8px;
    padding: 4px 4px;
    border-radius: var(--g-radius-control, 4px);
  }
  .swarm-row:hover { background: var(--color-hover); }

  .sr-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .phase-queued { background: var(--tx3); }
  .phase-working { background: var(--ac); box-shadow: 0 0 8px var(--ac); animation: swarm-pulse 1.5s ease-in-out infinite; }
  .phase-suspended { background: var(--warn); }
  .phase-completed { background: var(--ok); }
  .phase-failed { background: var(--err); }
  @keyframes swarm-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  @media (prefers-reduced-motion: reduce) {
    .phase-working { animation: none; }
  }

  .sr-name {
    color: var(--tx);
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sr-activity {
    color: var(--tx3);
    font-size: 10.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .swarm-empty { color: var(--tx3); padding: 4px 0; }
  .swarm-hint { color: var(--ac); padding-top: 4px; border-top: 1px dashed var(--bd2); font-size: 10.5px; }
</style>
