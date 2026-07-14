<!-- ConversationPane.svelte — conversation column (header + messages + dock + composer).
     Phase 3 upgrade: Markdown rendering, ToolCard, ApprovalCard, QuestionCard, SlashMenu. -->
<script lang="ts">
  import * as client from '../../stores/client.svelte';
  import { isMacosDesktop } from '../../lib/desktopFlag.js';
  import Composer from './Composer.svelte';
  import MarkdownRenderer from './MarkdownRenderer.svelte';
  import ToolCard from './ToolCard.svelte';
  import ApprovalCard from './ApprovalCard.svelte';
  import QuestionCard from './QuestionCard.svelte';
  import StatusDot from '../ui/StatusDot.svelte';
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import type { TurnBlock, ToolCall } from '../../types';

  let composerText = $state('');

  // Auto-scroll to bottom when turns change or stream updates.
  let scrollEl: HTMLElement | null = $state(null);
  $effect(() => {
    const lastTurn = client.turns.at(-1);
    const blockCount = lastTurn?.blocks?.length ?? 0;
    void blockCount;
    void client.turns.length;
    if (scrollEl) {
      const raf = requestAnimationFrame(() => {
        if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
      });
      return () => cancelAnimationFrame(raf);
    }
  });

  async function handleSubmit(attachments?: { fileId: string; kind: 'image' | 'video' }[]) {
    const text = composerText.trim();
    if (!text && (!attachments || attachments.length === 0)) return;
    composerText = '';
    try {
      await client.client.sendPrompt(text || ' ', attachments);
    } catch {
      composerText = text;
    }
  }

  async function handleAbort() {
    await client.client.abortCurrentPrompt();
  }

  const running = $derived(client.activity === 'running');
  const headerPadLeft = isMacosDesktop ? '108px' : '0';

  // Pending approval/question (first in list).
  const pendingApproval = $derived(client.pendingApprovals[0]);
  const pendingQuestion = $derived(client.questions[0]);

  // --- Tool grouping: aggregate consecutive tool blocks into collapsible groups ---
  type RenderItem =
    | { kind: 'thinking'; thinking: string }
    | { kind: 'text'; text: string }
    | { kind: 'tool'; tool: ToolCall }
    | { kind: 'tool-group'; tools: ToolCall[] };

  function groupBlocks(blocks: TurnBlock[]): RenderItem[] {
    const result: RenderItem[] = [];
    let toolBuffer: ToolCall[] = [];
    for (const block of blocks) {
      if (block.kind === 'tool') {
        toolBuffer.push(block.tool);
      } else {
        if (toolBuffer.length > 0) {
          result.push(toolBuffer.length === 1
            ? { kind: 'tool', tool: toolBuffer[0]! }
            : { kind: 'tool-group', tools: [...toolBuffer] });
          toolBuffer = [];
        }
        if (block.kind === 'text') {
          result.push({ kind: 'text', text: block.text });
        } else if (block.kind === 'thinking') {
          result.push({ kind: 'thinking', thinking: block.thinking });
        }
      }
    }
    if (toolBuffer.length > 0) {
      result.push(toolBuffer.length === 1
        ? { kind: 'tool', tool: toolBuffer[0]! }
        : { kind: 'tool-group', tools: [...toolBuffer] });
    }
    return result;
  }

  function groupAggregateStatus(tools: ToolCall[]): 'running' | 'ok' | 'error' {
    if (tools.some((t) => t.status === 'running')) return 'running';
    if (tools.some((t) => t.status === 'error')) return 'error';
    return 'ok';
  }

  let expandedGroups = $state<Record<number, boolean>>({});
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
      {#if client.activeSession}
        <IconButton name="close" label="归档对话" size="sm" onclick={() => client.client.archiveSession(client.activeSessionId)} />
      {/if}
    </div>
  </header>

  <!-- Messages -->
  <div class="messages-scroll" bind:this={scrollEl}>
    <div class="messages-inner">
      {#if client.turns.length === 0 && !client.sessionLoading}
        <!-- Empty state: centered welcome -->
        <div class="welcome">
          <div class="welcome-logo">◧</div>
          <h1>开始与 Kimi Code 对话</h1>
          <p>输入你的问题，或使用 <code>/</code> 查看可用命令</p>
        </div>
      {:else if client.turns.length === 0 && client.sessionLoading}
        <div class="loading-hint">
          <div class="spinner"></div>
          <p>加载中…</p>
        </div>
      {:else}
        {#each client.turns as turn (turn.id)}
          {#if turn.role === 'user'}
            <div class="turn turn-user">
              {#if turn.images?.length}
                <div class="user-images">
                  {#each turn.images as img (img.url)}
                    <img src={img.url} alt={img.alt ?? ''} />
                  {/each}
                </div>
              {/if}
              {#if turn.text}
                <div class="turn-content user-content">
                  {turn.text}
                </div>
              {/if}
            </div>
          {:else if turn.role === 'compaction'}
            <div class="compaction-divider">
              <Icon name="check-list" size="sm" />
              <span>对话已压缩</span>
              {#if turn.compaction?.tokensBefore}
                <span class="compact-stats">{turn.compaction.tokensBefore} → {turn.compaction.tokensAfter ?? '?'} tokens</span>
              {/if}
            </div>
          {:else}
            <!-- Assistant turn -->
            <div class="turn turn-assistant">
              <div class="turn-content assistant-content">
                {#each groupBlocks(turn.blocks ?? []) as item, i}
                  {#if item.kind === 'thinking'}
                    <details class="thinking-details">
                      <summary>
                        <Icon name="sparkles" size="sm" />
                        <span>思考过程</span>
                      </summary>
                      <div class="thinking-body">{item.thinking}</div>
                    </details>
                  {:else if item.kind === 'text'}
                    <MarkdownRenderer text={item.text} streaming={running && turn === client.turns.at(-1)} />
                  {:else if item.kind === 'tool'}
                    <ToolCard tool={item.tool} />
                  {:else if item.kind === 'tool-group'}
                    <!-- Tool group: collapsible aggregate of consecutive tool calls -->
                    {#if expandedGroups[i] ?? (groupAggregateStatus(item.tools) === 'running')}
                      <!-- Expanded: show individual ToolCards -->
                      <div class="tool-group-header" onclick={() => expandedGroups[i] = false}>
                        <StatusDot status={groupAggregateStatus(item.tools)} />
                        <Icon name="list" size="sm" />
                        <span>{item.tools.length} 个工具调用</span>
                        <Icon name="chevron-down" size="sm" />
                      </div>
                      {#each item.tools as tool (tool.id)}
                        <ToolCard {tool} />
                      {/each}
                    {:else}
                      <!-- Collapsed: just the summary header -->
                      <button class="tool-group-header collapsed" onclick={() => expandedGroups[i] = true} type="button">
                        <StatusDot status={groupAggregateStatus(item.tools)} />
                        <Icon name="list" size="sm" />
                        <span>{item.tools.length} 个工具调用</span>
                        <span class="tool-group-names">
                          {item.tools.map((t) => t.name).slice(0, 3).join(', ')}
                          {#if item.tools.length > 3}…{/if}
                        </span>
                        <Icon name="chevron-right" size="sm" />
                      </button>
                    {/if}
                  {/if}
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  </div>

  <!-- Dock: pending approval / question (above composer, mutually exclusive) -->
  {#if pendingApproval}
    <div class="dock-area">
      <ApprovalCard request={pendingApproval} />
    </div>
  {:else if pendingQuestion}
    <div class="dock-area">
      <QuestionCard question={pendingQuestion} />
    </div>
  {/if}

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
  .header-left { overflow: hidden; }
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
  .abort-btn:hover { background: var(--color-danger-soft, rgba(255, 107, 107, 0.1)); }

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

  .loading-hint {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 80px 20px;
    color: var(--color-text-muted, #9a9aa2);
  }
  .spinner {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--color-line, #2a2a2e);
    border-top-color: var(--color-accent, #7c8cff);
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Turns */
  .turn { display: flex; }
  .turn-user { justify-content: flex-end; }
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
    width: 100%;
    max-width: none;
  }

  .user-images {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 6px;
    justify-content: flex-end;
  }
  .user-images img {
    max-width: 200px;
    max-height: 200px;
    border-radius: var(--radius-md, 8px);
    object-fit: cover;
  }

  /* Compaction divider */
  .compaction-divider {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: var(--radius-md, 8px);
    background: var(--color-surface-raised, transparent);
    border: 1px dashed var(--color-line-strong, #3a3a3e);
    font-size: var(--text-xs, 12px);
    color: var(--color-text-muted, #9a9aa2);
  }
  .compact-stats {
    color: var(--color-text-faint, #6a6a72);
    font-family: var(--font-mono, monospace);
  }

  /* Tool group header */
  .tool-group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    margin: 4px 0;
    border: none;
    border-radius: var(--radius-md, 8px);
    background: var(--color-surface-raised, transparent);
    color: var(--color-text-muted, #9a9aa2);
    font-size: var(--text-xs, 12px);
    cursor: pointer;
    text-align: left;
    transition: background var(--duration-fast, 120ms);
  }
  .tool-group-header:hover {
    background: var(--color-hover, rgba(255,255,255,0.04));
  }
  .tool-group-header.collapsed {
    border: 1px solid var(--color-line, #2a2a2e);
  }
  .tool-group-names {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.6;
    font-family: var(--font-mono, monospace);
    min-width: 0;
  }

  /* Thinking block */
  .thinking-details {
    margin: 4px 0 8px;
    border-radius: var(--radius-sm, 6px);
    background: var(--color-surface-raised, rgba(128,128,128,0.06));
    overflow: hidden;
  }
  .thinking-details summary {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px;
    cursor: pointer;
    font-size: var(--text-xs, 12px);
    color: var(--color-text-faint, #6a6a72);
    font-style: italic;
  }
  .thinking-body {
    padding: 8px 12px;
    font-size: var(--text-xs, 12px);
    color: var(--color-text-muted, #9a9aa2);
    white-space: pre-wrap;
    line-height: 1.5;
  }

  /* Dock area (approval / question) */
  .dock-area {
    flex: none;
    max-width: var(--p-content-max, 760px);
    width: 100%;
    margin: 0 auto;
    padding: 0 24px 4px;
    box-sizing: border-box;
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; }
  }
</style>
