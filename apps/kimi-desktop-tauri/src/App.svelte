<!-- App.svelte — root component (Phase 3: elegant three-column layout). -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { daemon } from './lib/stores/daemon.svelte';
  import * as client from './lib/stores/client.svelte';
  import Sidebar from './lib/components/sidebar/Sidebar.svelte';
  import ConversationPane from './lib/components/chat/ConversationPane.svelte';
  import IconButton from './lib/components/ui/IconButton.svelte';
  import { isMacosDesktop } from './lib/lib/desktopFlag';

  let sidebarCollapsed = $state(false);
  let sidebarWidth = $state(280);

  // Load persisted sidebar state.
  function loadSidebarState() {
    try {
      const c = localStorage.getItem('kdt-sidebar-collapsed');
      if (c === '1') sidebarCollapsed = true;
      const w = localStorage.getItem('kdt-sidebar-width');
      if (w) sidebarWidth = Math.max(240, Math.min(360, parseInt(w, 10)));
    } catch {}
  }
  function saveSidebarState() {
    try {
      localStorage.setItem('kdt-sidebar-collapsed', sidebarCollapsed ? '1' : '0');
      localStorage.setItem('kdt-sidebar-width', String(sidebarWidth));
    } catch {}
  }

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    saveSidebarState();
  }

  onMount(async () => {
    loadSidebarState();
    await daemon.connect();
    if (daemon.state.status === 'connected') {
      await client.client.load().catch((e) => {
        console.error('[kimi-desktop-tauri] client.load() failed:', e);
      });
    }
  });

  onDestroy(() => {
    daemon.destroy();
    // Clean up any lingering drag listeners.
    if (activeMove) document.removeEventListener('mousemove', activeMove);
    if (activeUp) document.removeEventListener('mouseup', activeUp);
  });

  // Sidebar resize drag.
  let dragging = $state(false);
  // Track active drag handlers so we can clean them up on component destroy.
  let activeMove: ((ev: MouseEvent) => void) | null = null;
  let activeUp: (() => void) | null = null;

  function onResizeStart(e: MouseEvent) {
    e.preventDefault();
    dragging = true;
    const startX = e.clientX;
    const startW = sidebarWidth;
    activeMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      sidebarWidth = Math.max(240, Math.min(360, startW + delta));
    };
    activeUp = () => {
      dragging = false;
      saveSidebarState();
      if (activeMove) document.removeEventListener('mousemove', activeMove);
      if (activeUp) document.removeEventListener('mouseup', activeUp);
      activeMove = null;
      activeUp = null;
    };
    document.addEventListener('mousemove', activeMove);
    document.addEventListener('mouseup', activeUp);
  }
</script>

<div
  class="app-shell"
  class:macos={isMacosDesktop}
  class:sidebar-collapsed={sidebarCollapsed}
