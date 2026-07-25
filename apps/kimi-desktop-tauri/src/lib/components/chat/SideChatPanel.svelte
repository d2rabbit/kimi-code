<!-- SideChatPanel.svelte — BTW 侧聊面板（右栏 tab）。

  侧信道 agent（父会话的 fork），继承会话上下文但不在侧栏产生会话。
  v1 语义（与 kimi-web 一致）：不跨重启持久化、不回放历史、流式只渲染
  text/thinking delta（侧聊内的 tool call 不做帧级渲染）。 -->
<script lang="ts">
  import * as client from '../../stores/client.svelte';
  import { messagesToTurns } from '../../lib/messagesToTurns';
  import MarkdownRenderer from './MarkdownRenderer.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import Textarea from '../ui/Textarea.svelte';

  let draft = $state('');
  let bodyEl: HTMLElement | null = $state(null);

  const messages = $derived(client.sideChatMessages());
  const running = $derived(client.sideChatRunning());
  const sending = $derived(client.sideChatSending());
  const turns = $derived(messagesToTurns(messages, [], undefined, running));

  const subtitle = $derived.by(() => {
    const first = turns.find((t) => t.role === 'user')?.text?.trim() ?? '';
    if (!first) return '继承当前会话上下文的旁路问答';
    return first.length > 40 ? `${first.slice(0, 40)}…` : first;
  });

  /** "waiting for first token" indicator from send until the assistant replies. */
  const showLoading = $derived(sending && turns.at(-1)?.role === 'user');

  function submit() {
    const text = draft.trim();
    if (!text) return;
    void client.client.sendSideChatPrompt(text);
    draft = '';
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  // Stick to bottom while streaming.
  $effect(() => {
    void turns.length;
    void turns.at(-1)?.text?.length;
    if (!running && !sending) return;
    requestAnimationFrame(() => {
      if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight;
    });
  });
</script>

<div class="sc">
  <header class="sc-head">
    <div class="sc-titles">
      <span class="sc-title">侧聊</span>
      <span class="sc-sub" title={subtitle}>{subtitle}</span>
    </div>
    <IconButton name="close" label="关闭侧聊" size="sm" onclick={() => client.client.closeSideChat()} />
  </header>

  <div class="sc-body" bind:this={bodyEl}>
    {#if turns.length === 0}
      <div class="sc-empty">侧聊还没有消息。<br />问点不想打断主对话的问题吧。</div>
    {:else}
      <div class="sc-turns">
        {#each turns as turn (turn.id)}
          {#if turn.role === 'user'}
            <div class="msg user">
              <div class="bubble u-bub">
                {#if turn.text}
                  <MarkdownRenderer text={turn.text} streaming={false} />
                {/if}
              </div>
            </div>
          {:else if turn.role !== 'compaction'}
            <div class="msg agent">
              <span class="avatar a">B</span>
              <div class="a-col">
                {#if turn.text}
                  <MarkdownRenderer text={turn.text} streaming={running && turn === turns.at(-1)} />
                {/if}
              </div>
            </div>
          {/if}
        {/each}
        {#if showLoading}
          <div class="sc-loading"><Spinner size="sm" /></div>
        {/if}
      </div>
    {/if}
  </div>

  <footer class="sc-composer">
    <Textarea
      bind:value={draft}
      rows={1}
      placeholder="问点别的…（Enter 发送）"
      onkeydown={onKeydown}
      class="sc-input"
    />
    <IconButton name="arrow-right" label="发送" size="sm" variant="default" disabled={!draft.trim()} onclick={submit} />
  </footer>
</div>

<style>
  .sc {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .sc-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
  }
  .sc-titles { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .sc-title { font-size: 13px; font-weight: 600; color: var(--tx); }
  .sc-sub {
    font-size: 10.5px;
    color: var(--tx3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sc-body { flex: 1; min-height: 0; overflow-y: auto; }
  .sc-empty {
    padding: 32px 16px;
    text-align: center;
    color: var(--tx3);
    font-size: 12px;
    line-height: 1.8;
  }
  .sc-turns { display: flex; flex-direction: column; gap: 12px; padding: 14px 12px; }

  .msg { display: flex; gap: 8px; }
  .msg.user { justify-content: flex-end; }
  .avatar {
    width: 22px; height: 22px;
    border-radius: var(--g-radius-control, 8px);
    flex: none;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700;
    margin-top: 2px;
  }
  .avatar.a { background: linear-gradient(135deg, var(--ac), var(--ac-h)); color: var(--color-text-on-accent, #fff); }

  .bubble {
    max-width: 92%;
    padding: 9px 12px;
    font-size: 12.5px;
    line-height: 1.6;
  }
  .u-bub {
    background: var(--mat-bubble-bg, var(--ac-soft));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--ac-bd));
    color: var(--tx);
    border-radius: var(--g-radius-bubble, 14px 14px 4px 14px);
    box-shadow: var(--elev-bubble, none);
  }
  .a-col { flex: 1; min-width: 0; font-size: 12.5px; line-height: 1.65; color: var(--tx); }

  .sc-loading { display: flex; padding: 2px 30px; }

  .sc-composer {
    flex: none;
    display: flex;
    align-items: flex-end;
    gap: 6px;
    padding: 8px 10px;
    border-top: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    background: var(--mat-surface-1, var(--l1));
  }
  .sc-composer :global(.ui-textarea) {
    min-height: 34px;
    max-height: 140px;
    font-size: 12.5px;
  }
</style>
