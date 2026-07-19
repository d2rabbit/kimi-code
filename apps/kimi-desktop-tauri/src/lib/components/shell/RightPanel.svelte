<!-- RightPanel.svelte — right rail with two content states (same component):
     default = side-by-side plan + changed files; review = inline diff review
     (wider, ←/✕ back to default). Collapsible to an edge tab. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import FilePreview from '../chat/FilePreview.svelte';
  import * as client from '../../stores/client.svelte';
  import { getKimiWebApi } from '../../api';

  type Mode = 'default' | 'review';
  let mode = $state<Mode>('default');
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

  // --- Git data ---
  let gitData = $state<{
    branch: string; ahead: number; behind: number;
    entries: Record<string, string>; additions: number; deletions: number;
  } | null>(null);
  let gitLoading = $state(false);

  async function loadGitStatus() {
    if (!activeSessionId) return;
    gitLoading = true;
    try {
      const api = getKimiWebApi();
      gitData = await api.getGitStatus(activeSessionId);
    } catch { gitData = null; }
    finally { gitLoading = false; }
  }

  // GitTree 刷新策略（避免频繁刷新）：
  // - 会话切换时加载一次；
  // - 仅当 agent 正在运行（可能正在改文件）时才 6s 轮询；
  // - 每轮对话结束后再补一次。静止会话零轮询。
  const isTauri = '__TAURI_INTERNALS__' in globalThis;
  $effect(() => {
    void activeSessionId;
    gitData = null;
    if (activeSessionId) void loadGitStatus();
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
    } catch (e) {
      console.error('checkout failed', e);
    } finally {
      branchBusy = false;
    }
  }

  const changedFiles = $derived.by(() => {
    if (!gitData) return [];
    return Object.entries(gitData.entries)
      .map(([path, status]) => ({ path, status }))
      .sort((a, b) => a.path.localeCompare(b.path));
  });

  const statusColor: Record<string, string> = {
    M: 'var(--warn)', A: 'var(--ok)', D: 'var(--err)', R: 'var(--color-done)', U: 'var(--color-warning)',
  };

  // --- Review mode ---
  function openReview(path: string) {
    void client.client.openFilePreview(path, 'diff');
    mode = 'review';
  }
  function closeReview() {
    mode = 'default';
  }
</script>

