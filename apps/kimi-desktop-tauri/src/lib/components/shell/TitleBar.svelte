<!-- TitleBar.svelte — platform-aware custom title bar.
     非 macOS：左上角 macOS 风格交通灯（关=隐藏到托盘/最小化/最大化-还原）；
     macOS：原生 overlay，只留左侧 80px 净空。中部为面包屑。 -->
<script lang="ts">
  import { onMount } from 'svelte';
  import * as client from '../../stores/client.svelte';

  // Guard against non-Tauri environments (e.g. browser dev preview)
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  import { invoke } from '@tauri-apps/api/core';

  let ready = $state(false);
  let isMac = $state(false);

  onMount(async () => {
    if (!isTauri) return;
    try {
      const { platform } = await import('@tauri-apps/plugin-os');
      isMac = platform() === 'macos';
      ready = true;
    } catch { /* non-Tauri: controls hidden */ }
  });

  const wsName = $derived(client.activeWorkspaceName() || '');

  // 关闭 = 隐藏到托盘（Linux/Windows 常驻托盘；macOS 用原生语义）
  function onClose() { void invoke('win_close').catch(() => {}); }
  function onMinimize() { void invoke('win_minimize').catch(() => {}); }
  function onToggleMaximize() { void invoke('win_toggle_maximize').catch(() => {}); }
</script>

<header class="titlebar" data-tauri-drag-region>
  <div class="breadcrumb" data-tauri-drag-region>
    <span class="brand">Kimi Code</span>
    {#if wsName}
      <span class="sep">›</span>
      <span class="crumb">{wsName}</span>
    {/if}
  </div>

  {#if !isMac && ready}
    <!-- Linux / Windows：右上角窗口控制（系统约定布局） -->
    <div class="win-ctrl" role="group" aria-label="窗口控制">
      <button class="wc" onclick={onMinimize} aria-label="最小化" title="最小化" type="button"><span class="wc-sym">−</span></button>
      <button class="wc" onclick={onToggleMaximize} aria-label="最大化 / 还原" title="最大化 / 还原" type="button"><span class="wc-sym wc-max"></span></button>
      <button class="wc close" onclick={onClose} aria-label="关闭（隐藏到托盘）" title="关闭（隐藏到托盘）" type="button"><span class="wc-sym">×</span></button>
    </div>
  {/if}
</header>

<style>
  .titlebar {
    height: 40px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 12px;
    /* macOS: extra left padding to clear the native traffic light overlay */
    padding-left: var(--titlebar-pad-left, 12px);
    background: var(--l1);
    border-bottom: 1px solid var(--bd);
    user-select: none;
    z-index: 100;
  }
  /* On macOS, leave space for the native traffic light overlay */
  :global([data-platform="macos"]) .titlebar {
    --titlebar-pad-left: 80px;
  }

  /* ---- Linux / Windows：右上角矩形窗口控制 ---- */
  .win-ctrl { margin-left: auto; display: flex; gap: 2px; flex: none; }
  .wc {
    width: 30px; height: 26px;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--tx2);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease);
  }
  .wc:hover { background: var(--color-hover); color: var(--tx); }
  .wc.close:hover { background: var(--err); color: #fff; }
  .wc-sym { font-size: 12px; font-weight: 600; line-height: 1; font-family: var(--font-ui); }
  .wc-max {
    width: 8px; height: 8px;
    border: 1.4px solid currentColor;
    border-radius: 1.5px;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .brand { color: var(--tx); font-weight: 650; letter-spacing: -0.02em; }
  .crumb { color: var(--tx2); }
  .sep { color: var(--tx3); }
</style>
