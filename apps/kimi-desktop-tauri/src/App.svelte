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
  import Toasts from './lib/components/ui/Toasts.svelte';
  import { notify } from './lib/notify';

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

  // ---- 桌面集成：窗口标题随活动会话 ----
  $effect(() => {
    const t = client.activeSession()?.title;
    if ('__TAURI_INTERNALS__' in globalThis && t) {
      void import('@tauri-apps/api/core').then(({ invoke }) =>
        invoke('set_window_title', { title: `${t} · Kimi Code` }).catch(() => {}),
      );
    }
  });

  // ---- 桌面集成：审批/问题/任务完成 → 系统通知 ----
  let prevPending = 0;
  let prevActivity = '';
  $effect(() => {
    const pending = client.pendingApprovals().length + client.questions().length;
    if (pending > prevPending) {
      const title = client.pendingApprovals().length > 0 ? '需要审批' : 'Kimi 想确认';
      const body = client.pendingApprovals().length > 0
        ? `${client.pendingApprovals()[0]?.toolName ?? '工具'} 请求执行权限`
        : (client.questions()[0]?.questions?.[0]?.header ?? '有一个问题等待你回答');
      void notify(title, body);
    }
    prevPending = pending;
  });
  $effect(() => {
    const act = client.activity();
    if (prevActivity === 'running' && act !== 'running') {
      void notify('任务完成', client.activeSession()?.title ?? '当前会话已结束运行');
    }
    prevActivity = act;
  });

  function navigate(view: View) { currentView = view; }

  // ---- 全局键盘快捷键 ----
  function handleGlobalKey(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    // ⌘K / Ctrl+K — 命令面板
    if (mod && e.key === 'k') { e.preventDefault(); showPalette = !showPalette; return; }
    // ⌘N / Ctrl+N — 新建对话
    if (mod && e.key === 'n') { e.preventDefault(); client.client.clearActiveSession(); return; }
    // ⌘P / Ctrl+P — 搜索会话
    if (mod && e.key === 'p') { e.preventDefault(); showSearch = !showSearch; return; }
    // ⌘, / Ctrl+, — 设置
    if (mod && e.key === ',') { e.preventDefault(); navigate(currentView === 'settings' ? 'workspace' : 'settings'); return; }
    // Escape — 关闭 overlays（但不在 input/textarea 里拦截）
    if (e.key === 'Escape') {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return; // 让 input 自己处理 Esc
      if (showPalette) { showPalette = false; return; }
      if (showSearch) { showSearch = false; return; }
      if (showOnboarding) { showOnboarding = false; return; }
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKey} />

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
  <Toasts />
  <CommandPalette bind:open={showPalette} onnavigate={() => navigate('settings')} onsearch={() => showSearch = true} />
</div>

<style>
  :global(html, body) { height: 100%; margin: 0; }
  :global(body) {
    color: var(--color-text, rgba(255,255,255,0.92));
    /* NOTE: do NOT use `font:` shorthand here — it resets font-size and
       wins over the global.css `body { font-size: var(--ui-font-size) }`
       rule because both are body-specificity and this one comes later in
       the cascade. Use individual properties so setUiFontSize() can
       actually adjust the size via the --base-ui-font-size variable. */
    font-family: "Inter Variable","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    font-size: var(--ui-font-size);
    line-height: 1.5;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
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
