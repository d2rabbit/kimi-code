<!-- FolderPicker.svelte — 新建任务时选择工作文件夹（daemon fs:browse 驱动）。
     面包屑 + 目录列表（git 标记）+ 上溯 + 选定，代替无意义的"添加工作区"。 -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Button from '../ui/Button.svelte';
  import ListRow from '../ui/ListRow.svelte';
  import Spinner from '../ui/Spinner.svelte';
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
      <IconButton class="fp-x" name="close" label="关闭" onclick={oncancel} />
    </div>

    <div class="fp-crumbs">
      {#each crumbs as c, i (c)}
        {#if i > 0}<span class="sep">/</span>{/if}
        <button class="crumb" class:cur={i === crumbs.length - 1} onclick={() => browse(c)} type="button">{crumbLabel(c)}</button>
      {/each}
    </div>

    <div class="fp-list">
      {#if loading}
        <div class="fp-state"><Spinner size="md" /></div>
      {:else if failed}
        <div class="fp-state">无法浏览此目录</div>
      {:else if entries.length === 0}
        <div class="fp-state">没有子文件夹</div>
      {:else}
        <div class="fp-up-row">
          {#if parentPath}
            <Button variant="ghost" size="sm" onclick={() => browse(parentPath!)}>↑ 上一级</Button>
          {/if}
        </div>
        {#each entries as e (e.path)}
          <ListRow class="fp-item" onclick={() => browse(e.path)}>
            {#snippet leading()}
              <span class="fp-ic"><Icon name="folder-solid" size="sm" /></span>
            {/snippet}
            <span class="fp-name">{e.name}</span>
            {#snippet trailing()}
              {#if e.isGitRepo}<span class="fp-git"><Icon name="git-branch" size="sm" />{e.branch}</span>{/if}
            {/snippet}
          </ListRow>
        {/each}
      {/if}
    </div>

    <div class="fp-foot">
      <span class="fp-cur" title={currentPath}>{currentPath || '…'}</span>
      <Button variant="primary" size="sm" disabled={!currentPath || failed} onclick={() => onselect(currentPath)}>在此文件夹开始 →</Button>
    </div>
  </div>
</div>

<style>
  .fp-backdrop { position: fixed; inset: 0; z-index: var(--z-modal, 400); display: flex; align-items: center; justify-content: center; background: var(--overlay); }
  .fp-dialog {
    width: min(480px, 92vw); max-height: 70vh; display: flex; flex-direction: column; overflow: hidden;
    background: var(--mat-surface-3, var(--l3));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd2));
    border-radius: var(--g-radius-overlay, var(--r-xl));
    box-shadow: var(--elev-overlay, var(--sh-lg));
  }
  .fp-head { display: flex; align-items: baseline; gap: 8px; padding: 14px 16px 10px; }
  .fp-title { font-size: 13.5px; font-weight: 700; color: var(--tx); }
  .fp-sub { font-size: 11px; color: var(--tx3); }
  .fp-head :global(.fp-x) { margin-left: auto; }

  .fp-crumbs { display: flex; align-items: center; gap: 2px; padding: 0 16px 10px; overflow-x: auto; white-space: nowrap; }
  .crumb { border: none; background: transparent; color: var(--tx3); font-size: 11.5px; font-family: var(--font-mono); cursor: pointer; padding: 1px 3px; border-radius: 4px; }
  .crumb:hover { color: var(--ac); background: var(--ac-soft); }
  .crumb.cur { color: var(--tx); font-weight: 600; }
  .fp-crumbs .sep { color: var(--tx3); font-size: 10px; }

  .fp-list { flex: 1; overflow-y: auto; border-top: 1px solid var(--bd); border-bottom: 1px solid var(--bd); padding: 6px; min-height: 180px; max-height: 320px; }
  .fp-state { display: flex; align-items: center; justify-content: center; padding: 40px 0; color: var(--tx3); font-size: 12px; }
  .fp-up-row { padding: 2px 4px 4px; }
  .fp-list :global(.fp-item) { padding: 7px 10px; gap: 8px; font-size: 12.5px; color: var(--tx2); }
  .fp-ic { color: var(--ac); display: flex; flex: none; }
  .fp-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); font-size: 12px; }
  .fp-git { display: inline-flex; align-items: center; gap: 3px; font-size: 9.5px; color: var(--tx3); font-family: var(--font-mono); flex: none; }

  .fp-foot { display: flex; align-items: center; gap: 10px; padding: 10px 16px; }
  .fp-cur { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); font-size: 10.5px; color: var(--tx3); direction: rtl; text-align: left; }
</style>
