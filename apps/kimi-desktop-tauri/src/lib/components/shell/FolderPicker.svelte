<!-- FolderPicker.svelte — 新建任务时选择工作文件夹（daemon fs:browse 驱动）。
     面包屑 + 目录列表（git 标记）+ 上溯 + 选定，代替无意义的"添加工作区"。 -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import { getKimiWebApi } from '../../api';

  let {
    onselect,
    oncancel,
  }: {
    onselect: (path: string) => void;
    oncancel: () => void;
  } = $props();

  interface DirEntry { name: string; path: string; isDir: boolean; isGitRepo: boolean; branch?: string }

  let currentPath = $state('');
  let parentPath = $state<string | null>(null);
  let entries = $state<DirEntry[]>([]);
  let loading = $state(true);
  let failed = $state(false);

  async function browse(path?: string) {
    loading = true;
    failed = false;
    try {
      const api = getKimiWebApi();
      const r = await api.browseFs(path);
      if (!r.path) {
        failed = true;
        entries = [];
      } else {
        currentPath = r.path;
        parentPath = r.parent;
        entries = r.entries.filter((e) => e.isDir);
      }
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }

  $effect(() => { void browse(); });

  const crumbs = $derived.by(() => {
    if (!currentPath) return [] as string[];
    const parts = currentPath.split('/').filter(Boolean);
    return parts.map((_, i) => '/' + parts.slice(0, i + 1).join('/'));
  });

  function crumbLabel(c: string): string {
    if (c === '/') return '/';
    return c.split('/').filter(Boolean).pop() ?? c;
  }
</script>

<div class="fp-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) oncancel(); }} onkeydown={(e) => { if (e.key === 'Escape') oncancel(); }}>
  <div class="fp-dialog animate-spring-in" role="dialog" aria-modal="true" aria-label="选择工作文件夹">
    <div class="fp-head">
      <span class="fp-title">选择工作文件夹</span>
      <span class="fp-sub">新任务将在此文件夹中进行</span>
      <button class="fp-x" onclick={oncancel} aria-label="关闭"><Icon name="close" size="sm" /></button>
    </div>

    <div class="fp-crumbs">
      {#each crumbs as c, i (c)}
        {#if i > 0}<span class="sep">/</span>{/if}
        <button class="crumb" class:cur={i === crumbs.length - 1} onclick={() => browse(c)} type="button">{crumbLabel(c)}</button>
      {/each}
    </div>

    <div class="fp-list">
      {#if loading}
        <div class="fp-state"><span class="spin"></span></div>
      {:else if failed}
        <div class="fp-state">无法浏览此目录</div>
      {:else if entries.length === 0}
        <div class="fp-state">没有子文件夹</div>
      {:else}
        <div class="fp-up-row">
          {#if parentPath}
            <button class="fp-up" onclick={() => browse(parentPath!)} type="button">↑ 上一级</button>
          {/if}
        </div>
        {#each entries as e (e.path)}
          <button class="fp-item" onclick={() => browse(e.path)} type="button">
            <span class="fp-ic"><Icon name="folder-solid" size="sm" /></span>
            <span class="fp-name">{e.name}</span>
            {#if e.isGitRepo}<span class="fp-git"><Icon name="git-branch" size="sm" />{e.branch}</span>{/if}
          </button>
        {/each}
      {/if}
    </div>

    <div class="fp-foot">
      <span class="fp-cur" title={currentPath}>{currentPath || '…'}</span>
      <button class="fp-select" disabled={!currentPath || failed} onclick={() => onselect(currentPath)} type="button">在此文件夹开始 →</button>
    </div>
  </div>
</div>

<style>
  .fp-backdrop { position: fixed; inset: 0; z-index: var(--z-modal, 400); display: flex; align-items: center; justify-content: center; background: var(--overlay); }
  .fp-dialog { width: min(480px, 92vw); max-height: 70vh; display: flex; flex-direction: column; background: var(--l3); border: 1px solid var(--bd2); border-radius: var(--r-xl); box-shadow: var(--sh-lg); overflow: hidden; }
  .fp-head { display: flex; align-items: baseline; gap: 8px; padding: 14px 16px 10px; }
  .fp-title { font-size: 13.5px; font-weight: 700; color: var(--tx); }
  .fp-sub { font-size: 11px; color: var(--tx3); }
  .fp-x { margin-left: auto; width: 24px; height: 24px; border: none; border-radius: var(--r-sm); background: transparent; color: var(--tx3); cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .fp-x:hover { background: var(--ac-soft); color: var(--tx); }

  .fp-crumbs { display: flex; align-items: center; gap: 2px; padding: 0 16px 10px; overflow-x: auto; white-space: nowrap; }
  .crumb { border: none; background: transparent; color: var(--tx3); font-size: 11.5px; font-family: var(--font-mono); cursor: pointer; padding: 1px 3px; border-radius: 4px; }
  .crumb:hover { color: var(--ac); background: var(--ac-soft); }
  .crumb.cur { color: var(--tx); font-weight: 600; }
  .fp-crumbs .sep { color: var(--tx3); font-size: 10px; }

  .fp-list { flex: 1; overflow-y: auto; border-top: 1px solid var(--bd); border-bottom: 1px solid var(--bd); padding: 6px; min-height: 180px; max-height: 320px; }
  .fp-state { display: flex; align-items: center; justify-content: center; padding: 40px 0; color: var(--tx3); font-size: 12px; }
  .spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--bd); border-top-color: var(--ac); animation: rot 0.8s linear infinite; }
  @keyframes rot { to { transform: rotate(360deg); } }
  .fp-up-row { padding: 2px 4px 4px; }
  .fp-up { border: none; background: transparent; color: var(--tx3); font-size: 11px; cursor: pointer; padding: 3px 8px; border-radius: var(--r-sm); }
  .fp-up:hover { color: var(--tx); background: var(--color-hover); }
  .fp-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; border: none; border-radius: var(--r-md); background: transparent; color: var(--tx2); font-size: 12.5px; cursor: pointer; text-align: left; transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease); }
  .fp-item:hover { background: var(--ac-soft); color: var(--tx); }
  .fp-ic { color: var(--ac); display: flex; flex: none; }
  .fp-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); font-size: 12px; }
  .fp-git { display: inline-flex; align-items: center; gap: 3px; font-size: 9.5px; color: var(--tx3); font-family: var(--font-mono); flex: none; }

  .fp-foot { display: flex; align-items: center; gap: 10px; padding: 10px 16px; }
  .fp-cur { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); font-size: 10.5px; color: var(--tx3); direction: rtl; text-align: left; }
  .fp-select { height: 28px; padding: 0 14px; border: none; border-radius: var(--r-md); background: var(--ac); color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background var(--duration-fast) var(--ease), transform var(--duration-fast) var(--ease); }
  .fp-select:hover:not(:disabled) { background: var(--ac-h); transform: translateY(-1px); }
  .fp-select:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
