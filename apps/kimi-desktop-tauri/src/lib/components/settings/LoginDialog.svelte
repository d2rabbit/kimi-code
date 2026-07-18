<!-- LoginDialog.svelte — Kimi 第一方登录（OAuth 设备码流程）。
     展示设备码与验证地址 → 用户浏览器确认 → 轮询直至登录成功/过期/取消。 -->
<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import Icon from '../ui/Icon.svelte';
  import * as client from '../../stores/client.svelte';
  import { toast } from '../../stores/toast.svelte';

  let { onclose = () => {} }: { onclose?: () => void } = $props();

  type Phase = 'starting' | 'waiting' | 'success' | 'expired' | 'error';
  let phase = $state<Phase>('starting');
  let userCode = $state('');
  let verifyUrl = $state('');
  let verifyUrlComplete = $state('');
  let error = $state('');
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let copied = $state(false);

  const isTauri = '__TAURI_INTERNALS__' in globalThis;

  async function start() {
    phase = 'starting';
    error = '';
    try {
      const r = await client.client.startOAuthLogin();
      userCode = r.userCode ?? '';
      verifyUrl = r.verificationUri;
      verifyUrlComplete = r.verificationUriComplete ?? '';
      phase = 'waiting';
      const interval = Math.max(2, r.interval ?? 3) * 1000;
      pollTimer = setInterval(poll, interval);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      phase = 'error';
    }
  }

  async function poll() {
    try {
      const r = await client.client.pollOAuthLogin();
      if (!r) return;
      if (r.status === 'authenticated') {
        stopPoll();
        phase = 'success';
        toast.ok('Kimi 登录成功');
        try { await client.client.checkAuth(); } catch { /* 状态稍后自动刷新 */ }
        setTimeout(onclose, 900);
      } else if (r.status === 'expired' || r.status === 'cancelled') {
        stopPoll();
        phase = 'expired';
      }
    } catch { /* 网络抖动时继续轮询 */ }
  }

  function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  async function cancel() {
    stopPoll();
    try { await client.client.cancelOAuthLogin(); } catch { /* 忽略 */ }
    onclose();
  }

  async function openVerify() {
    const url = verifyUrlComplete || verifyUrl;
    try {
      if (isTauri) await invoke('open_path', { path: url });
      else window.open(url, '_blank');
    } catch { window.open(url, '_blank'); }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(userCode);
      copied = true;
      setTimeout(() => copied = false, 1200);
    } catch { /* 剪贴板不可用时忽略 */ }
  }

  $effect(() => {
    void start();
    return () => stopPoll();
  });
</script>

<div class="ld-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) cancel(); }} onkeydown={(e) => { if (e.key === 'Escape') cancel(); }}>
  <div class="ld-card animate-spring-in" role="dialog" aria-modal="true" aria-label="登录 Kimi">
    <div class="ld-head">
      <span class="ld-logo">K</span>
      <div>
        <div class="ld-title">登录 Kimi 账号</div>
        <div class="ld-sub">第一方模型 · 订阅额度 · 云同步</div>
      </div>
      <button class="ld-x" onclick={cancel} aria-label="关闭"><Icon name="close" size="sm" /></button>
    </div>

    {#if phase === 'starting'}
      <div class="ld-center"><span class="spin"></span><p>正在发起登录…</p></div>
    {:else if phase === 'error'}
      <div class="ld-center">
        <p class="ld-err">{error}</p>
        <button class="btn pri" onclick={start} type="button">重试</button>
      </div>
    {:else if phase === 'success'}
      <div class="ld-center">
        <div class="ld-ok">✓</div>
        <p>登录成功，正在返回…</p>
      </div>
    {:else if phase === 'expired'}
      <div class="ld-center">
        <p class="ld-err">登录已过期或被取消</p>
        <button class="btn pri" onclick={start} type="button">重新发起</button>
      </div>
    {:else}
      <div class="ld-body">
        <p class="ld-guide">在浏览器中打开验证地址并确认以下设备码：</p>
        <button class="ld-code" onclick={copyCode} title="点击复制" type="button">
          {userCode}
          <span class="ld-copy">{copied ? '已复制 ✓' : '⧉'}</span>
        </button>
        <button class="btn pri ld-open" onclick={openVerify} type="button">
          在浏览器中打开验证页
        </button>
        <p class="ld-wait"><span class="spin sm"></span>等待你在浏览器中确认…</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .ld-backdrop {
    position: fixed; inset: 0; z-index: var(--z-modal, 400);
    display: flex; align-items: center; justify-content: center;
    background: var(--overlay);
  }
  .ld-card {
    width: min(400px, 92vw);
    background: var(--l3);
    border: 1px solid var(--bd2);
    border-radius: var(--r-xl);
    box-shadow: var(--sh-lg);
    overflow: hidden;
  }
  .ld-head { display: flex; align-items: center; gap: 12px; padding: 18px 18px 12px; }
  .ld-logo { width: 36px; height: 36px; border-radius: var(--r-lg); background: linear-gradient(135deg, #4fa8ff, #5bc0be); color: #fff; font-weight: 700; font-size: 15px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 16px rgba(79, 168, 255, 0.3); flex: none; }
  .ld-title { font-size: 14px; font-weight: 700; color: var(--tx); }
  .ld-sub { font-size: 11px; color: var(--tx3); margin-top: 1px; }
  .ld-x { margin-left: auto; width: 24px; height: 24px; border: none; border-radius: var(--r-sm); background: transparent; color: var(--tx3); cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .ld-x:hover { background: var(--ac-soft); color: var(--tx); }

  .ld-center { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 28px 18px 24px; font-size: 12px; color: var(--tx2); }
  .ld-err { color: var(--err); font-size: 12px; }
  .ld-ok { width: 40px; height: 40px; border-radius: 50%; background: var(--ok-soft); color: var(--ok); font-size: 20px; display: flex; align-items: center; justify-content: center; }

  .ld-body { display: flex; flex-direction: column; gap: 12px; padding: 4px 18px 18px; }
  .ld-guide { font-size: 12px; color: var(--tx2); }
  .ld-code {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    padding: 12px; border-radius: var(--r-md);
    border: 1px dashed var(--ac-bd); background: var(--ac-soft);
    font-family: var(--font-mono); font-size: 17px; font-weight: 700; letter-spacing: 0.08em;
    color: var(--ac); cursor: pointer;
  }
  .ld-copy { font-size: 10px; font-family: var(--font-ui); font-weight: 500; color: var(--tx3); }
  .ld-open { justify-content: center; }
  .ld-wait { display: flex; align-items: center; gap: 7px; justify-content: center; font-size: 11px; color: var(--tx3); }

  .spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--bd); border-top-color: var(--ac); animation: rot 0.8s linear infinite; }
  .spin.sm { width: 11px; height: 11px; border-width: 1.5px; }
  @keyframes rot { to { transform: rotate(360deg); } }

  .btn { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 12px; border-radius: var(--r-md); font-size: 12px; font-weight: 600; border: 1px solid var(--bd2); color: var(--tx2); background: transparent; cursor: pointer; }
  .btn.pri { background: var(--ac); border-color: transparent; color: #fff; }
  .btn.pri:hover { background: var(--ac-h); }
</style>
