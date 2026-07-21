<!-- GoalDialog.svelte — set or clear the active session goal.

  Mirrors CLI `/goal <objective>` (start / replace) and `/goal cancel`
  (clear). The backend has no `goalMode` boolean — a goal is created by
  submitting `goalObjective: string` to updateSession and cleared by
  submitting an empty string. Pause/resume/cancel of an *existing* goal
  is already handled by GoalStrip.svelte (the banner above the
  transcript).
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

  // Pre-fill with the current objective when reopening (lets users edit
  // rather than retype). Resets when the dialog closes.
  let text = $state('');
  let busy = $state(false);

  // Sync text from the live goal whenever the dialog opens.
  $effect(() => {
    if (open) {
      text = client.goal()?.objective ?? '';
    }
  });

  const existing = $derived(client.goal());

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed) {
      await clearGoal();
      return;
    }
    busy = true;
    try {
      await client.client.setGoalObjective(trimmed);
      toast.ok(existing ? '目标已更新' : '目标已启动');
      open = false;
    } catch (e) {
      toast.err(`设置目标失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busy = false;
    }
  }

  async function clearGoal() {
    busy = true;
    try {
      await client.client.setGoalObjective('');
      toast.ok('已取消目标');
      open = false;
    } catch (e) {
      toast.err(`取消目标失败：${e instanceof Error ? e.message : String(e)}`);
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
    <div class="dialog glass-panel" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="设置目标">
      <header class="head">
        <h3>{existing ? '更新目标' : '设置目标'}</h3>
        <button class="close" onclick={() => { open = false; }} type="button" aria-label="关闭"><Icon name="close" size="sm" /></button>
      </header>
      <p class="hint">用一句话描述你希望 agent 持续推进的目标。可以包含停止条件（如"20 轮后停止"）。</p>
      <textarea
        bind:value={text}
        onkeydown={onKey}
        placeholder="例如：把 packages/foo 里所有的 console.log 替换为结构化 logger，10 轮内完成"
        rows="4"
        autofocus
        disabled={busy}
      ></textarea>
      {#if existing}
        <p class="existing">
          当前目标：<span class="mono">{existing.objective}</span>
          <span class="status">状态：{existing.status}</span>
        </p>
      {/if}
      <footer class="foot">
        <span class="kbd-hint">⌘↩ 提交 · Esc 关闭</span>
        <span style="flex:1"></span>
        {#if existing}
          <button class="btn" onclick={() => { void clearGoal(); }} type="button" disabled={busy}>取消目标</button>
        {/if}
        <button class="btn primary" onclick={() => { void submit(); }} type="button" disabled={busy || !text.trim()}>
          {existing ? '更新' : '启动'}
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
  .existing {
    margin: 10px 0 0; font-size: 12px; color: var(--tx2);
    display: flex; gap: 8px; align-items: baseline;
  }
  .existing .mono { font-family: var(--mono-font, monospace); color: var(--tx); }
  .existing .status { color: var(--ac); }
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
