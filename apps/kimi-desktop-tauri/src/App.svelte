<!-- App.svelte — root router. Switches between workspace and settings views. -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { daemon } from './lib/stores/daemon.svelte';
  import * as client from './lib/stores/client.svelte';
  import WorkspaceView from './lib/views/WorkspaceView.svelte';
  import SettingsView from './lib/views/SettingsView.svelte';
  import TitleBar from './lib/components/shell/TitleBar.svelte';
  import CommandPalette from './lib/components/shell/CommandPalette.svelte';
  import Onboarding from './lib/components/settings/Onboarding.svelte';
  import SearchSessions from './lib/components/sidebar/SearchSessions.svelte';

  type View = 'workspace' | 'settings';
  let currentView = $state<View>('workspace');
  let showOnboarding = $state(false);
  let showSearch = $state(false);
  let showPalette = $state(false);

  onMount(async () => {
    await daemon.connect();
    if (daemon.state.status === 'connected') {
      await client.client.load().catch(() => {});
      if (!client.onboarded()) showOnboarding = true;
    }
  });

  onDestroy(() => daemon.destroy());

  $effect(() => { void client.unreadCount(); client.client.updateBadge(); });

  function navigate(view: View) { currentView = view; }
</script>

<div class="app-root" data-view={currentView}>
  {#if daemon.state.status === 'connecting'}
    <div class="launch"><div class="spinner"></div><p>正在连接…</p></div>
  {:else if daemon.state.status === 'error'}
    <div class="launch">
      <p class="err-text">{daemon.state.error}</p>
      <button class="retry-btn" onclick={() => daemon.retry()}>重试</button>
    </div>
  {:else if !client.initialized()}
    <div class="launch"><div class="spinner"></div><p>加载中…</p></div>
  {:else}
    <div class="view-container">
      <TitleBar />
      {#if currentView === 'workspace'}
        <WorkspaceView onnavigate={() => navigate('settings')} />
      {:else}
        <SettingsView onnavigate={() => navigate('workspace')} />
      {/if}
    </div>
  {/if}

  {#if showOnboarding}
    <Onboarding oncomplete={() => showOnboarding = false} onskip={() => showOnboarding = false} />
  {/if}

  <SearchSessions bind:open={showSearch} />
  <CommandPalette bind:open={showPalette} onnavigate={() => navigate('settings')} />
</div>

<style>
  :global(html, body) { height: 100%; margin: 0; }
  :global(body) {
    color: var(--color-text, rgba(255,255,255,0.92));
    font: 13px/1.5 "Inter Variable","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    overflow: hidden; -webkit-font-smoothing: antialiased;
  }
  :global(*::-webkit-scrollbar) { width: 4px; height: 4px; }
  :global(*::-webkit-scrollbar-track) { background: transparent; }
  :global(*::-webkit-scrollbar-thumb) { background: rgba(255,255,255,0.06); border-radius: 999px; }
  :global(*::-webkit-scrollbar-thumb:hover) { background: rgba(255,255,255,0.12); }
  :global(button) { font-family: inherit; }

  .app-root { height: 100vh; height: 100dvh; overflow: hidden; display: flex; }
  .view-container { display: flex; flex-direction: column; height: 100%; flex: 1; overflow: hidden; }
  .launch {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 10px;
  }
  .launch p { font-size: 12px; color: var(--color-text-faint, #666); margin: 0; text-align: center; }
  .err-text { font-family: monospace; font-size: 11px; color: var(--color-danger, #f85149); max-width: 400px; }
  .spinner {
    width: 22px; height: 22px;
    border: 2px solid rgba(255,255,255,0.06); border-top-color: rgba(255,255,255,0.3);
    border-radius: 50%; animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .retry-btn {
    border: 1px solid var(--color-line-strong, #333); background: transparent; color: var(--color-text-muted, #ccc);
    padding: 6px 16px; border-radius: 6px; font-size: 12px; cursor: pointer;
  }
</style>
