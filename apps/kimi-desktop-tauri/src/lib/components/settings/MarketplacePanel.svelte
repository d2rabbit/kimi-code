<!-- MarketplacePanel.svelte — 插件市场「发现」页（daemon REST /plugins/marketplace）。
     注册表由服务端代理（CDN 默认、env 覆盖、仓库本地兜底），与 CLI 目录一致。 -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getKimiWebApi } from '../../api';
  import type { AppMarketplaceEntry } from '../../api/types';
  import Button from '../ui/Button.svelte';
  import Card from '../ui/Card.svelte';
  import Chip from '../ui/Chip.svelte';
  import Icon from '../ui/Icon.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import { toast } from '../../stores/toast.svelte';
  import { noteQuotaConsumingPlugin } from '../../lib/pluginUpdates';

  let source = $state('');
  let entries = $state<AppMarketplaceEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busyId = $state<string | null>(null);
  let query = $state('');

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.displayName.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        (e.description ?? '').toLowerCase().includes(q) ||
        (e.keywords ?? []).some((k) => k.toLowerCase().includes(q)),
    );
  });

  async function load() {
    loading = true;
    error = null;
    try {
      const r = await getKimiWebApi().getPluginMarketplace();
      source = r.source;
      entries = r.plugins;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function install(entry: AppMarketplaceEntry) {
    if (busyId) return;
    busyId = entry.id;
    try {
      await getKimiWebApi().installPlugin(entry.source);
      toast.ok(`已安装 ${entry.displayName}`);
      noteQuotaConsumingPlugin(entry);
      await load();
    } catch (e) {
      toast.err(`安装失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busyId = null;
    }
  }

  async function toggle(entry: AppMarketplaceEntry) {
    if (busyId) return;
    busyId = entry.id;
    try {
      await getKimiWebApi().togglePlugin(entry.id, !(entry.enabled ?? true));
      await load();
    } catch (e) {
      toast.err(`操作失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busyId = null;
    }
  }

  async function uninstall(entry: AppMarketplaceEntry) {
    if (busyId) return;
    if (!confirm(`卸载插件 ${entry.displayName}？`)) return;
    busyId = entry.id;
    try {
      await getKimiWebApi().removePlugin(entry.id);
      toast.ok(`已卸载 ${entry.displayName}`);
      await load();
    } catch (e) {
      toast.err(`卸载失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busyId = null;
    }
  }

  function tierLabel(tier?: string): string {
    if (tier === 'official') return '官方';
    if (tier === 'curated') return '精选';
    return '社区';
  }
  function tierTone(tier?: string): 'accent' | 'success' | 'neutral' {
    if (tier === 'official') return 'accent';
    if (tier === 'curated') return 'success';
    return 'neutral';
  }
</script>

<div class="mk">
  <div class="mk-controls">
    <div class="searchbox"><Icon name="search" size="sm" /><input placeholder="搜索市场插件…" bind:value={query} /></div>
    <Button size="sm" icon="refresh" onclick={load} disabled={loading}>刷新</Button>
  </div>
  {#if source}
    <p class="mk-source mono">注册表：{source}</p>
  {/if}

  {#if loading}
    <div class="mk-empty"><Spinner size="lg" /><p>加载市场注册表…</p></div>
  {:else if error}
    <div class="mk-empty">
      <Icon name="error-warning" size="md" />
      <p>{error}</p>
      <Button size="sm" onclick={load}>重试</Button>
    </div>
  {:else if filtered.length === 0}
    <div class="mk-empty">
      <Icon name="plugin" size="lg" />
      <p>{query ? `没有匹配「${query}」的市场插件` : '市场暂无插件'}</p>
    </div>
  {:else}
    <div class="mk-list">
      {#each filtered as entry (entry.id)}
        <Card variant="raised" padding="none">
          <div class="mk-item">
            <div class="mk-item-main">
              <div class="mk-item-top">
                <span class="mk-name">{entry.displayName}</span>
                <Chip tone={tierTone(entry.tier)} size="sm">{tierLabel(entry.tier)}</Chip>
                {#if entry.version}<span class="mk-ver mono">v{entry.version}</span>{/if}
              </div>
              {#if entry.description}<p class="mk-desc">{entry.description}</p>{/if}
              {#if entry.keywords?.length}
                <div class="mk-kws">
                  {#each entry.keywords.slice(0, 5) as kw (kw)}
                    <span class="mk-kw">{kw}</span>
                  {/each}
                </div>
              {/if}
              <div class="mk-state">
                {#if entry.installed}
                  <span class="st-installed">已安装 {entry.installedVersion ? `v${entry.installedVersion}` : ''}{entry.enabled === false ? ' · 已停用' : ''}</span>
                  {#if entry.updateAvailable}
                    <span class="st-update">可更新 → v{entry.version}</span>
                  {/if}
                {/if}
              </div>
            </div>
            <div class="mk-actions">
              {#if entry.installed}
                {#if entry.updateAvailable}
                  <Button size="sm" variant="primary" onclick={() => install(entry)} disabled={busyId === entry.id}>
                    {busyId === entry.id ? '处理中…' : '更新'}
                  </Button>
                {/if}
                <Button size="sm" onclick={() => toggle(entry)} disabled={busyId === entry.id}>
                  {entry.enabled === false ? '启用' : '停用'}
                </Button>
                <Button size="sm" variant="danger" onclick={() => uninstall(entry)} disabled={busyId === entry.id}>
                  卸载
                </Button>
              {:else}
                <Button size="sm" variant="primary" icon="download" onclick={() => install(entry)} disabled={busyId === entry.id}>
                  {busyId === entry.id ? '安装中…' : '安装'}
                </Button>
              {/if}
            </div>
          </div>
        </Card>
      {/each}
    </div>
  {/if}
</div>

<style>
  .mk { display: flex; flex-direction: column; gap: 12px; }
  .mk-controls { display: flex; align-items: center; gap: 8px; }
  .searchbox {
    flex: 1; display: flex; align-items: center; gap: 6px;
    padding: 7px 12px;
    border-radius: var(--g-radius-input, 4px);
    background: var(--mat-input-bg, var(--l1));
    border: var(--g-border-w-input, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    box-shadow: var(--elev-input, none);
    color: var(--tx3); font-size: 12px;
  }
  .searchbox input { flex: 1; background: none; border: none; outline: none; color: var(--tx); font: inherit; font-size: 12px; }
  .mk-source { font-size: 10px; color: var(--tx3); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .mk-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 40px 20px; text-align: center; color: var(--color-text-muted, #999); font-size: var(--text-sm, 13px); }

  .mk-list { display: flex; flex-direction: column; gap: 8px; }
  .mk-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; }
  .mk-item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
  .mk-item-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .mk-name { font-size: var(--text-sm, 13px); font-weight: 600; color: var(--color-text, #ececec); }
  .mk-ver { font-size: 10.5px; color: var(--color-text-faint); }
  .mk-desc { font-size: var(--text-xs, 12px); color: var(--color-text-muted, #999); margin: 0; line-height: 1.5; }
  .mk-kws { display: flex; gap: 4px; flex-wrap: wrap; }
  .mk-kw {
    font-size: 10px; padding: 1px 6px;
    border-radius: var(--g-radius-chip, 999px);
    background: var(--mat-chip-bg, var(--l2));
    color: var(--color-text-muted, #999);
  }
  .mk-state { display: flex; align-items: center; gap: 10px; font-size: 10.5px; }
  .st-installed { color: var(--color-success); }
  .st-update { color: var(--amb); font-weight: 600; }
  .mk-actions { display: flex; gap: 6px; flex: none; align-items: center; }
  .mono { font-family: var(--font-mono, monospace); }
</style>
