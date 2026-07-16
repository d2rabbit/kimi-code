<!-- ConversationPane.svelte — clean chat view inspired by Codex. -->
<script lang="ts">
  import * as client from '../../stores/client.svelte';
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Composer from './Composer.svelte';
  import MarkdownRenderer from './MarkdownRenderer.svelte';
  import ToolCard from './ToolCard.svelte';
  import ApprovalCard from './ApprovalCard.svelte';
  import QuestionCard from './QuestionCard.svelte';
  import type { ToolCall, TurnBlock } from '../../types';

  let composerText = $state('');
  let scrollEl: HTMLElement | null = $state(null);

  $effect(() => {
    const turns = client.turns();
    void turns.length;
    void turns.at(-1)?.blocks?.length;
    if (scrollEl) {
      requestAnimationFrame(() => { if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight; });
    }
  });

  async function handleSubmit(attachments?: { fileId: string; kind: 'image' | 'video' }[]) {
    const text = composerText.trim();
    if (!text && (!attachments || attachments.length === 0)) return;
    composerText = '';
    try { await client.client.sendPrompt(text || ' ', attachments); }
    catch { composerText = text; }
  }

  async function handleAbort() { await client.client.abortCurrentPrompt(); }

  const running = $derived(client.activity() === 'running');
  const pendingApproval = $derived(client.pendingApprovals()[0]);
  const pendingQuestion = $derived(client.questions()[0]);

  type RenderItem =
    | { kind: 'thinking'; thinking: string }
    | { kind: 'text'; text: string }
    | { kind: 'tool'; tool: ToolCall }
    | { kind: 'tool-group'; tools: ToolCall[] };

  function groupBlocks(blocks: TurnBlock[]): RenderItem[] {
    const result: RenderItem[] = [];
    let buf: ToolCall[] = [];
    for (const b of blocks) {
      if (b.kind === 'tool') { buf.push(b.tool); }
      else {
        if (buf.length) { result.push(buf.length === 1 ? { kind: 'tool', tool: buf[0]! } : { kind: 'tool-group', tools: [...buf] }); buf = []; }
        if (b.kind === 'thinking') result.push({ kind: 'thinking', thinking: b.thinking });
        else if (b.kind === 'text') result.push({ kind: 'text', text: b.text });
      }
    }
    if (buf.length) result.push(buf.length === 1 ? { kind: 'tool', tool: buf[0]! } : { kind: 'tool-group', tools: [...buf] });
    return result;
  }

  let expandedGroups = $state<Record<number, boolean>>({});
</script>

