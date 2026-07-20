<!-- Onboarding.svelte — first-run 3-step overlay:
     欢迎（特性） → Kimi 登录 → 主题/语言选择。Progress dots; skippable.
     Re-openable from settings. All preferences changeable later. -->
<script lang="ts">
  import Button from '../ui/Button.svelte';
  import LoginDialog from './LoginDialog.svelte';
  import * as client from '../../stores/client.svelte';
  import { setLocale, availableLocales, type LocaleCode } from '../../i18n';

  let {
    oncomplete,
    onskip,
  }: {
    oncomplete: () => void;
    onskip: () => void;
  } = $props();

  let step = $state(1);
  let selectedLocale = $state<LocaleCode>('zh');
  let selectedScheme = $state<'light' | 'dark' | 'system'>('dark');
  let showLogin = $state(false);

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

  function startLogin() { showLogin = true; }

  function finish() {
    client.client.setOnboarded(true);
    oncomplete();
  }

  function skip() {
    client.client.setOnboarded(true);
    onskip();
  }

  const authed = $derived(client.authProvider()?.status === 'authenticated');
  $effect(() => { if (authed && step === 2) step = 3; });
</script>

<div class="ob" role="dialog" aria-modal="true">
  <div class="ob-card">
    {#key step}
    {#if step === 1}
      <!-- Step 1: welcome -->
      <div class="ob-head">
        <div class="ob-logo">K</div>
        <h2>欢迎使用 <span class="grad">Kimi Code</span></h2>
        <p>终端级 AI 编程代理，现在的桌面形态</p>
      </div>
      <div class="ob-body">
        <div class="ob-feat"><span class="fi">❯</span><span><div class="ft">和 CLI 同源的 Agent</div><div class="fd">同一 daemon、同一会话协议，TUI / 桌面 / Web 无缝接力</div></span></div>
        <div class="ob-feat"><span class="fi">⬡</span><span><div class="ft">插件生态</div><div class="fd">技能、MCP、命令统一由插件承载，一键装卸</div></span></div>
        <div class="ob-feat"><span class="fi">◐</span><span><div class="ft">磨砂双主题</div><div class="fd">不透明的朦胧质感，深色浅色都是一等公民</div></span></div>
        <div class="ob-dots"><i class="on"></i><i></i><i></i></div>
        <div class="ob-actions"><Button variant="primary" onclick={() => step = 2}>开始 →</Button></div>
      </div>
      <div class="ob-skip" role="button" tabindex="0" onclick={skip} onkeydown={(e) => { if (e.key === 'Enter') skip(); }}>跳过引导</div>

    {:else if step === 2}
      <!-- Step 2: Kimi login -->
      <div class="ob-head">
        <div class="ob-logo">K</div>
        <h2>登录 <span class="grad">Kimi 账号</span></h2>
        <p>订阅额度、模型偏好与会话云同步</p>
      </div>
      <div class="ob-body">
        <div class="login-box">
          {#if authed}
            <div class="login-ok">✓ 已登录 · {client.authProvider()?.name ?? ''}</div>
          {:else}
            <span class="login-desc">使用浏览器完成 OAuth 设备码授权</span>
            <Button variant="primary" onclick={startLogin}>使用设备码登录</Button>
          {/if}
        </div>
        <div class="ob-dots"><i></i><i class="on"></i><i></i></div>
        <div class="ob-actions">
          <Button variant="ghost" onclick={() => step = 1}>← 上一步</Button>
          <Button variant="ghost" onclick={() => step = 3}>{authed ? '继续 →' : '暂不登录，稍后配置 →'}</Button>
        </div>
      </div>
      <div class="ob-skip" role="button" tabindex="0" onclick={skip} onkeydown={(e) => { if (e.key === 'Enter') skip(); }}>跳过引导</div>

    {:else}
      <!-- Step 3: theme + locale -->
      <div class="ob-head">
        <div class="ob-logo">K</div>
        <h2>选择你的<span class="grad">主题</span></h2>
        <p>磨砂质感，随时在 设置 → 常规 中更改</p>
      </div>
      <div class="ob-body">
        <div class="theme-cards">
          {#each [['dark', '深色磨砂', 'd'], ['light', '浅色磨砂', 'l'], ['system', '跟随系统', 's']] as [val, label, cls]}
            <button class="theme-card" class:on={selectedScheme === val} onclick={() => chooseScheme(val as 'light' | 'dark' | 'system')} type="button">
              <div class="pv {cls}"></div>
              <div class="tn">{label}</div>
            </button>
          {/each}
        </div>
        <div class="locale-row">
          <span class="ob-label">语言 / Language</span>
          <div class="ob-segmented">
            {#each availableLocales as loc (loc.code)}
              <button class="ob-seg-btn" class:on={selectedLocale === loc.code} onclick={() => chooseLocale(loc.code)} type="button">{loc.label}</button>
            {/each}
          </div>
        </div>
        <div class="ob-dots"><i></i><i></i><i class="on"></i></div>
        <div class="ob-actions">
          <Button variant="ghost" onclick={() => step = 2}>← 上一步</Button>
          <Button variant="primary" onclick={finish}>进入工作区 →</Button>
        </div>
      </div>
    {/if}
    {/key}
  </div>
  {#if showLogin}
    <LoginDialog onclose={() => showLogin = false} />
  {/if}
</div>

<style>
  .ob {
    position: fixed; inset: 0; z-index: var(--z-modal, 400);
    display: flex; align-items: center; justify-content: center;
    background: var(--overlay); padding: 24px;
    animation: kimi-fade-in var(--duration-base, 160ms) var(--ease, ease);
  }
  .ob-card {
    width: min(480px, 100%);
    background: var(--l2);
    border: 1px solid var(--bd2);
    border-radius: 16px;
    box-shadow: var(--toplight), var(--sh-lg);
    overflow: hidden;
    animation: kimi-fade-in-up var(--duration-slow, 260ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  }
  .ob-head, .ob-body {
    animation: kimi-fade-in var(--duration-base, 160ms) var(--ease, ease);
  }

  .ob-head { padding: 28px 28px 0; text-align: center; }
  .ob-logo {
    width: 52px; height: 52px; margin: 0 auto 14px; border-radius: 14px;
    background: linear-gradient(135deg, #4fa8ff, #5bc0be);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 22px; font-weight: 800;
    box-shadow: 0 0 32px rgba(79, 168, 255, 0.4);
  }
  .ob-head h2 { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; color: var(--tx); }
  .ob-head .grad { background: linear-gradient(90deg, #4fa8ff, #5bc0be); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .ob-head p { font-size: 12px; color: var(--tx2); margin-top: 7px; }

  .ob-body { padding: 20px 28px 24px; display: flex; flex-direction: column; gap: 10px; }
  .ob-feat {
    display: flex; gap: 12px; align-items: flex-start; padding: 11px 13px;
    border: 1px solid var(--bd); border-radius: var(--r-lg); background: var(--l1);
  }
  .ob-feat .fi { width: 28px; height: 28px; border-radius: var(--r-md); background: var(--ac-soft); color: var(--ac); display: flex; align-items: center; justify-content: center; font-size: 13px; flex: none; }
  .ob-feat .ft { font-size: 12.5px; font-weight: 600; color: var(--tx); }
  .ob-feat .fd { font-size: 11px; color: var(--tx3); margin-top: 2px; }

  .ob-dots { display: flex; gap: 6px; justify-content: center; padding: 4px 0; }
  .ob-dots i { width: 6px; height: 6px; border-radius: 99px; background: var(--bd2); transition: transform var(--duration-base, 160ms) var(--ease, ease), background var(--duration-base, 160ms) var(--ease, ease); transform-origin: center; }
  .ob-dots i.on { transform: scaleX(3); background: var(--ac); }
  .ob-actions { display: flex; gap: 10px; justify-content: center; padding-top: 4px; }
  .ob-skip { text-align: center; padding: 0 0 20px; font-size: 11px; color: var(--tx3); cursor: pointer; }
  .ob-skip:hover { color: var(--tx); }

  .login-box { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 10px 0 4px; }
  .login-desc { font-size: 12px; color: var(--tx2); }
  .login-ok { display: flex; align-items: center; gap: 10px; padding: 11px 16px; border: 1px solid var(--ok); border-radius: var(--r-lg); background: var(--ok-soft); color: var(--ok); font-size: 12.5px; font-weight: 600; }

  .theme-cards { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  .theme-card { border: 1px solid var(--bd); border-radius: var(--r-lg); padding: 10px; cursor: pointer; transition: border-color 0.15s var(--ease), box-shadow 0.15s var(--ease); background: var(--l1); }
  .theme-card:hover { border-color: var(--bd2); }
  .theme-card.on { border-color: var(--ac); box-shadow: 0 0 0 1px var(--ac); }
  .theme-card .pv { height: 46px; border-radius: var(--r-md); margin-bottom: 8px; border: 1px solid var(--bd); }
  .theme-card .pv.d { background: linear-gradient(135deg, #14161a 60%, #1e2228 60%); }
  .theme-card .pv.l { background: linear-gradient(135deg, #f2f4f8 60%, #ffffff 60%); }
  .theme-card .pv.s { background: linear-gradient(135deg, #14161a 50%, #f2f4f8 50%); }
  .theme-card .tn { font-size: 11px; font-weight: 600; text-align: center; color: var(--tx2); }
  .theme-card.on .tn { color: var(--ac); }

  .locale-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 2px 2px 0; }
  .ob-label { font-size: 12px; font-weight: 500; color: var(--tx2); }
  .ob-segmented { display: flex; gap: 2px; background: var(--l1); border: 1px solid var(--bd); border-radius: var(--r-md); padding: 2px; }
  .ob-seg-btn { padding: 4px 12px; border: none; background: transparent; color: var(--tx2); font-size: 12px; border-radius: var(--r-sm); cursor: pointer; transition: background 0.12s var(--ease), color 0.12s var(--ease); }
  .ob-seg-btn.on { background: var(--ac); color: #fff; font-weight: 600; }
</style>
