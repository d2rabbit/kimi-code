<!-- Onboarding.svelte — first-run welcome overlay.
     Lets the user pick language and theme before starting.
     Re-openable from settings. All preferences are changeable later. -->
<script lang="ts">
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import * as client from '../../stores/client.svelte';
  import { setLocale, availableLocales, type LocaleCode } from '../../i18n';

  let {
    oncomplete,
    onskip,
  }: {
    oncomplete: () => void;
    onskip: () => void;
  } = $props();

  let selectedLocale = $state<LocaleCode>('zh');
  let selectedScheme = $state<'light' | 'dark' | 'system'>('system');

  // Detect initial locale.
  $effect(() => {
    try {
      const stored = localStorage.getItem('kimi-locale');
      if (stored === 'en' || stored === 'zh') selectedLocale = stored;
    } catch {}
  });

  function chooseLocale(code: LocaleCode) {
    selectedLocale = code;
    setLocale(code);
  }

  function chooseScheme(scheme: 'light' | 'dark' | 'system') {
    selectedScheme = scheme;
    client.client.setColorScheme(scheme);
  }

  function finish() {
    client.client.setOnboarded(true);
    oncomplete();
  }

  function skip() {
    client.client.setOnboarded(true);
    onskip();
  }
</script>

<!-- Full-screen overlay (not a Dialog, since it's the entire app on first run) -->
<div class="onboarding-overlay">
  <div class="onboarding-card">
    <!-- Brand -->
    <div class="ob-brand">
      <div class="ob-logo">◧</div>
      <div class="ob-brand-text">
        <div class="ob-title">欢迎使用 Kode</div>
        <div class="ob-sub">选择一些偏好设置 —— 之后随时可以在设置中修改</div>
      </div>
    </div>

    <!-- Language -->
    <div class="ob-section">
      <div class="ob-label">语言 / Language</div>
      <div class="ob-segmented">
        {#each availableLocales as loc (loc.code)}
          <button
            class="ob-seg-btn"
            class:active={selectedLocale === loc.code}
            onclick={() => chooseLocale(loc.code)}
            type="button"
          >
            {loc.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Theme -->
    <div class="ob-section">
      <div class="ob-label">主题</div>
      <div class="ob-segmented">
        {#each [['light', '浅色'], ['dark', '深色'], ['system', '跟随系统']] as [val, label]}
          <button
            class="ob-seg-btn"
            class:active={selectedScheme === val}
            onclick={() => chooseScheme(val as 'light' | 'dark' | 'system')}
            type="button"
          >
            {label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Login hint -->
    <div class="ob-login-hint">
      <Icon name="info" size="sm" />
      <span>登录 Kimi 账号后即可开始使用。可在设置中随时登录。</span>
    </div>

    <!-- Actions -->
    <div class="ob-actions">
      <Button variant="ghost" onclick={skip}>跳过</Button>
      <Button variant="primary" onclick={finish}>开始使用</Button>
    </div>
  </div>
</div>

<style>
  .onboarding-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 400);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(8, 8, 10, 0.85);
    backdrop-filter: blur(12px);
    padding: 24px;
  }

  .onboarding-card {
    width: min(480px, 100%);
    background: var(--color-surface, rgba(28,28,30,0.72));
    border: 1px solid var(--color-line, rgba(84,84,88,0.65));
    border-radius: var(--radius-xl, 16px);
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    box-shadow: var(--shadow-lg, 0 20px 60px rgba(0,0,0,0.4));
  }

  .ob-brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .ob-logo {
    font-size: 36px;
    color: var(--color-accent, #2dd4bf);
    line-height: 1;
  }
  .ob-title {
    font-size: var(--text-xl, 18px);
    font-weight: var(--weight-medium, 500);
  }
  .ob-sub {
    font-size: var(--text-sm, 13px);
    color: var(--color-text-muted, rgba(235,235,245,0.6));
    margin-top: 2px;
  }

  .ob-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ob-label {
    font-size: var(--text-sm, 13px);
    font-weight: var(--weight-medium, 500);
    color: var(--color-text, rgba(255,255,255,0.92));
  }

  .ob-segmented {
    display: flex;
    gap: 2px;
    background: var(--color-surface-raised, #1a1a1e);
    border-radius: var(--radius-md, 8px);
    padding: 3px;
  }
  .ob-seg-btn {
    flex: 1;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--color-text-muted, rgba(235,235,245,0.6));
    font-size: var(--text-sm, 13px);
    border-radius: var(--radius-sm, 6px);
    cursor: pointer;
    transition: background var(--duration-fast, 120ms), color var(--duration-fast, 120ms);
  }
  .ob-seg-btn:hover {
    color: var(--color-text, rgba(255,255,255,0.92));
  }
  .ob-seg-btn.active {
    background: var(--color-accent, #2dd4bf);
    color: #fff;
  }

  .ob-login-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--radius-sm, 6px);
    background: var(--color-accent-soft, rgba(124,140,255,0.06));
    font-size: var(--text-xs, 12px);
    color: var(--color-text-muted, rgba(235,235,245,0.6));
  }

  .ob-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
</style>
