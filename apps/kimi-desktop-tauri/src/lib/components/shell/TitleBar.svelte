<!-- TitleBar.svelte — platform-aware custom title bar with breadcrumb + window controls. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import * as client from '../../stores/client.svelte';
  import Icon from '../ui/Icon.svelte';

  // Guard against non-Tauri environments (e.g. browser dev preview)
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  let appWindow: { minimize: () => void; toggleMaximize: () => void; close: () => void } | null = $state(null);
  let isLinux = $state(false);

  onMount(async () => {
    if (!isTauri) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const { platform } = await import('@tauri-apps/plugin-os');
      appWindow = getCurrentWindow();
      isLinux = platform() === 'linux';
    } catch { /* non-Tauri: appWindow stays null */ }
  });

  const wsName = $derived(client.activeWorkspaceName() || '');
  const sessionTitle = $derived(client.activeSession()?.title || '新对话');
</script>

<header class="titlebar" data-tauri-drag-region>
  <div class="breadcrumb" data-tauri-drag-region>
    {#if wsName}
      <span class="crumb">{wsName}</span>
      <span class="sep">›</span>
    {/if}
    <span class="crumb current">{sessionTitle}</span>
  </div>
  {#if isLinux && appWindow}
    <div class="window-controls">
      <button class="wc-btn" onclick={() => appWindow!.minimize()} aria-label="最小化" type="button">
        <Icon name="minus" size="sm" />
      </button>
      <button class="wc-btn" onclick={() => appWindow!.toggleMaximize()} aria-label="最大化" type="button">
        <Icon name="expand" size="sm" />
      </button>
      <button class="wc-btn wc-close" onclick={() => appWindow!.close()} aria-label="关闭" type="button">
        <Icon name="close" size="sm" />
      </button>
    </div>
  {/if}
</header>

<style>
  .titlebar {
    height: 40px;
    flex: none;
    display: flex;
    align-items: center;
    padding: 0 12px;
    /* macOS: extra left padding to clear the traffic light buttons */
    padding-left: var(--titlebar-pad-left, 12px);
    background: var(--l1);
    border-bottom: 1px solid var(--glass-divider, rgba(255, 255, 255, 0.06));
    user-select: none;
    z-index: 100;
  }
  :global(html[data-color-scheme="light"]) .titlebar {
    background: rgba(245, 245, 247, 0.6);
    border-bottom-color: rgba(0, 0, 0, 0.04);
  }
  /* On macOS, leave space for the native traffic light overlay */
  :global([data-platform="macos"]) .titlebar {
    --titlebar-pad-left: 80px;
  }
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .crumb {
    color: var(--color-text-muted, rgba(235, 235, 245, 0.6));
  }
  .crumb.current {
    color: var(--color-text, rgba(255, 255, 255, 0.92));
    font-weight: 500;
  }
  .sep {
    color: var(--color-text-faint, rgba(235, 235, 245, 0.3));
  }
  .window-controls {
    margin-left: auto;
    display: flex;
    gap: 8px;
  }
  .wc-btn {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--color-text-muted, rgba(235, 235, 245, 0.6));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 120ms, color 120ms;
  }
  .wc-btn:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.06));
    color: var(--color-text, rgba(255, 255, 255, 0.92));
  }
  .wc-close:hover {
    background: rgba(255, 69, 58, 0.2);
    color: #ff453a;
  }
</style>