>
  {#if daemon.state.status === 'connecting'}
    <!-- Loading screen -->
    <div class="overlay-screen">
      <div class="spinner"></div>
      <h1>正在启动 Kimi 本地服务…</h1>
      <p>首次启动可能需要几秒。</p>
    </div>
  {:else if daemon.state.status === 'error'}
    <!-- Error screen -->
    <div class="overlay-screen">
      <h1 class="error-title">无法启动本地服务</h1>
      <pre class="error-msg">{daemon.state.error}</pre>
      <button class="btn btn-primary" onclick={() => daemon.retry()}>重试连接</button>
    </div>
  {:else if !client.initialized}
    <!-- Initializing -->
    <div class="overlay-screen">
      <div class="spinner"></div>
      <h1>正在加载…</h1>
    </div>
  {:else}
    <!-- Connected: three-column layout -->
    <!-- Column 1: Sidebar (always mounted; width animates to 0 when collapsed) -->
    <aside
      class="col-sidebar"
      class:collapsed={sidebarCollapsed}
      style="--sidebar-w: {sidebarWidth}px"
    >
      <div class="sidebar-inner">
        <Sidebar />
      </div>
    </aside>
    {#if !sidebarCollapsed}
      <div
        class="resize-handle"
        role="separator"
        aria-label="调整侧边栏宽度"
        onmousedown={onResizeStart}
      ></div>
    {/if}

    <!-- Sidebar toggle (always rendered; macOS resident, others only when collapsed) -->
    {#if sidebarCollapsed || isMacosDesktop}
      <div class="sidebar-toggle-zone" class:macos={isMacosDesktop}>
        <IconButton
          name={sidebarCollapsed ? 'panel-expand' : 'panel-collapse'}
          label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
          onclick={toggleSidebar}
        />
      </div>
    {/if}

    <!-- Column 2: Conversation -->
    <main class="col-conversation">
      <ConversationPane />
    </main>

    <!-- Column 3: Detail panel (future) -->
    <!-- TODO: right-side detail panel (file preview / diff / thinking) -->
  {/if}
</div>

<style>
  :global(html, body) {
    height: 100%;
    margin: 0;
  }
  :global(body) {
    background: var(--bg, #0b0b0c);
    color: var(--color-text, #e7e7ea);
    font:
      var(--text-base, 14px) / 1.5 var(--font-ui, system-ui),
      sans-serif;
    overflow: hidden;
  }

  .app-shell {
    height: 100vh;
    height: 100dvh;
    display: flex;
    overflow: hidden;
    background: var(--bg, #0b0b0c);
    position: relative;
  }

  /* --- Sidebar column --- */
  .col-sidebar {
    flex: none;
    width: var(--sidebar-w, 280px);
    min-width: 0;
    height: 100%;
    background: var(--color-sidebar-bg, var(--color-surface, #121214));
    border-right: 1px solid var(--color-line, #2a2a2e);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: width 0.22s var(--ease-out, cubic-bezier(0.2, 0, 0, 1));
  }
  .col-sidebar.collapsed {
    width: 0;
    border-right-color: transparent;
  }
  /* Inner wrapper keeps the real width so content doesn't reflow during the
     width-to-0 animation — it clips instead. */
  .sidebar-inner {
    width: var(--sidebar-w, 280px);
    height: 100%;
    flex: none;
    overflow: hidden;
  }

  /* --- Resize handle --- */
  .resize-handle {
    width: 4px;
    flex: none;
    cursor: col-resize;
    background: transparent;
    position: relative;
    z-index: 10;
  }
  .resize-handle::after {
    content: '';
    position: absolute;
    inset: 0 1px;
    background: transparent;
    transition: background var(--duration-fast, 120ms);
  }
  .resize-handle:hover::after {
    background: var(--color-line-strong, #3a3a3e);
  }

  /* --- Sidebar toggle zone --- */
  .sidebar-toggle-zone {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 100;
    -webkit-app-region: no-drag;
  }
  .sidebar-toggle-zone.macos {
    left: 76px;
  }

  /* --- Conversation column --- */
  .col-conversation {
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* --- Overlay screens (loading / error / initializing) --- */
  .overlay-screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    text-align: center;
    padding: 0 32px;
  }
  .spinner {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 3px solid var(--color-line, #2a2a2e);
    border-top-color: var(--color-accent, #7c8cff);
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .overlay-screen h1 {
    font-size: 15px;
    font-weight: var(--weight-medium, 500);
    margin: 0;
  }
  .overlay-screen p {
    margin: 0;
    color: var(--color-text-muted, #9a9aa2);
  }
  .error-title {
    color: var(--color-danger, #ff6b6b);
  }
  .error-msg {
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    text-align: left;
    max-width: 600px;
    max-height: 200px;
    overflow: auto;
    white-space: pre-wrap;
    background: var(--color-surface-raised, #1a1a1e);
    padding: 12px;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--color-line, #2a2a2e);
    margin: 0;
  }

  /* Buttons in overlay screens. */
  :global(.btn) {
    appearance: none;
    border: 1px solid var(--color-line, #2a2a2e);
    background: transparent;
    color: var(--color-text, #e7e7ea);
    padding: 8px 16px;
    border-radius: var(--radius-md, 8px);
    font-size: 14px;
    cursor: pointer;
    transition: background var(--duration-fast, 120ms);
  }
  :global(.btn:hover) {
    background: var(--color-hover, rgba(255, 255, 255, 0.06));
  }
  :global(.btn-primary) {
    border-color: var(--color-accent, #7c8cff);
    color: var(--color-accent, #7c8cff);
  }
  :global(.btn-primary:hover) {
    background: var(--color-accent-soft, rgba(124, 140, 255, 0.12));
  }

  @media (prefers-reduced-motion: reduce) {
    * {
      animation: none !important;
      transition: none !important;
    }
  }
</style>
