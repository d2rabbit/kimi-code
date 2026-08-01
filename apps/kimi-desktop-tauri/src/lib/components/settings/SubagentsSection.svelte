<!-- SubagentsSection.svelte — 子智能体 section（设置页与侧栏模块页共用同一实现）。

  两个分区：
  1. 可委派的 agent profile 目录 — 来自 GET /sessions/{id}/agent-profiles
     （agent-core-v2 的 Session 合并目录：内置 + 用户/项目/额外/显式文件 + 插件 agent）。
  2. 当前会话活跃的子 agent（来自 tasks 中 kind=subagent 的实时事件）。

  「委派」按钮把委派指令预填到对话输入框，由主 agent 通过 Agent/Task 工具
  按 profile 名拉起子 agent（服务端按名解析，语义与 TUI 一致）。
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../ui/Icon.svelte';
  import Button from '../ui/Button.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import * as client from '../../stores/client.svelte';
  import { getKimiWebApi } from '../../api';
  import type { AppAgentProfile } from '../../api/types';
  import { toast } from '../../stores/toast.svelte';

  let profiles = $state<AppAgentProfile[]>([]);
  let profilesLoading = $state(true);
  let profilesError = $state<string | null>(null);

  const activeSessionId = $derived(client.activeSessionId());

  // Live subagent tasks for the active session (swarm / Task tool children).
  const liveSubagents = $derived(
    client.tasks().filter((t) => t.kind === 'subagent'),
  );

  async function loadProfiles() {
    const sid = activeSessionId;
    profiles = [];
    profilesError = null;
    if (!sid) {
      profilesLoading = false;
      return;
    }
    profilesLoading = true;
    try {
      profiles = await getKimiWebApi().listAgentProfiles(sid);
    } catch (e) {
      profilesError = e instanceof Error ? e.message : String(e);
    } finally {
      profilesLoading = false;
    }
  }

  onMount(loadProfiles);

  $effect(() => {
    void activeSessionId;
    void loadProfiles();
  });

  function delegate(p: AppAgentProfile) {
    client.client.requestComposerPrefill(`请使用 ${p.name} 子智能体完成：`);
    toast.ok(`已填入对话输入框，补充任务后发送即可委派 ${p.name}`);
  }

  function formatElapsed(startedAt?: string): string {
    if (!startedAt) return '';
    const ms = Date.now() - new Date(startedAt).getTime();
    const sec = Math.max(0, Math.round(ms / 1000));
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    return `${min}m ${sec % 60}s`;
  }

  const PROFILE_COLORS: Record<string, string> = {
    agent: 'var(--ac)',
    coder: 'var(--color-done)',
    explore: 'var(--color-info, var(--ac))',
    plan: 'var(--amb)',
  };
  function profileColor(name: string): string {
    return PROFILE_COLORS[name] ?? 'var(--color-done)';
  }
</script>

<h2>子智能体</h2>
<p class="sub-desc">可委派的 agent profile 目录 + 当前会话的实时子 agent</p>

<!-- 可委派目录 -->
<h3 class="section-title">可委派</h3>
<div class="list-meta">
  <span>{profiles.length} 个可用 profile</span>
  <span class="dim-i">内置 + 文件 + 插件 agent（~/.kimi-code/agents、.kimi-code/agents/）</span>
</div>

{#if !activeSessionId}
  <p class="empty-text">选择一个会话后查看可委派的 agent profile。</p>
{:else if profilesLoading}
  <div class="loading"><Spinner size="md" /></div>
{:else if profilesError}
  <div class="loading-err">
    <p>{profilesError}</p>
    <Button size="sm" onclick={loadProfiles}>重试</Button>
  </div>
{:else}
  {#each profiles as p (p.name)}
    <div class="item-row builtin">
      <span class="isq" style="background: {profileColor(p.name)}22; color: {profileColor(p.name)};"><Icon name="git-branch" size="sm" /></span>
      <span class="ir">
        <span class="it">{p.name}<span class="role-tag">{p.modelPreference === 'secondary' ? '次模型' : (p.tools ? `${p.tools.length} 工具` : '全工具')}</span></span>
        <span class="id">{p.description ?? ''}</span>
        {#if p.whenToUse}<span class="id when">{p.whenToUse}</span>{/if}
      </span>
      <Button size="sm" onclick={() => delegate(p)}>委派</Button>
    </div>
  {/each}
{/if}

<!-- 当前会话运行中 -->
<h3 class="section-title section-title-secondary">当前会话</h3>
<div class="list-meta">
  <span>{liveSubagents.length} 个运行中</span>
  <span class="dim-i">来自实时任务事件</span>
</div>
{#if liveSubagents.length > 0}
  {#each liveSubagents as task (task.id)}
    <div class="item-row live">
      <span class="isq purple"><Icon name="git-branch" size="sm" /></span>
      <span class="ir">
        <span class="it">{task.subagentType ?? task.description ?? '子 agent'}</span>
        <span class="id mono">
          {task.status}
          {#if task.startedAt}· {formatElapsed(task.startedAt)}{/if}
          {#if task.command}· {task.command}{/if}
        </span>
      </span>
      <span class="pchip" class:running={task.status === 'running'}>{task.status}</span>
    </div>
  {/each}
{:else}
  <p class="empty-text">当前会话没有运行中的子 agent。使用 Task 工具、委派入口或启用 Swarm 模式后，子 agent 会在此显示。</p>
{/if}

<style>
  h2 { font-size: 20px; font-weight: 600; color: var(--tx); margin: 0 0 4px; letter-spacing: -0.02em; }
  .sub-desc { font-size: 12px; color: var(--tx3); margin: 0 0 20px; }

  .section-title { font-size: 13px; font-weight: 600; color: var(--tx2); margin: 18px 0 8px; letter-spacing: -0.01em; }
  .section-title-secondary { margin-top: 24px; }

  .list-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; font-size: 11px; color: var(--tx2); }
  .list-meta .dim-i { color: var(--tx3); font-style: italic; }

  .item-row { display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px; border-radius: var(--g-radius-card, 12px); background: var(--mat-surface-2, var(--l2)); backdrop-filter: var(--mat-blur, none); -webkit-backdrop-filter: var(--mat-blur, none); border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd)); box-shadow: var(--elev-card, var(--toplight)); margin-bottom: 8px; }
  .item-row.live { align-items: center; }
  .isq { width: 28px; height: 28px; border-radius: var(--g-radius-control, 8px); background: var(--ac-soft); color: var(--ac); display: flex; align-items: center; justify-content: center; flex: none; }
  .isq.purple { background: var(--color-done-soft); color: var(--color-done); }

  .ir { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .it { font-size: 13px; font-weight: 500; color: var(--tx); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .role-tag { font-size: 10px; color: var(--tx3); background: var(--l3); padding: 1px 6px; border-radius: var(--g-radius-chip, 4px); font-weight: 400; }
  .id { font-size: 11px; color: var(--tx3); line-height: 1.4; }
  .id.when { opacity: 0.75; }
  .id.mono { font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .pchip { font-size: 10px; color: var(--color-done); background: var(--color-done-soft); border-radius: var(--g-radius-chip, 99px); padding: 2px 8px; font-weight: 600; flex: none; }
  .pchip.running { color: var(--ac); background: var(--ac-soft); }

  .empty-text { color: var(--tx3); font-size: 13px; }
  .loading { display: flex; justify-content: center; padding: 24px; }
  .loading-err { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px; color: var(--tx3); font-size: 12px; }
</style>
