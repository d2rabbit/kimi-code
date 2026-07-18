<!-- PluginsSection.svelte — 插件管理 section（设置页与侧栏模块页共用同一实现）。
     技能 / MCP / 命令统一由插件承载。 -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import PluginPanel from './PluginPanel.svelte';

  let pluginTab = $state<'installed' | 'discover'>('installed');
</script>

<h2>插件管理 <span class="beta-badge">Beta</span></h2>
<p class="sub-desc">技能 / MCP / 命令统一由插件承载；启用或停用已安装的插件</p>
<div class="list-controls">
  <div class="seg">
    <button class="seg-btn" class:on={pluginTab === 'installed'} onclick={() => pluginTab = 'installed'} type="button">已安装</button>
    <button class="seg-btn" class:on={pluginTab === 'discover'} onclick={() => pluginTab = 'discover'} type="button">发现</button>
  </div>
  <div class="searchbox"><Icon name="search" size="sm" /><span>搜索插件…</span></div>
</div>
{#if pluginTab === 'installed'}
  <PluginPanel />
{:else}
  <p class="empty-text">插件市场即将上线。</p>
{/if}

<style>
  h2 { font-size: 20px; font-weight: 600; color: var(--tx); margin: 0 0 4px; letter-spacing: -0.02em; }
  .sub-desc { font-size: 12px; color: var(--tx3); margin: 0 0 20px; }
  .beta-badge { font-size: 10px; padding: 2px 8px; border-radius: 99px; background: var(--ac-soft); color: var(--ac); vertical-align: middle; font-weight: 600; }
  .list-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .seg { display: inline-flex; border: 1px solid var(--bd2); border-radius: var(--r-md); overflow: hidden; }
  .seg-btn { padding: 5px 12px; border: none; background: transparent; color: var(--tx2); font-size: 12px; cursor: pointer; transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease); }
  .seg-btn.on { background: var(--ac-soft); color: var(--ac); font-weight: 600; }
  .searchbox { flex: 1; display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: var(--r-lg); background: var(--l1); border: 1px solid var(--bd); color: var(--tx3); font-size: 12px; }
  .empty-text { color: var(--tx3); font-size: 13px; }
</style>
