<!-- RightPanel.svelte — right rail with two content states (same component):
     default = 计划 + GitTree; review = inline diff review of a clicked file
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

  // Load on session change; then keep GitTree live: poll every 5s while a
  // session is active (the agent edits files continuously), and refresh once
  // more whenever a turn completes (turn count settles).
  $effect(() => {
    void activeSessionId;
    gitData = null;
    if (!activeSessionId) return;
    void loadGitStatus();
    const timer = setInterval(() => { void loadGitStatus(); }, 5000);
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

  // --- GitTree: build a nested tree from the flat entries map ---
  interface TreeDir { name: string; path: string; dirs: TreeDir[]; files: { name: string; path: string; status: string }[]; }
  const gitTree = $derived.by(() => {
    const root: TreeDir = { name: '', path: '', dirs: [], files: [] };
    if (!gitData) return root;
    const dirMap = new Map<string, TreeDir>();
    dirMap.set('', root);
    function ensureDir(path: string): TreeDir {
      const existing = dirMap.get(path);
      if (existing) return existing;
      const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const parent = ensureDir(parentPath);
      const dir: TreeDir = { name: path.split('/').pop() ?? path, path, dirs: [], files: [] };
      dirMap.set(path, dir);
      parent.dirs.push(dir);
      return dir;
    }
    for (const [path, status] of Object.entries(gitData.entries)) {
      const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      ensureDir(parentPath).files.push({ name: path.split('/').pop() ?? path, path, status });
    }
    return root;
  });

  let collapsedDirs = $state<Set<string>>(new Set());
  function toggleDir(path: string) {
    const next = new Set(collapsedDirs);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    collapsedDirs = next;
  }

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
        <div class="sec-t">计划<span class="r">{#if realTasks.length > 0}{doneCount}/{realTasks.length}{/if}</span>
          <button class="collapse-btn" onclick={toggle} aria-label="折叠右栏" type="button"><Icon name="panel-collapse" size="sm" /></button>
        </div>
        <div class="rail-sec">
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

        <div class="sec-t">GitTree{#if gitData}<span class="r mono">+{gitData.additions} −{gitData.deletions}</span>{/if}</div>
        <div class="rail-sec gtree mono">
          {#if hasActiveSession && gitLoading}
            <p class="empty-note">加载 Git 状态…</p>
          {:else if hasActiveSession && gitData && Object.keys(gitData.entries).length > 0}
            <div class="branch-row"><Icon name="git-branch" size="sm" /><span class="mono">{gitData.branch}</span></div>
            {#snippet treeNode(dir: TreeDir, depth: number)}
              {#each dir.dirs as d (d.path)}
                <button class="dir" style="padding-left: {4 + depth * 14}px" onclick={() => toggleDir(d.path)} type="button">
                  <span class="arrow" class:closed={collapsedDirs.has(d.path)}>▾</span>{d.name}/
                </button>
                {#if !collapsedDirs.has(d.path)}
                  {@render treeNode(d, depth + 1)}
                {/if}
              {/each}
              {#each dir.files as f (f.path)}
                <button class="f" style="padding-left: {4 + depth * 14 + 12}px" onclick={() => openReview(f.path)} type="button" title={f.path}>
                  <span class="fst" style="color: {statusColor[f.status] ?? 'var(--tx3)'}">{f.status}</span>
                  <span class="fname">{f.name}</span>
                </button>
              {/each}
            {/snippet}
            {@render treeNode(gitTree, 0)}
            <p class="hint-note">点击文件 → 右栏切换为审查视图</p>
          {:else if hasActiveSession && gitData}
            <p class="empty-note">工作区干净，无改动</p>
          {:else if hasActiveSession}
            <p class="empty-note">无法获取 Git 状态<span class="dim">（可能不是 Git 仓库）</span></p>
          {:else}
            <p class="empty-note">选择会话后显示改动</p>
          {/if}
        </div>
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
    flex: none; width: 232px; height: 100%;
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--l1);
    border-left: 1px solid var(--bd);
    transition: width var(--duration-base) var(--ease);
  }
  .rail.review { width: 420px; }

  .rail-top { display: flex; flex-direction: column; height: 100%; overflow-y: auto; }
  .rail-sec { padding: 2px 10px 12px; }
  .sec-t {
    display: flex; align-items: center; gap: 6px;
    padding: 12px 14px 6px;
    font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--tx3); font-weight: 600;
  }
  .sec-t .r { margin-left: auto; letter-spacing: 0; font-weight: 400; }
  .mono { font-family: var(--font-mono); }

  .collapse-btn {
    margin-left: auto; width: 22px; height: 22px; border: none;
    border-radius: var(--r-sm); background: transparent; color: var(--tx3);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
  }
  .collapse-btn:hover { background: var(--color-hover); color: var(--tx2); }
  .sec-t .r + .collapse-btn, .collapse-btn { flex: none; }

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
  .branch-row { display: flex; align-items: center; gap: 5px; padding: 2px 4px 6px; color: var(--tx2); font-size: 11px; }
  .gtree { font-size: 11px; }
  .dir {
    display: flex; align-items: center; gap: 5px; width: 100%;
    padding: 2px 4px; border: none; background: transparent;
    color: var(--tx3); font: inherit; cursor: pointer; text-align: left;
  }
  .dir .arrow { font-size: 8px; display: inline-block; transition: transform var(--duration-fast) var(--ease); }
  .dir .arrow.closed { transform: rotate(-90deg); }
  .f {
    display: flex; align-items: center; gap: 6px; width: 100%;
    padding: 2.5px 4px; border: none; border-radius: 5px; background: transparent;
    color: var(--tx2); font: inherit; cursor: pointer; text-align: left;
    transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease);
  }
  .f:hover { background: var(--ac-soft); color: var(--tx); }
  .fst { font-weight: 700; width: 10px; text-align: center; flex: none; }
  .fname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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
