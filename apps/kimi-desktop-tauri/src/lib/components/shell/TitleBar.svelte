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
  const sessionTitle = $derived(client.activeSession()?.title || '新对话');

  // 关闭 = 隐藏到托盘（Linux/Windows 常驻托盘；macOS 用原生语义）
  function onClose() { void invoke('win_close').catch(() => {}); }
  function onMinimize() { void invoke('win_minimize').catch(() => {}); }
  function onToggleMaximize() { void invoke('win_toggle_maximize').catch(() => {}); }
</script>

<header class="titlebar" data-tauri-drag-region>
  {#if !isMac && ready}
    <!-- 左上角交通灯（悬停显示符号） -->
    <div class="lights" role="group" aria-label="窗口控制">
      <button class="light close" onclick={onClose} aria-label="关闭（隐藏到托盘）" title="关闭（隐藏到托盘）" type="button"><span class="sym">×</span></button>
      <button class="light min" onclick={onMinimize} aria-label="最小化" title="最小化" type="button"><span class="sym">−</span></button>
      <button class="light max" onclick={onToggleMaximize} aria-label="最大化 / 还原" title="最大化 / 还原" type="button"><span class="sym sym-max"></span></button>
    </div>
  {/if}

  <div class="breadcrumb" data-tauri-drag-region>
    {#if wsName}
      <span class="crumb">{wsName}</span>
      <span class="sep">›</span>
    {/if}
    <span class="crumb current">{sessionTitle}</span>
  </div>
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

  /* ---- macOS 风格交通灯 ---- */
  .lights { display: flex; gap: 8px; flex: none; }
  .light {
    width: 12px; height: 12px;
    border-radius: 50%;
    border: none;
    padding: 0;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: transform var(--duration-fast) var(--ease), box-shadow var(--duration-fast) var(--ease);
  }
  .light.close { background: #ff5f57; }
  .light.min { background: #febc2e; }
  .light.max { background: #28c840; }
  .light .sym {
    font-size: 9px; font-weight: 700; line-height: 1;
    color: rgba(0, 0, 0, 0.55);
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease);
    font-family: var(--font-ui);
  }
  .light .sym-max {
    width: 5px; height: 5px;
    border: 1.2px solid rgba(0, 0, 0, 0.55);
    border-radius: 1px;
  }
  .lights:hover .sym { opacity: 1; }
  .light:hover { transform: scale(1.12); }
  .light:active { transform: scale(0.94); }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .crumb { color: var(--tx2); }
  .crumb.current { color: var(--tx); font-weight: 500; }
  .sep { color: var(--tx3); }
</style>
