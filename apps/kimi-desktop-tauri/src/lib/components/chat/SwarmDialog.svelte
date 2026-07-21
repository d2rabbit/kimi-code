<!-- SwarmDialog.svelte — start a swarm sub-agent task.

  Mirrors CLI `/swarm <prompt>`: enables swarmMode on the session (if not
  already on), then sends the user's task prompt as a normal message —
  the agent sees swarmMode=true and dispatches sub-agents accordingly.
  Just toggling the boolean does nothing on its own; a prompt is required.
-->
<script lang="ts">
  import * as client from '../../stores/client.svelte';
  import { toast } from '../../stores/toast.svelte';
  import Icon from '../ui/Icon.svelte';

  let {
    open = $bindable(false),
  }: {
    open?: boolean;
  } = $props();

  let text = $state('');
  let busy = $state(false);

  $effect(() => {
    if (open) text = '';
  });

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    busy = true;
    try {
      // 1) Enable swarm mode on the session (idempotent).
      if (!client.swarmMode()) {
        client.client.toggleSwarmMode();
      }
      // 2) Send the task prompt — the agent will dispatch sub-agents.
      await client.client.sendPrompt(trimmed);
      toast.ok('Swarm 任务已派发');
      open = false;
    } catch (e) {
      toast.err(`Swarm 启动失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busy = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { open = false; return; }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); }
  }
</script>

{#if open}
  <div class="mask" onclick={() => { open = false; }} role="presentation">
    <div class="dialog glass-panel" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="启动 Swarm 任务">
      <header class="head">
        <h3>启动 Swarm 任务</h3>
        <button class="close" onclick={() => { open = false; }} type="button" aria-label="关闭"><Icon name="close" size="sm" /></button>
      </header>
      <p class="hint">输入任务描述，agent 会派发多个子智能体并行处理。当前会话 swarm 模式会自动开启。</p>
      <textarea
        bind:value={text}
        onkeydown={onKey}
        placeholder="例如：调研 packages/ 下每个包的测试覆盖率，写出每个包的 gap report"
        rows="4"
        autofocus
        disabled={busy}
      ></textarea>
      <footer class="foot">
        <span class="kbd-hint">⌘↩ 提交 · Esc 关闭</span>
        <span style="flex:1"></span>
        <button class="btn primary" onclick={() => { void submit(); }} type="button" disabled={busy || !text.trim()}>
          派发
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .mask {
    position: fixed; inset: 0; z-index: 500;
    background: var(--overlay);
    backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
  }
  .dialog {
    width: 560px; max-width: calc(100vw - 32px);
    background: var(--l1);
    border: 1px solid var(--bd2);
    border-radius: 12px;
    padding: 18px 20px 14px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.25);
  }
  .head { display: flex; align-items: center; margin-bottom: 6px; }
  .head h3 { margin: 0; font-size: 15px; flex: 1; }
  .close {
    border: none; background: transparent; color: var(--tx3);
    cursor: pointer; padding: 4px; border-radius: 6px;
  }
  .close:hover { background: var(--l2); color: var(--tx); }
  .hint { margin: 0 0 10px; font-size: 12px; color: var(--tx2); line-height: 1.5; }
  textarea {
    width: 100%; box-sizing: border-box;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--bd);
    background: var(--l2);
    color: var(--tx);
    font: inherit; font-size: 13px;
    resize: vertical;
    min-height: 88px;
  }
  textarea:focus { outline: none; border-color: var(--ac); }
  .foot { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
  .kbd-hint { font-size: 11px; color: var(--tx3); }
  .btn {
    padding: 7px 14px; border-radius: 7px; cursor: pointer;
    border: 1px solid var(--bd2); background: var(--l2); color: var(--tx);
    font-size: 12px; font-weight: 500;
  }
  .btn:hover:not(:disabled) { background: var(--l3); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.primary {
    background: var(--ac); color: var(--color-text-on-accent, #fff);
    border-color: transparent;
  }
  .btn.primary:hover:not(:disabled) { background: var(--ac-h); }
</style>