<div class="conversation-pane">
  <!-- Minimal header -->
  <header class="chat-header">
    <div class="header-left">
      {#if client.activeSession()}
        <span class="header-title">{client.activeSession()!.title || '新对话'}</span>
      {:else}
        <span class="header-title">新对话</span>
      {/if}
      {#if running}
        <span class="status-dot running"></span>
      {/if}
    </div>
    <div class="header-right">
      {#if running}
        <button class="abort-btn" onclick={handleAbort}><Icon name="stop" size="sm" /> 停止</button>
      {/if}
      {#if client.activeSession()}
        <IconButton name="close" label="归档" size="sm" onclick={() => client.client.archiveSession(client.activeSessionId())} />
      {/if}
    </div>
  </header>

  <!-- Messages -->
  <div class="messages-scroll" bind:this={scrollEl}>
    <div class="messages-inner">
      {#if client.turns().length === 0 && !client.sessionLoading()}
        <div class="welcome">
          <div class="welcome-logo">◧</div>
          <h1>How can I help?</h1>
          <div class="welcome-chips">
            <button class="chip" onclick={() => composerText = '解释这个项目的目录结构'}>解释项目结构</button>
            <button class="chip" onclick={() => composerText = '帮我写一个单元测试'}>写单元测试</button>
            <button class="chip" onclick={() => composerText = '审查最近的代码变更'}>审查代码</button>
            <button class="chip mono" onclick={() => composerText = '/'}><span>/</span> 命令</button>
          </div>
        </div>
      {:else if client.turns().length === 0 && client.sessionLoading()}
        <div class="loading"><div class="spinner"></div></div>
      {:else}
        {#each client.turns() as turn (turn.id)}
          {#if turn.role === 'user'}
            <div class="msg user-msg">
              {#if turn.images?.length}
                <div class="msg-images">{#each turn.images as img (img.url)}<img src={img.url} alt={img.alt ?? ''} />{/each}</div>
              {/if}
              {#if turn.text}<div class="msg-bubble user-bubble">{turn.text}</div>{/if}
            </div>
          {:else if turn.role === 'compaction'}
            <div class="compaction">对话已压缩</div>
          {:else}
            <div class="msg assistant-msg">
              {#each groupBlocks(turn.blocks ?? []) as item, i}
                {#if item.kind === 'thinking'}
                  <details class="thinking"><summary>思考过程</summary><div class="thinking-body">{item.thinking}</div></details>
                {:else if item.kind === 'text'}
                  <div class="msg-text"><MarkdownRenderer text={item.text} streaming={running && turn === client.turns().at(-1)} /></div>
                {:else if item.kind === 'tool'}
                  <ToolCard tool={item.tool} />
                {:else if item.kind === 'tool-group'}
                  <div class="tool-group">
                    <button class="tg-toggle" onclick={() => expandedGroups[i] = !(expandedGroups[i] ?? true)}>
                      {expandedGroups[i] ?? true ? '▾' : '▸'} {item.tools.length} 个工具调用
                    </button>
                    {#if expandedGroups[i] ?? true}
                      {#each item.tools as t}<ToolCard tool={t} />{/each}
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        {/each}
        {#if pendingApproval}<ApprovalCard />{/if}
        {#if pendingQuestion}<QuestionCard />{/if}
      {/if}
    </div>
  </div>

  <!-- Composer -->
  <Composer bind:text={composerText} {running} onsubmit={handleSubmit} />
</div>

<style>
  .conversation-pane { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

  .chat-header {
    flex: none; height: 44px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px;
    background: rgba(20, 20, 20, 0.6);
    backdrop-filter: blur(20px) saturate(1.4);
    -webkit-backdrop-filter: blur(20px) saturate(1.4);
    border-bottom: 1px solid rgba(255,255,255,0.04);
    -webkit-app-region: drag;
  }
  .header-left { display: flex; align-items: center; gap: 8px; overflow: hidden; -webkit-app-region: drag; }
  .header-title { font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.92); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; }
  .status-dot.running { background: #30d158; animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
  .header-right { display: flex; align-items: center; gap: 4px; -webkit-app-region: no-drag; }
  .abort-btn {
    display: flex; align-items: center; gap: 4px;
    padding: 4px 10px; border-radius: 6px;
    border: 1px solid rgba(248,81,73,0.3);
    background: transparent; color: #ff453a; font-size: 12px; cursor: pointer;
  }

  .messages-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; }
  .messages-inner { max-width: 760px; margin: 0 auto; padding: 20px 24px 8px; display: flex; flex-direction: column; gap: 14px; }

  /* Welcome */
  .welcome { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 60px 20px 40px; text-align: center; }
  .welcome-logo { font-size: 36px; color: var(--color-text-faint, rgba(235,235,245,0.3)); }
  .welcome h1 { font-size: 22px; font-weight: 500; letter-spacing: -0.02em; margin: 0; color: var(--color-text, rgba(255,255,255,0.92)); }
  .welcome-chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 440px; }
  .chip {
    padding: 7px 14px; border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.08);
    background: transparent; color: var(--color-text-muted, rgba(235,235,245,0.6)); font-size: 12px; cursor: pointer;
    transition: all 0.12s;
  }
  .chip:hover { border-color: rgba(255,255,255,0.15); color: rgba(255,255,255,0.92); background: rgba(255,255,255,0.03); }
  .chip.mono { font-family: "JetBrains Mono Variable", monospace; }

  /* Messages */
  .msg { display: flex; flex-direction: column; gap: 6px; }
  .user-msg { align-items: flex-end; }
  .msg-bubble { max-width: 85%; padding: 8px 14px; border-radius: 16px 16px 4px 16px; }
  .user-bubble { background: rgba(255,255,255,0.08); color: var(--color-text, rgba(255,255,255,0.92)); }
  .msg-images { display: flex; gap: 6px; flex-wrap: wrap; max-width: 85%; }
  .msg-images img { max-width: 120px; border-radius: 8px; }
  .assistant-msg { width: 100%; }
  .msg-text { color: var(--color-text, rgba(255,255,255,0.92)); line-height: 1.6; }
  .thinking { font-size: 12px; color: var(--color-text-faint, rgba(235,235,245,0.3)); margin: 4px 0; }
  .thinking summary { cursor: pointer; color: var(--color-text-faint, rgba(235,235,245,0.3)); }
  .thinking-body { padding: 8px 12px; font-family: monospace; white-space: pre-wrap; }

  .tool-group { margin: 4px 0; }
  .tg-toggle {
    font-size: 11px; color: var(--color-text-faint, rgba(235,235,245,0.3)); cursor: pointer;
    background: none; border: none; padding: 2px 0;
  }

  .compaction {
    text-align: center; font-size: 11px; color: var(--color-text-faint, rgba(235,235,245,0.3));
    padding: 8px; border-top: 1px solid rgba(255,255,255,0.04);
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }

  .loading { display: flex; justify-content: center; padding: 40px; }
  .spinner {
    width: 24px; height: 24px;
    border: 2px solid rgba(255,255,255,0.08);
    border-top-color: rgba(255,255,255,0.4);
    border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
