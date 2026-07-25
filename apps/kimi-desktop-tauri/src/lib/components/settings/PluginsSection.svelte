<!-- PluginsSection.svelte — 插件管理 section（设置页与侧栏模块页共用同一实现）。
     技能 / MCP / 命令统一由插件承载。 -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import PluginPanel from './PluginPanel.svelte';

  let pluginTab = $state('installed');

  const tabOptions = [
    { value: 'installed', label: '已安装' },
    { value: 'discover', label: '发现' },
  ];
</script>

<h2>插件管理 <span class="beta-badge">Beta</span></h2>
<p class="sub-desc">技能 / MCP / 命令统一由插件承载；启用或停用已安装的插件</p>
<div class="list-controls">
  <Segmented bind:value={pluginTab} options={tabOptions} size="sm" />
  <div class="searchbox"><Icon name="search" size="sm" /><span>搜索插件…</span></div>
</div>
{#if pluginTab === 'installed'}
  <PluginPanel />
{:else}
  <p class="empty-text">插件市场尚未开放。已安装的插件切换到「已安装」标签查看与管理。</p>
{/if}

<style>
  h2 { font-size: 20px; font-weight: 600; color: var(--tx); margin: 0 0 4px; letter-spacing: -0.02em; }
  .sub-desc { font-size: 12px; color: var(--tx3); margin: 0 0 20px; }
  .beta-badge { font-size: 10px; padding: 2px 8px; border-radius: var(--g-radius-chip, 99px); background: var(--ac-soft); color: var(--ac); vertical-align: middle; font-weight: 600; }
  .list-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .searchbox { flex: 1; display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: var(--g-radius-input, 4px); background: var(--mat-input-bg, var(--l1)); border: var(--g-border-w-input, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd)); box-shadow: var(--elev-input, none); color: var(--tx3); font-size: 12px; }
  .empty-text { color: var(--tx3); font-size: 13px; }
</style>
