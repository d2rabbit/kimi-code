<!-- SwarmDialog.svelte — start a swarm sub-agent task.

  Mirrors CLI `/swarm <prompt>`: enables swarmMode on the session (if not
  already on), then sends the user's task prompt as a normal message —
  the agent sees swarmMode=true and dispatches sub-agents accordingly.
  Just toggling the boolean does nothing on its own; a prompt is required.
-->
<script lang="ts">
  import * as client from '../../stores/client.svelte';
  import { toast } from '../../stores/toast.svelte';
  import Button from '../ui/Button.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Textarea from '../ui/Textarea.svelte';

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
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="mask" onclick={() => { open = false; }} onkeydown={(e) => { if (e.key === 'Escape') open = false; }} role="presentation">
    <div class="dialog" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="启动 Swarm 任务" tabindex="-1">
      <header class="head">
        <h3>启动 Swarm 任务</h3>
        <IconButton name="close" label="关闭" size="sm" onclick={() => { open = false; }} />
      </header>
      <p class="hint">输入任务描述，agent 会派发多个子智能体并行处理。当前会话 swarm 模式会自动开启。</p>
      <!-- svelte-ignore a11y_autofocus -->
      <Textarea
        bind:value={text}
        onkeydown={onKey}
        placeholder="例如：调研 packages/ 下每个包的测试覆盖率，写出每个包的 gap report"
        rows={4}
        autofocus
        disabled={busy}
        class="swarm-input"
      />
      <footer class="foot">
        <span class="kbd-hint">⌘↩ 提交 · Esc 关闭</span>
        <span style="flex:1"></span>
        <Button variant="primary" onclick={() => { void submit(); }} disabled={busy || !text.trim()}>
          派发
        </Button>
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
    background: var(--mat-surface-3, var(--l1));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd2));
    border-radius: var(--g-radius-overlay, 12px);
    padding: 18px 20px 14px;
    box-shadow: var(--elev-overlay, 0 12px 40px rgba(0,0,0,0.25));
  }
  .head { display: flex; align-items: center; margin-bottom: 6px; }
  .head h3 { margin: 0; font-size: 15px; flex: 1; }
  .hint { margin: 0 0 10px; font-size: 12px; color: var(--tx2); line-height: 1.5; }
  .foot { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
  .kbd-hint { font-size: 11px; color: var(--tx3); }
</style>
