<!-- PluginsView.svelte — 插件模块页：技能 / MCP / 命令统一由插件承载。 -->
<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import Icon from '../components/ui/Icon.svelte';

  interface PluginInfo {
    id: string;
    displayName: string;
    version: string;
    description: string;
    developer: string;
    enabled: boolean;
    hasMcp: boolean;
    skillCount: number;
    commandCount: number;
  }

  let plugins = $state<PluginInfo[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let query = $state('');

  const isTauri = '__TAURI_INTERNALS__' in globalThis;

  async function load() {
    loading = true;
    error = null;
    if (!isTauri) {
      plugins = [];
      loading = false;
      return;
    }
    try {
      plugins = await invoke<PluginInfo[]>('list_installed_plugins');
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      plugins = [];
    } finally {
      loading = false;
    }
  }

  $effect(() => { void load(); });

  const filtered = $derived(
    query.trim()
      ? plugins.filter((p) => (p.displayName + p.id + p.description).toLowerCase().includes(query.trim().toLowerCase()))
      : plugins,
  );

  function initials(name: string): string {
    const parts = name.split(/[-_\s]+/).filter(Boolean);
    return (parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : name.slice(0, 2)).toUpperCase();
  }
</script>

<div class="page">
  <div class="page-head">
    <h2>插件</h2>
    <span class="sub">技能 / MCP / 命令统一由插件承载</span>
    <div class="right">
      <span class="btn pri sm" role="button" tabindex="0">＋ 浏览市场</span>
    </div>
  </div>
  <div class="page-body">
    <div class="search"><Icon name="search" size="sm" /><input placeholder="搜索插件…" bind:value={query} /></div>

    {#if loading}
      <p class="note">加载中…</p>
    {:else if error}
      <p class="note">读取插件列表失败：{error}</p>
    {:else if filtered.length === 0}
      <p class="note">{query ? '无匹配插件' : '尚未安装插件 — 点击「浏览市场」安装'}</p>
    {:else}
      {#each filtered as p (p.id)}
        <div class="card plug" class:disabled={!p.enabled}>
          <span class="pi">{initials(p.displayName)}</span>
          <span class="pb">
            <span class="pn">{p.displayName} <span class="v">v{p.version}</span>
              {#if !p.enabled}<span class="off-chip">已停用</span>{/if}
            </span>
            <span class="pd">{p.description || p.id}</span>
            <span class="bundles">
              {#if p.skillCount > 0}<span class="bchip sk">{p.skillCount} 技能</span>{/if}
              {#if p.hasMcp}<span class="bchip mc">MCP</span>{/if}
              {#if p.commandCount > 0}<span class="bchip">{p.commandCount} 命令</span>{/if}
              {#if p.developer}<span class="bchip">{p.developer}</span>{/if}
            </span>
          </span>
        </div>
      {/each}
      <p class="note">点击插件查看其技能列表、MCP 服务器与命令详情。卸载插件会一并移除其全部捆绑内容。</p>
    {/if}
  </div>
</div>

<style>
  .page { flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100%; }
  .page-head { display: flex; align-items: center; gap: 12px; padding: 16px 22px 14px; border-bottom: 1px solid var(--bd); }
  .page-head h2 { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
  .page-head .sub { font-size: 11px; color: var(--tx3); }
  .page-head .right { margin-left: auto; display: flex; gap: 8px; }
  .page-body { flex: 1; overflow-y: auto; padding: 16px 22px; display: flex; flex-direction: column; gap: 12px; }
  .search { display: flex; align-items: center; gap: 7px; height: 30px; padding: 0 10px; border-radius: var(--r-md); border: 1px solid var(--bd); background: var(--l1); font-size: 12px; color: var(--tx3); width: 260px; }
  .search input { flex: 1; background: none; border: none; outline: none; color: var(--tx); font: inherit; font-size: 12px; }
  .note { font-size: 11px; color: var(--tx3); }

  .card { border: 1px solid var(--bd); border-radius: var(--r-lg); background: var(--l2); box-shadow: var(--toplight); }
  .plug { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; }
  .plug.disabled { opacity: 0.55; }
  .pi { width: 34px; height: 34px; border-radius: var(--r-md); background: linear-gradient(135deg, #4fa8ff, #5bc0be); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex: none; }
  .pb { flex: 1; min-width: 0; }
  .pn { font-size: 13px; font-weight: 600; display: flex; gap: 7px; align-items: center; }
  .pn .v { font-size: 10px; color: var(--tx3); font-weight: 400; font-family: var(--font-mono); }
  .off-chip { font-size: 9px; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--bd2); color: var(--tx3); font-weight: 500; }
  .pd { display: block; font-size: 11px; color: var(--tx2); margin-top: 3px; }
  .bundles { display: flex; gap: 5px; margin-top: 8px; }
  .bchip { font-size: 10px; padding: 2px 7px; border-radius: 5px; background: var(--l3); color: var(--tx2); border: 1px solid var(--bd); }
  .bchip.sk { color: var(--ac); border-color: var(--ac-bd); }
  .bchip.mc { color: var(--amb); }
  .btn { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 12px; border-radius: var(--r-md); font-size: 12px; font-weight: 600; border: 1px solid var(--bd2); color: var(--tx2); cursor: pointer; }
  .btn.pri { background: var(--ac); border-color: transparent; color: #fff; }
  .btn.sm { height: 22px; padding: 0 9px; font-size: 11px; border-radius: var(--r-sm); }
</style>
