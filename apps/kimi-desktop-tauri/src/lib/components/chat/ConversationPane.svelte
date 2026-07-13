<!-- ConversationPane.svelte — conversation column (header + messages + composer). -->
<script lang="ts">
  import * as client from '../../stores/client.svelte';
  import { isMacosDesktop } from '../../lib/lib/desktopFlag';
  import Composer from './Composer.svelte';
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';

  let composerText = $state('');

  // Auto-scroll to bottom when turns change or stream updates.
  let scrollEl: HTMLElement | null = $state(null);
  $effect(() => {
    // Track the last turn's content for streaming scroll-follow, not just count.
    const lastTurn = client.turns.at(-1);
    const blockCount = lastTurn?.blocks.length ?? 0;
    const lastText = lastTurn?.blocks.at(-1);
    void blockCount;
    void lastText;
    void client.turns.length;
    if (scrollEl) {
      const raf = requestAnimationFrame(() => {
        if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
      });
      return () => cancelAnimationFrame(raf);
    }
  });

  async function handleSubmit() {
    const text = composerText.trim();
    if (!text) return;
    composerText = '';
    try {
      await client.client.sendPrompt(text);
    } catch {
      // Restore the text so the user doesn't lose their input on failure.
      composerText = text;
    }
  }

  async function handleAbort() {
    await client.client.abortCurrentPrompt();
  }

  const running = $derived(client.activity === 'running');
  const headerPadLeft = isMacosDesktop ? '108px' : '0';
</script>

<div class="conversation-pane">
  <!-- Chat header -->
  <header class="chat-header" style="padding-left: {headerPadLeft}">
    <div class="header-left">
      {#if client.activeSession}
        <span class="header-title">{client.activeSession.title || '新对话'}</span>
      {:else}
        <span class="header-title">新对话</span>
      {/if}
    </div>
    <div class="header-right">
      {#if running}
        <button class="abort-btn" onclick={handleAbort}>
          <Icon name="stop" size="sm" />
          <span>停止</span>
        </button>
      {/if}
      <IconButton name="sliders" label="模式" size="sm" />
    </div>
  </header>

  <!-- Messages -->
  <div class="messages-scroll" bind:this={scrollEl}>
    <div class="messages-inner">
      {#if client.turns.length === 0}
        <!-- Empty state / welcome -->
        <div class="welcome">
          <div class="welcome-logo">◧</div>
          <h1>开始与 Kimi Code 对话</h1>
          <p>输入你的问题，或使用 <code>/</code> 查看可用命令</p>
        </div>
      {:else}
        {#each client.turns as turn (turn.id)}
          {#if turn.role === 'user'}
            <div class="turn turn-user">
              <div class="turn-content user-content">
                {turn.text}
              </div>
            </div>
          {:else}
            <div class="turn turn-assistant">
              <div class="turn-content assistant-content">
                <!-- Phase 3: simplified rendering. Phase 4 will use full Markdown + tool cards. -->
                {#each turn.blocks ?? [] as block}
                  {#if block.kind === 'text'}
                    <div class="assistant-text">{block.text}</div>
                  {:else if block.kind === 'tool'}
                    <div class="tool-call-chip">
                      <Icon name="tool" size="sm" />
                      <span>{block.tool.name}</span>
                      {#if block.tool.arg}
                        <span class="tool-arg">{block.tool.arg}</span>
                      {/if}
                    </div>
                  {:else if block.kind === 'thinking'}
                    <div class="thinking-block">
                      <Icon name="sparkles" size="sm" />
                      <span>{block.thinking || '思考中…'}</span>
                    </div>
                  {/if}
                {/each}
                {#if running && turn === client.turns.at(-1)}
                  <span class="cursor"></span>
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  </div>

  <!-- Composer -->
  <Composer bind:text={composerText} {running} onsubmit={handleSubmit} />
</div>

<style>
  .conversation-pane {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .chat-header {
    flex: none;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    border-bottom: 1px solid var(--color-line, #2a2a2e);
    -webkit-app-region: drag;
    transition: padding-left 0.2s var(--ease-out, ease);
  }
  .header-left {
    overflow: hidden;
  }
  .header-title {
    font-size: var(--text-sm, 13px);
    font-weight: var(--weight-medium, 500);
    color: var(--color-text, #e7e7ea);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 4px;
    -webkit-app-region: no-drag;
  }
  .abort-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--color-danger, #ff6b6b);
    background: transparent;
    color: var(--color-danger, #ff6b6b);
    font-size: var(--text-xs, 12px);
    cursor: pointer;
    -webkit-app-region: no-drag;
  }
  .abort-btn:hover {
    background: var(--color-danger-soft, rgba(255, 107, 107, 0.1));
  }

  .messages-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .messages-inner {
    max-width: var(--p-content-max, 760px);
    margin: 0 auto;
    padding: 24px 24px 8px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Welcome / empty state */
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 80px 20px;
    text-align: center;
  }
  .welcome-logo {
    font-size: 48px;
    color: var(--color-accent, #7c8cff);
    opacity: 0.8;
  }
  .welcome h1 {
    font-size: var(--text-xl, 18px);
    font-weight: var(--weight-medium, 500);
    margin: 0;
  }
  .welcome p {
    font-size: var(--text-sm, 13px);
    color: var(--color-text-muted, #9a9aa2);
    margin: 0;
  }
  .welcome code {
    font-family: var(--font-mono, monospace);
    background: var(--color-surface-raised, #1a1a1e);
    padding: 2px 6px;
    border-radius: var(--radius-xs, 4px);
    font-size: var(--text-xs, 12px);
  }

  /* Turns */
  .turn {
    display: flex;
  }
  .turn-user {
    justify-content: flex-end;
  }
  .turn-content {
    max-width: 85%;
    line-height: var(--leading-normal, 1.5);
    font-size: var(--ui-font-size, var(--text-base, 14px));
  }
  .user-content {
    background: var(--color-surface-raised, #1a1a1e);
    padding: 10px 14px;
    border-radius: var(--radius-lg, 12px);
    color: var(--color-text, #e7e7ea);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .assistant-content {
    color: var(--color-text, #e7e7ea);
  }
  .assistant-text {
    white-space: pre-wrap;
    word-break: break-word;
  }
  .tool-call-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    margin: 4px 0;
    border-radius: var(--radius-sm, 6px);
    background: var(--color-surface-raised, #1a1a1e);
    border: 1px solid var(--color-line, #2a2a2e);
    font-size: var(--text-xs, 12px);
    color: var(--color-text-muted, #9a9aa2);
  }
  .tool-arg {
    color: var(--color-text-faint, #6a6a72);
    font-family: var(--font-mono, monospace);
  }
  .thinking-block {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    margin: 4px 0;
    font-size: var(--text-xs, 12px);
    color: var(--color-text-faint, #6a6a72);
    font-style: italic;
  }

  .cursor {
    display: inline-block;
    width: 2px;
    height: 1em;
    background: var(--color-accent, #7c8cff);
    animation: blink 1s steps(2) infinite;
    vertical-align: text-bottom;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cursor {
      animation: none;
    }
  }
</style>
