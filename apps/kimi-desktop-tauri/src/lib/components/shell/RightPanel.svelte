<!-- RightPanel.svelte — right rail with two content states (same component):
     default = side-by-side plan + changed files; review = inline diff review
     (wider, ←/✕ back to default). Collapsible to an edge tab. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import FilePreview from '../chat/FilePreview.svelte';
  import TerminalPanel from './TerminalPanel.svelte';
  import * as client from '../../stores/client.svelte';
  import { getKimiWebApi } from '../../api';

  type Mode = 'default' | 'review';
  type Tool = 'git' | 'tasks' | 'terminal';
  let mode = $state<Mode>('default');
  let activeTool = $state<Tool>('git');
  let collapsed = $state(false);

  function toggle() { collapsed = !collapsed; }

  // --- Plan (real session tasks → plan steps) ---
  const realTasks = $derived(client.tasks());
  const hasActiveSession = $derived(!!client.activeSessionId());
  const activeSessionId = $derived(client.activeSessionId());

  type StepState = 'done' | 'run' | 'todo';
  function stepState(status: string): StepState {
    if (status === 'completed') return 'done';
    if (status === 'running' || status === 'working' || status === 'queued') return 'run';
    return 'todo';
  }
  const doneCount = $derived(realTasks.filter((t) => t.status === 'completed').length);
  const taskProgress = $derived(realTasks.length > 0 ? Math.round((doneCount / realTasks.length) * 100) : 0);
  // Active goal for the session (null when no goal is running). Falls back to
  // the session title only when no goal is set, so the card stays informative.
  const activeGoal = $derived(client.goal());
  const goalTitle = $derived(activeGoal?.objective ?? client.activeSession()?.title ?? '完成当前会话目标');
  const goalStatusLabel = $derived.by(() => {
    const s = activeGoal?.status;
    if (s === 'active') return '进行中';
    if (s === 'paused') return '已暂停';
    if (s === 'blocked') return '已阻塞';
    if (s === 'complete') return '已完成';
    return null;
  });

  // --- Git data ---
  let gitData = $state<{
    branch: string; ahead: number; behind: number;
    entries: Record<string, string>; additions: number; deletions: number;
  } | null>(null);
  let gitLog = $state<{
    hash: string; shortHash: string; author: string; relativeTime: string; subject: string;
  }[]>([]);
  let gitLogLoading = $state(false);
  type CommitFile = { path: string; status: string; additions: number; deletions: number; diff: string };
  let commitFiles = $state<Record<string, CommitFile[]>>({});
  let expandedCommit = $state<string | null>(null);
  let expandedFile = $state<string | null>(null);
  let commitFilesLoading = $state<string | null>(null);

  async function loadGitStatus() {
    if (!activeSessionId) return;
    try {
      const api = getKimiWebApi();
      gitData = await api.getGitStatus(activeSessionId);
    } catch { gitData = null; }
  }

  async function loadGitLog() {
    if (!isTauri || !sessionCwd) return;
    gitLogLoading = true;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      gitLog = await invoke<typeof gitLog>('git_log', { cwd: sessionCwd, limit: 24 });
    } catch {
      gitLog = [];
    } finally {
      gitLogLoading = false;
    }
  }

  // GitTree 刷新策略（避免频繁刷新）：
  // - 会话切换时加载一次；
  // - 仅当 agent 正在运行（可能正在改文件）时才 6s 轮询；
  // - 每轮对话结束后再补一次。静止会话零轮询。
  const isTauri = '__TAURI_INTERNALS__' in globalThis;
  $effect(() => {
    void activeSessionId;
    gitData = null;
    gitLog = [];
    commitFiles = {};
    expandedCommit = null;
    expandedFile = null;
    if (activeSessionId) void loadGitStatus();
    if (activeSessionId) void loadGitLog();
  });
  $effect(() => {
    if (client.activity() !== 'running' || !activeSessionId) return;
    const timer = setInterval(() => { void loadGitStatus(); }, 6000);
    return () => clearInterval(timer);
  });
  let lastTurnCount = 0;
  $effect(() => {
    const n = client.turns().length;
    if (n !== lastTurnCount) {
      lastTurnCount = n;
      if (activeSessionId && n > 0) void loadGitStatus();
    }
  });

  // ---- 分支切换 ----
  let branches = $state<string[]>([]);
  let branchMenuOpen = $state(false);
  let branchBusy = $state(false);
  const sessionCwd = $derived(client.activeSession()?.cwd ?? '');

  async function openBranchMenu() {
    if (!isTauri || !sessionCwd) return;
    branchMenuOpen = !branchMenuOpen;
    if (branchMenuOpen) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        branches = await invoke<string[]>('list_git_branches', { cwd: sessionCwd });
      } catch { branches = []; }
    }
  }

  async function checkout(branch: string) {
    if (branchBusy || !sessionCwd) return;
    branchBusy = true;
    branchMenuOpen = false;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('git_checkout', { cwd: sessionCwd, branch });
      await loadGitStatus();
      await loadGitLog();
    } catch (e) {
      console.error('checkout failed', e);
    } finally {
      branchBusy = false;
    }
  }

  const statusColor: Record<string, string> = {
    M: 'var(--warn)', A: 'var(--ok)', D: 'var(--err)', R: 'var(--color-done)', U: 'var(--color-warning)',
  };

  async function toggleCommit(hash: string) {
    expandedFile = null;
    if (expandedCommit === hash) {
      expandedCommit = null;
      return;
    }
    expandedCommit = hash;
    if (commitFiles[hash]) return;
    commitFilesLoading = hash;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const files = await invoke<CommitFile[]>('git_commit_files', { cwd: sessionCwd, hash });
      commitFiles = { ...commitFiles, [hash]: files };
    } catch {
      commitFiles = { ...commitFiles, [hash]: [] };
    } finally {
      commitFilesLoading = null;
    }
  }

  function toggleCommitFile(hash: string, path: string) {
    const key = `${hash}:${path}`;
    expandedFile = expandedFile === key ? null : key;
  }

  function diffPreview(diff: string): { kind: 'add' | 'del' | 'meta' | 'ctx'; text: string }[] {
    return diff.split('\n').map((text) => ({
      text,
      kind: text.startsWith('+') && !text.startsWith('+++') ? 'add'
        : text.startsWith('-') && !text.startsWith('---') ? 'del'
          : text.startsWith('@') || text.startsWith('---') || text.startsWith('+++') ? 'meta'
            : 'ctx',
    }));
  }

  // --- Review mode ---
  function closeReview() {
    mode = 'default';
  }