{#if !collapsed}
  <aside class="rail" class:review={mode === 'review'}>
    {#if mode === 'default'}
      <div class="rail-top">
        <section class="rail-column plan-column">
          <div class="panel-head">
            <div class="sec-t">计划<span class="r">{#if realTasks.length > 0}{doneCount}/{realTasks.length}{/if}</span></div>
            <button class="collapse-btn" onclick={toggle} aria-label="折叠右栏" type="button"><Icon name="panel-collapse" size="sm" /></button>
          </div>
          <div class="rail-sec plan-body">
            {#if hasActiveSession && realTasks.length > 0}
              {#each realTasks as task (task.id)}
                {@const st = stepState(task.status)}
                <div class="plan-r" class:cur={st === 'run'} class:todo={st === 'todo'}>
                  {#if st === 'done'}<span class="pc done">✓</span>
                  {:else if st === 'run'}<span class="pc run"></span>
                  {:else}<span class="pc"></span>{/if}
                  <span class="plan-t">{task.description}</span>
                </div>
              {/each}
            {:else}
              <p class="empty-note">暂无进行中的计划</p>
            {/if}
          </div>
        </section>

        <section class="rail-column files-column">
          <div class="panel-head">
            <div class="sec-t">变更文件{#if gitData}<span class="r mono">+{gitData.additions} −{gitData.deletions}</span>{/if}</div>
          </div>
          <div class="rail-sec gtree mono files-body">
          {#if hasActiveSession && gitLoading}
            <p class="empty-note">加载 Git 状态…</p>
          {:else if hasActiveSession && gitData}
            <div class="branch-row">
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
            {#if changedFiles.length > 0}
              <div class="file-list">
                {#each changedFiles as f (f.path)}
                  <button class="f" onclick={() => openReview(f.path)} type="button" title={f.path}>
                    <span class="fst" style="color: {statusColor[f.status] ?? 'var(--tx3)'}">{f.status}</span>
                    <span class="file-meta">
                      <span class="fname">{f.path.split('/').pop() ?? f.path}</span>
                      <span class="fpath">{f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '根目录'}</span>
                    </span>
                    <Icon name="arrow-right" size="sm" />
                  </button>
                {/each}
              </div>
              <p class="hint-note">点击文件查看变更</p>
            {:else}
              <p class="empty-note">工作区干净，无改动</p>
            {/if}
          {:else if hasActiveSession}
            <p class="empty-note">无法获取 Git 状态<span class="dim">（可能不是 Git 仓库）</span></p>
          {:else}
            <p class="empty-note">选择会话后显示改动</p>
          {/if}
          </div>
        </section>
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
    transition: width var(--duration-base) var(--ease);
  }
  .rail.review { width: 520px; }

  .rail-top { display: flex; height: 100%; overflow: hidden; }
  .rail-column { min-width: 0; flex: 1 1 0; display: flex; flex-direction: column; overflow: hidden; }
  .rail-column + .rail-column { border-left: 1px solid var(--bd); }
  .panel-head { flex: none; display: flex; align-items: center; min-height: 42px; border-bottom: 1px solid var(--bd); }
  .rail-sec { padding: 2px 10px 12px; }
  .plan-body, .files-body { flex: 1; overflow-y: auto; }
  .sec-t {
    display: flex; align-items: center; gap: 6px;
    padding: 0 12px;
    font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--tx3); font-weight: 600;
  }
  .sec-t .r { margin-left: auto; letter-spacing: 0; font-weight: 400; }
  .mono { font-family: var(--font-mono); }

  .collapse-btn {
    margin: 0 8px 0 auto; width: 22px; height: 22px; border: none;
    border-radius: var(--r-sm); background: transparent; color: var(--tx3);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
  }
  .collapse-btn:hover { background: var(--color-hover); color: var(--tx2); }
  .collapse-btn { flex: none; }

  /* Plan */
  .plan-r { display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--tx2); padding: 4px 0; }
  .plan-r.cur { color: var(--tx); }
  .plan-r.todo { opacity: 0.45; }
  .plan-t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pc { width: 15px; height: 15px; border-radius: 50%; border: 1.5px solid var(--bd2); flex: none; display: flex; align-items: center; justify-content: center; font-size: 8px; }
  .pc.done { background: var(--ok); border-color: var(--ok); color: #fff; }
  .pc.run { border-color: var(--ac); position: relative; }
  .pc.run::after { content: ""; position: absolute; inset: 2.5px; border-radius: 50%; background: var(--ac); animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.35; } }

  /* GitTree */
  .branch-row { position: relative; display: flex; align-items: center; gap: 5px; padding: 2px 4px 6px; color: var(--tx2); font-size: 11px; }
  .branch-btn { display: inline-flex; align-items: center; gap: 5px; border: none; border-radius: var(--r-sm); background: transparent; color: var(--tx2); font: inherit; cursor: pointer; padding: 2px 5px; }
  .branch-btn:hover { background: var(--ac-soft); color: var(--tx); }
  .branch-btn .chev { font-size: 8px; color: var(--tx3); }
  .branch-menu { position: absolute; top: 100%; left: 0; z-index: 60; min-width: 170px; max-height: 260px; overflow-y: auto; }
  .branch-menu .glass-menu-item.on { color: var(--ac); font-weight: 600; }
  .gtree { font-size: 11px; }
  .f {
    display: flex; align-items: center; gap: 8px; width: 100%;
    padding: 7px 7px; border: 1px solid transparent; border-radius: 7px; background: transparent;
    color: var(--tx2); font: inherit; cursor: pointer; text-align: left;
    transition: background var(--duration-fast) var(--ease), border-color var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease), transform 120ms var(--ease);
  }
  .f:hover { background: var(--ac-soft); border-color: var(--ac-bd); color: var(--tx); }
  .f:active { transform: scale(0.98); }
  .fst { font-weight: 700; width: 10px; text-align: center; flex: none; }
  .file-list { display: flex; flex-direction: column; gap: 2px; }
  .file-meta { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .fname, .fpath { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fname { color: var(--tx2); }
  .fpath { color: var(--tx3); font-size: 9px; }
  .f :global(svg) { flex: none; color: var(--tx3); opacity: 0; transition: opacity var(--duration-fast) var(--ease), transform var(--duration-fast) var(--ease); }
  .f:hover :global(svg) { opacity: 1; transform: translateX(2px); }

  .empty-note { font-size: 11px; color: var(--tx3); padding: 8px 4px; }
  .empty-note .dim { opacity: 0.7; }
  .hint-note { font-size: 10px; color: var(--tx3); padding: 10px 4px 0; font-family: var(--font-ui); }

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
