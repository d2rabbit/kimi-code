<!-- SubagentsSection.svelte — 子智能体 section（设置页与侧栏模块页共用同一实现）。

  两个分区：
  1. 系统内置子 agent（agent-core 自带的 4 个 profile：agent/coder/explore/plan）
     —— 静态展示，因为 agent-core 当前不从磁盘加载用户自定义 profile（所有
     profile 来自 packages/agent-core/src/profile/default/*.yaml）。
  2. 当前会话活跃的子 agent（来自 tasks 中 kind=subagent 的实时事件）。

  CRUD 管理受限于 agent-core：daemon 没有暴露 agent/subagent 配置的 REST/RPC，
  且 ~/.kimi-code/agents/ 目录不被扫描。待 agent-core 支持磁盘 profile 加载后，
  可在此扩展创建/编辑/删除 UI。
-->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import * as client from '../../stores/client.svelte';

  // Built-in agent-core profiles (packages/agent-core/src/profile/default/).
  // Static — agent-core does not load user-defined profiles from disk today.
  const BUILTIN_PROFILES = [
    {
      name: 'agent',
      role: '主 agent',
      description: '默认 Kimi Code agent，拥有完整工具集（读写、Bash、计划、Swarm 等）。',
      tools: '全工具',
      color: 'var(--ac)',
    },
    {
      name: 'coder',
      role: '子 agent · 代码编写',
      description: '通用软件工程 agent —— 唯一有文件编辑工具的子 agent，用于任何需要修改代码的委派任务。',
      tools: '读写 + 编辑 + Bash',
      color: 'var(--color-done)',
    },
    {
      name: 'explore',
      role: '子 agent · 只读探索',
      description: '快速代码库探索，prompt 强制只读行为，不改文件。',
      tools: '读 + Grep + Glob',
      color: 'var(--color-info, var(--ac))',
    },
    {
      name: 'plan',
      role: '子 agent · 规划',
      description: '只读的实现规划与架构设计，产出计划但不执行修改。',
      tools: '读 + 计划',
      color: 'var(--amb)',
    },
  ] as const;

  // Live subagent tasks for the active session (swarm / Task tool children).
  const liveSubagents = $derived(
    client.tasks().filter((t) => t.kind === 'subagent'),
  );

  function formatElapsed(startedAt?: string): string {
    if (!startedAt) return '';
    const ms = Date.now() - new Date(startedAt).getTime();
    const sec = Math.max(0, Math.round(ms / 1000));
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    return `${min}m ${sec % 60}s`;
  }
</script>

<h2>子智能体</h2>
<p class="sub-desc">主 agent 可委派的子 agent 类型 + 当前会话的实时子 agent</p>

<!-- 系统内置 profile -->
<h3 class="section-title">系统内置</h3>
<div class="list-meta">
  <span>{BUILTIN_PROFILES.length} 个内置 profile</span>
  <span class="dim-i">来自 agent-core，不可编辑</span>
</div>
{#each BUILTIN_PROFILES as p (p.name)}
  <div class="item-row builtin">
    <span class="isq" style="background: {p.color}22; color: {p.color};"><Icon name="git-branch" size="sm" /></span>
    <span class="ir">
      <span class="it">{p.name}<span class="role-tag">{p.role}</span></span>
      <span class="id">{p.description}</span>
      <span class="tool-line mono">工具：{p.tools}</span>
    </span>
  </div>
{/each}

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
  <p class="empty-text">当前会话没有运行中的子 agent。使用 Task 工具或启用 Swarm 模式后，子 agent 会在此显示。</p>
{/if}

<!-- 架构限制说明 -->
<div class="arch-note">
  <Icon name="information" size="sm" />
  <span>自定义子 agent profile 暂不支持：agent-core 当前只加载内置 profile，不从 <code>~/.kimi-code/agents/</code> 读取用户配置。待核心支持后，这里会扩展为完整的 CRUD 管理。</span>
</div>

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
  .id.mono { font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tool-line { font-size: 10px; color: var(--tx3); opacity: 0.8; }

  .pchip { font-size: 10px; color: var(--color-done); background: var(--color-done-soft); border-radius: var(--g-radius-chip, 99px); padding: 2px 8px; font-weight: 600; flex: none; }
  .pchip.running { color: var(--ac); background: var(--ac-soft); }

  .empty-text { color: var(--tx3); font-size: 13px; }

  .arch-note { display: flex; gap: 8px; align-items: flex-start; margin-top: 20px; padding: 12px 14px; border-radius: var(--g-radius-card, 4px); background: var(--ac-soft); border: 1px solid var(--ac-bd); font-size: 11px; color: var(--tx2); line-height: 1.5; }
  .arch-note :global(svg) { flex: none; color: var(--ac); margin-top: 1px; }
  .arch-note code { font-family: var(--font-mono); font-size: 10.5px; background: var(--l2); padding: 1px 4px; border-radius: 3px; }
</style>