</script>

{#if !collapsed}
  <aside class="rail" class:review={mode === 'review'}>
    {#if mode === 'default'}
      <div class="rail-top">
        <div class="tool-head">
          <div class="tool-brand">
            {#if activeTool === 'git'}
              <Icon name="git-branch" size="sm" />
              <span>Git 工具</span>
            {:else if activeTool === 'tasks'}
              <Icon name="check-list" size="sm" />
              <span>任务进度</span>
            {:else}
              <Icon name="terminal" size="sm" />
              <span>终端</span>
            {/if}
          </div>
          <div class="tool-tabs" role="tablist" aria-label="右侧工具">
            <button class:active={activeTool === 'git'} class="tool-tab" onclick={() => activeTool = 'git'} type="button" role="tab" aria-selected={activeTool === 'git'}>
              <Icon name="git-branch" size="sm" /><span>Git</span>
            </button>
            <button class:active={activeTool === 'tasks'} class="tool-tab" onclick={() => activeTool = 'tasks'} type="button" role="tab" aria-selected={activeTool === 'tasks'}>
              <Icon name="check-list" size="sm" /><span>任务</span>
            </button>
            <button class:active={activeTool === 'terminal'} class="tool-tab" onclick={() => activeTool = 'terminal'} type="button" role="tab" aria-selected={activeTool === 'terminal'}>
              <Icon name="terminal" size="sm" /><span>终端</span>
            </button>
          </div>
          <button class="collapse-btn" onclick={toggle} aria-label="折叠右栏" type="button"><Icon name="panel-collapse" size="sm" /></button>
        </div>

        {#if activeTool === 'tasks'}
          <section class="tool-view task-view">
            <div class="task-subtitle">Kimi Code · 当前会话</div>
            <div class="goal-row">
              <span class="goal-label">目标</span>
              {#if goalStatusLabel}<span class="goal-status"><span class="live-dot"></span>{goalStatusLabel}</span>{:else if client.activity() === 'running'}<span class="goal-status"><span class="live-dot"></span>进行中</span>{/if}
            </div>
            <div class="goal-card">
              <span class="goal-caption">{activeGoal ? '目标模式' : '当前目标'}</span>
              <strong>{goalTitle}</strong>
              {#if activeGoal?.completionCriterion}
                <span class="goal-criterion">{activeGoal.completionCriterion}</span>
              {/if}
            </div>
            <div class="task-progress-head">
              <span>任务进度</span>
              <b>{doneCount}/{realTasks.length}</b>
            </div>
            <div class="task-progress-track"><span style="width: {taskProgress}%"></span></div>
            <div class="task-list">
              {#if hasActiveSession && realTasks.length > 0}
                {#each realTasks as task (task.id)}
                  {@const st = stepState(task.status)}
                  {@const failing = task.status === 'failed' || task.status === 'cancelled'}
                  <div class="task-item" class:todo={st === 'todo'} class:failing>
                    {#if st === 'done'}<span class="task-check done">✓</span>
                    {:else if st === 'run'}<span class="task-check run"></span>
                    {:else if failing}<span class="task-check fail">✕</span>
                    {:else}<span class="task-check"></span>{/if}
                    <span class="task-name">{task.description}</span>
                    {#if st === 'run'}
                      <button class="task-cancel" title="取消任务" type="button"
                        onclick={() => void client.client.cancelTask(task.id)}>取消</button>
                    {/if}
                  </div>
                {/each}
              {:else}
                <p class="empty-note">暂无进行中的计划</p>
              {/if}
            </div>
          </section>
        {:else if activeTool === 'terminal'}
          <section class="tool-view terminal-view">
            {#if hasActiveSession}
              <TerminalPanel />
            {:else}
              <p class="empty-note">选择会话后启动终端</p>
            {/if}
          </section>
        {:else}
          <section class="tool-view git-view">
            <div class="git-stats">
              <span class="git-stat add">+ {gitData?.additions ?? 0}</span>
              <span class="git-stat del">− {gitData?.deletions ?? 0}</span>
            </div>
            {#if hasActiveSession && gitData}
              <div class="git-actions">
                <div class="branch-wrap">
                  <button class="branch-btn" onclick={openBranchMenu} type="button" title="切换分支">
                    <Icon name="git-branch" size="sm" /><span class="mono">{gitData.branch}</span><span class="chev">▾</span>
                  </button>
                  {#if branchMenuOpen}
                    <div class="branch-menu glass-menu animate-spring-in" role="menu">
                      {#each branches as b (b)}
                        <button class="glass-menu-item" class:on={b === gitData.branch} onclick={() => checkout(b)} type="button">
                          {b}{#if b === gitData.branch}<span style="margin-left:auto;color:var(--ok)">✓</span>{/if}
                        </button>
                      {:else}
                        <div class="glass-menu-item" style="color:var(--tx3);cursor:default">无本地分支</div>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
            <div class="timeline-heading">
              <span>提交历史</span>
              <span class="timeline-count">{gitLog.length}</span>
            </div>
            <div class="git-timeline">
              {#if gitLogLoading}
                <p class="empty-note">加载提交历史…</p>
              {:else if gitLog.length > 0}
                {#each gitLog as commit (commit.hash)}
                  <div class="commit-entry">
                  <button class="commit-row" class:expanded={expandedCommit === commit.hash} onclick={() => toggleCommit(commit.hash)} type="button" title={commit.subject}>
                    <span class="commit-rail"><span class="commit-dot"></span></span>
                    <span class="commit-copy">
                      <span class="commit-subject">{commit.subject}</span>
                      <span class="commit-meta"><span class="commit-hash mono">{commit.shortHash}</span>{commit.author} · {commit.relativeTime}</span>
                    </span>
                    <Icon name="chevron-right" size="sm" class="commit-chevron" />
                  </button>
                  {#if expandedCommit === commit.hash}
                    <div class="commit-files">
                      {#if commitFilesLoading === commit.hash}
                        <p class="empty-note">加载提交文件…</p>
                      {:else if (commitFiles[commit.hash] ?? []).length > 0}
                        {#each commitFiles[commit.hash] ?? [] as file (file.path)}
                          {@const fileKey = `${commit.hash}:${file.path}`}
                          <button class="commit-file" class:expanded={expandedFile === fileKey} onclick={() => toggleCommitFile(commit.hash, file.path)} type="button">
                            <span class="commit-file-status" style="color: {statusColor[file.status[0] ?? ''] ?? 'var(--tx3)'}">{file.status[0] ?? '?'}</span>
                            <span class="commit-file-name">{file.path}</span>
                            <span class="commit-file-stats"><span class="add-text">+{file.additions}</span> <span class="del-text">−{file.deletions}</span></span>
                            <Icon name="chevron-right" size="sm" />
                          </button>
                          {#if expandedFile === fileKey}
                            <div class="commit-inline-diff">
                              {#each diffPreview(file.diff) as line, lineIndex (`${file.path}-${lineIndex}`)}
                                <div class="inline-diff-line diff-{line.kind}">{line.text}</div>
                              {/each}
                            </div>
                          {/if}
                        {/each}
                      {:else}
                        <p class="empty-note">此提交没有可展示的文件</p>
                      {/if}
                    </div>
                  {/if}
                  </div>
                {/each}
              {:else}
                <p class="empty-note">暂无提交历史</p>
              {/if}
            </div>
          </section>
        {/if}
      </div>
    {:else}
      <!-- Review mode: same rail, wider, ←/✕ back -->
      <div class="rv-head">
        <button class="x" onclick={closeReview} title="返回 计划/GitTree" type="button">←</button>
        <span class="rv-title">更改审查</span>
        <button class="x" onclick={closeReview} title="关闭" type="button">✕</button>
      </div>
      <div class="rv-body">
        <FilePreview />
      </div>
    {/if}
  </aside>
{:else}
  <button class="expand-tab" onclick={toggle} aria-label="展开右栏" type="button">
    <Icon name="panel-expand" size="sm" />
  </button>
{/if}

<style>
  .rail {
    flex: none; width: 438px; height: 100%;
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--l1);
    border-left: 1px solid var(--bd);
    transition: width var(--duration-base, 160ms) var(--ease, ease);
  }
  .rail.review { width: 520px; }

  .rail-top { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .tool-head { flex: none; display: flex; align-items: center; gap: 10px; min-height: 50px; padding: 0 12px; border-bottom: 1px solid var(--bd); }
  .tool-brand { display: inline-flex; align-items: center; gap: 7px; color: var(--tx); font-size: 14px; font-weight: 650; letter-spacing: -0.01em; }
  .tool-brand :global(.icon-wrap) { color: var(--ac); }
  .tool-tabs { display: flex; align-items: center; gap: 2px; margin-left: auto; padding: 3px; border: 1px solid var(--bd); border-radius: 8px; background: var(--l2); }
  .tool-tab { display: inline-flex; align-items: center; gap: 5px; height: 27px; padding: 0 8px; border: none; border-radius: 6px; background: transparent; color: var(--tx3); font-size: 11px; cursor: pointer; position: relative; transition: background var(--duration-base) var(--ease), color var(--duration-fast) var(--ease), transform 120ms var(--ease); }
  .tool-tab:hover { color: var(--tx); background: var(--color-hover); }
  .tool-tab.active { background: var(--ac-soft); color: var(--ac); }
  /* active 下划线从中心展开 */
  .tool-tab::after {
    content: '';
    position: absolute;
    bottom: 2px;
    left: 50%;
    width: 0;
    height: 2px;
    background: var(--ac);
    border-radius: 1px;
    transform: translateX(-50%);
    transition: width var(--duration-base) var(--ease);
  }
  .tool-tab.active::after { width: 60%; }
  .tool-tab:active { transform: scale(0.97); }
  .tool-view { flex: 1; min-height: 0; overflow: hidden; }
  .task-view, .git-view { padding: 18px 16px; overflow-y: auto; }
  .terminal-view { padding: 0; overflow: hidden; }
  .mono { font-family: var(--font-mono); }
  .mono { font-family: var(--font-mono); }

  .collapse-btn {
    flex: none; width: 24px; height: 24px; border: none;
    border-radius: var(--r-sm); background: transparent; color: var(--tx3);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
  }
  .collapse-btn:hover { background: var(--color-hover); color: var(--tx2); }
  /* Task progress */
  .task-subtitle { color: var(--tx3); font-size: 11px; margin-bottom: 22px; }
  .goal-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .goal-label { color: var(--tx); font-size: 16px; font-weight: 650; }
  .goal-status { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border-radius: 7px; background: var(--ok-soft); color: var(--ok); font-family: var(--font-mono); font-size: 11px; }
  .live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); animation: kimi-pulse 1.5s ease-in-out infinite; }
  .goal-card { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid var(--bd2); border-radius: 12px; background: var(--l2); margin-bottom: 26px; }
  .goal-caption { color: var(--tx3); font-size: 11px; }
  .goal-card strong { color: var(--tx); font-size: 14px; line-height: 1.45; font-weight: 600; }
  .goal-criterion { color: var(--tx3); font-size: 11px; line-height: 1.4; padding-top: 4px; border-top: 1px dashed var(--bd2); }
  .task-progress-head { display: flex; align-items: center; justify-content: space-between; margin: 0 2px 10px; color: var(--tx); font-size: 14px; font-weight: 650; }
  .task-progress-head b { padding: 5px 9px; border-radius: 999px; background: var(--ok-soft); color: var(--ok); font-family: var(--font-mono); font-size: 11px; }
  .task-progress-track { height: 6px; overflow: hidden; border-radius: 999px; background: var(--bd); margin-bottom: 20px; }
  .task-progress-track span { display: block; height: 100%; border-radius: inherit; background: var(--ok); transform-origin: left center; transition: transform 220ms var(--ease-out, ease); }
  .task-list { display: flex; flex-direction: column; gap: 4px; }
  .task-item { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 6px 4px; color: var(--tx); border-radius: 8px; transition: background var(--duration-fast) var(--ease); }
  .task-item:hover { background: var(--color-hover); }
  .task-item.todo { color: var(--tx3); }
  .task-item.failing { color: var(--err); }
  .task-item :global(.icon-wrap) { margin-left: auto; color: var(--tx3); }
  .task-name { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .task-cancel { flex: none; padding: 2px 8px; border: 1px solid var(--color-danger-bd); border-radius: var(--r-sm); background: transparent; color: var(--err); font: inherit; font-size: 10.5px; cursor: pointer; opacity: 0; transition: opacity var(--duration-fast) var(--ease), background var(--duration-fast) var(--ease); }
  .task-item:hover .task-cancel { opacity: 1; }
  .task-cancel:hover { background: var(--err-soft); }
  .task-check { width: 20px; height: 20px; flex: none; border: 2px solid var(--bd2); border-radius: 50%; }
  .task-check.done { display: flex; align-items: center; justify-content: center; border-color: var(--ok); background: var(--ok); color: #07140c; font-size: 12px; font-weight: 800; }
  .task-check.run { position: relative; border-color: var(--ac); }
  .task-check.run::after { content: ""; position: absolute; inset: 4px; border-radius: 50%; background: var(--ac); animation: kimi-pulse 1.5s ease-in-out infinite; }
  .task-check.fail { display: flex; align-items: center; justify-content: center; border-color: var(--err); color: var(--err); font-size: 12px; font-weight: 800; }
  @media (prefers-reduced-motion: reduce) {
    .task-check.run::after { animation: none; }
  }

  /* Git tool */
  .git-stats { display: flex; gap: 10px; margin-bottom: 16px; }
  .git-stat { display: inline-flex; align-items: center; min-height: 32px; padding: 0 11px; border-radius: 8px; font-family: var(--font-mono); font-size: 14px; font-weight: 600; }
  .git-stat.add { background: var(--ok-soft); color: var(--ok); }
  .git-stat.del { background: var(--err-soft); color: var(--err); }
  .git-actions { margin-bottom: 20px; }
  .branch-wrap { position: relative; }
  .branch-btn { display: inline-flex; align-items: center; gap: 6px; width: 100%; min-height: 38px; padding: 0 10px; border: 1px solid var(--bd2); border-radius: 9px; background: var(--l2); color: var(--ac); font: inherit; cursor: pointer; }
  .branch-btn:hover { border-color: var(--ac-bd); background: var(--ac-soft); }
  .branch-btn .chev { font-size: 8px; color: var(--tx3); }
  .branch-menu { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 60; max-height: 260px; overflow-y: auto; }
  .branch-menu .glass-menu-item.on { color: var(--ac); font-weight: 600; }
  .timeline-heading { display: flex; align-items: center; gap: 7px; padding-top: 2px; margin-bottom: 6px; color: var(--tx2); font-size: 12px; font-weight: 650; }
  .timeline-count { min-width: 18px; padding: 2px 5px; border-radius: 999px; background: var(--l3); color: var(--tx3); font-family: var(--font-mono); font-size: 9px; text-align: center; }
  .git-timeline { position: relative; margin: 0 -4px 18px; padding-bottom: 3px; border-bottom: 1px solid var(--bd); }
  .commit-row { position: relative; display: flex; align-items: stretch; gap: 9px; width: 100%; min-height: 43px; padding: 5px 4px; border: none; border-radius: 7px; background: transparent; color: var(--tx2); text-align: left; cursor: pointer; transition: background var(--duration-fast) var(--ease); }
  .commit-row:hover { background: var(--color-hover); }
  .commit-rail { position: relative; display: flex; justify-content: center; width: 12px; flex: none; }
  .commit-rail::after { content: ''; position: absolute; top: 12px; bottom: -10px; width: 1px; background: var(--bd2); }
  .commit-row:last-child .commit-rail::after { display: none; }
  .commit-dot { z-index: 1; width: 7px; height: 7px; margin-top: 5px; border: 2px solid var(--ac); border-radius: 50%; background: var(--l1); }
  .commit-copy { min-width: 0; display: flex; flex: 1; flex-direction: column; gap: 3px; }
  .commit-subject { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx); font-size: 11px; }
  .commit-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx3); font-size: 9px; }
  .commit-hash { margin-right: 5px; color: var(--ac); }
  .commit-chevron { flex: none; align-self: center; color: var(--tx3); transition: transform 160ms var(--ease); }
  .commit-files { margin: 0 0 8px 25px; padding: 4px 0 4px 10px; border-left: 1px solid var(--bd2); }
  .commit-file { display: flex; align-items: center; gap: 7px; width: 100%; min-height: 30px; padding: 4px 6px; border: none; border-radius: 5px; background: transparent; color: var(--tx2); font: inherit; text-align: left; cursor: pointer; }
  .commit-file:hover, .commit-file.expanded { background: var(--color-hover); color: var(--tx); }
  .commit-file-status { width: 14px; flex: none; font-family: var(--font-mono); font-size: 10px; font-weight: 700; }
  .commit-file-name { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); font-size: 10px; }
  .commit-file-stats { flex: none; font-family: var(--font-mono); font-size: 9px; }
  .add-text { color: var(--ok); }
  .del-text { color: var(--err); }
  .commit-file :global(.icon-wrap) { flex: none; color: var(--tx3); transition: transform 160ms var(--ease); }
  .commit-file.expanded :global(.icon-wrap) { transform: rotate(90deg); }
  .commit-inline-diff { max-height: 260px; margin: 0 0 6px 21px; overflow: auto; border-radius: 5px; background: var(--l1); font-family: var(--font-mono); font-size: 9px; line-height: 1.45; }
  .inline-diff-line { padding: 2px 6px; white-space: pre-wrap; word-break: break-word; }
  .inline-diff-line.diff-add { background: var(--ok-soft); color: var(--ok); }
  .inline-diff-line.diff-del { background: var(--err-soft); color: var(--err); }
  .inline-diff-line.diff-meta { color: var(--ac); background: var(--ac-soft); }
  .inline-diff-line.diff-ctx { color: var(--tx3); }

  .empty-note { font-size: 11px; color: var(--tx3); padding: 8px 4px; }

  /* Review mode */
  .rv-head {
    flex: none; display: flex; align-items: center; gap: 8px;
    padding: 0 12px; height: 46px; border-bottom: 1px solid var(--bd);
  }
  .rv-title { font-size: 13px; font-weight: 600; flex: 1; }
  .x {
    width: 24px; height: 24px; border: none; border-radius: var(--r-sm);
    display: flex; align-items: center; justify-content: center;
    background: transparent; color: var(--tx2); cursor: pointer; font-size: 12px;
    transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease);
  }
  .x:hover { background: var(--ac-soft); color: var(--tx); }
  .rv-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

  .expand-tab {
    flex: none; width: 28px; height: 100%; border: none;
    border-left: 1px solid var(--bd); background: var(--l1);
    color: var(--tx3); cursor: pointer;
    display: flex; align-items: flex-start; justify-content: center; padding-top: 12px;
    transition: color var(--duration-fast);
  }
  .expand-tab:hover { color: var(--tx2); }
</style>
