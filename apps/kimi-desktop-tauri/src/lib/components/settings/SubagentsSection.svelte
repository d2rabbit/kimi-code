<!-- SubagentsSection.svelte — 子智能体 section（设置页与侧栏模块页共用同一实现）。
     列出当前会话中活跃的子 agent（来自 tasks 中 kind=subagent 的实时事件）；
     没有会话或没有子 agent 时显示诚实说明。 -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import * as client from '../../stores/client.svelte';

  // Live subagent tasks for the active session (swarm / Task tool children).
  const liveSubagents = $derived(
    client.tasks().filter((t) => t.kind === 'subagent'),
  );
</script>

<h2>子智能体</h2>
<p class="sub-desc">会话中由 Task / AgentSwarm 工具启动的子 agent 在此实时显示</p>
<div class="list-meta">
  <span>当前会话 {liveSubagents.length} 个</span>
  <span class="dim-i">来自实时任务事件</span>
</div>

{#if liveSubagents.length > 0}
  {#each liveSubagents as task (task.id)}
    <div class="item-row">
      <span class="isq purple"><Icon name="git-branch" size="sm" /></span>
      <span class="ir">
        <span class="it">{task.subagentType ?? task.description ?? '子 agent'}</span>
        <span class="id mono">{task.status}{#if task.command} · {task.command}{/if}</span>
      </span>
      <span class="pchip" class:running={task.status === 'running'}>{task.status}</span>
    </div>
  {/each}
{:else}
  <p class="empty-text">当前会话没有运行中的子 agent。使用 Task 工具或启用 Swarm 模式后，子 agent 会在此显示。</p>
{/if}

<style>
  h2 { font-size: 20px; font-weight: 600; color: var(--tx); margin: 0 0 4px; letter-spacing: -0.02em; }
  .sub-desc { font-size: 12px; color: var(--tx3); margin: 0 0 20px; }
  .list-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; font-size: 11px; color: var(--tx2); }
  .list-meta .dim-i { color: var(--tx3); font-style: italic; }
  .item-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 12px; background: var(--l2); border: 1px solid var(--bd); box-shadow: var(--toplight); margin-bottom: 8px; }
  .isq { width: 28px; height: 28px; border-radius: 8px; background: var(--ac-soft); color: var(--ac); display: flex; align-items: center; justify-content: center; flex: none; }
  .isq.purple { background: var(--color-done-soft); color: var(--color-done); }
  .ir { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .it { font-size: 13px; font-weight: 500; color: var(--tx); display: flex; align-items: center; gap: 6px; }
  .id { font-size: 11px; color: var(--tx3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .id.mono { font-family: var(--font-mono); }
  .pchip { font-size: 10px; color: var(--color-done); background: var(--color-done-soft); border-radius: 99px; padding: 2px 8px; font-weight: 600; }
  .pchip.running { color: var(--ac); background: var(--ac-soft); }
  .empty-text { color: var(--tx3); font-size: 13px; }
</style>
