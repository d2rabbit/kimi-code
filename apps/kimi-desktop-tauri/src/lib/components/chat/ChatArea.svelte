<!-- ChatArea.svelte — clean chat view: header + messages + composer. -->
<script lang="ts">
  import * as client from '../../stores/client.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Composer from './Composer.svelte';
  import MarkdownRenderer from './MarkdownRenderer.svelte';
  import ToolCard from './ToolCard.svelte';
  import ApprovalCard from './ApprovalCard.svelte';
  import QuestionCard from './QuestionCard.svelte';
  import type { ToolCall, TurnBlock } from '../../types';

  let text = $state('');
  let scrollEl: HTMLElement | null = $state(null);

  $effect(() => {
    void client.turns().length;
    void client.turns().at(-1)?.blocks?.length;
    if (scrollEl) requestAnimationFrame(() => { if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight; });
  });

  async function submit(attachments?: { fileId: string; kind: 'image' | 'video' }[]) {
    const t = text.trim();
    if (!t && !attachments?.length) return;
    text = '';
    try { await client.client.sendPrompt(t || ' ', attachments); } catch { text = t; }
  }
  async function abort() { await client.client.abortCurrentPrompt(); }

  const running = $derived(client.activity() === 'running');
  const approval = $derived(client.pendingApprovals()[0]);
  const question = $derived(client.questions()[0]);

  type RI = { kind: 'thinking'; thinking: string } | { kind: 'text'; text: string } | { kind: 'tool'; tool: ToolCall } | { kind: 'tg'; tools: ToolCall[] };
  function group(blocks: TurnBlock[]): RI[] {
    const r: RI[] = []; let buf: ToolCall[] = [];
    for (const b of blocks) {
      if (b.kind === 'tool') { buf.push(b.tool); continue; }
      if (buf.length) { r.push(buf.length === 1 ? { kind: 'tool', tool: buf[0]! } : { kind: 'tg', tools: [...buf] }); buf = []; }
      if (b.kind === 'thinking') r.push({ kind: 'thinking', thinking: b.thinking });
      else if (b.kind === 'text') r.push({ kind: 'text', text: b.text });
    }
    if (buf.length) r.push(buf.length === 1 ? { kind: 'tool', tool: buf[0]! } : { kind: 'tg', tools: [...buf] });
    return r;
  }
  let expanded = $state<Record<number, boolean>>({});
</script>

<div class="chat">
  <header class="hdr">
    <span class="hdr-title">{client.activeSession()?.title || '新对话'}</span>
    {#if running}<span class="dot-run"></span>{/if}
    <div class="hdr-actions">
      {#if running}<button class="stop-btn" onclick={abort}>停止</button>{/if}
      {#if client.activeSession()}<IconButton name="close" label="归档" size="sm" onclick={() => client.client.archiveSession(client.activeSessionId())} />{/if}
    </div>
  </header>

  <div class="msgs" bind:this={scrollEl}>
    <div class="msgs-inner">
      {#if client.turns().length === 0 && !client.sessionLoading()}
        <div class="welcome">
          <div class="w-logo">◧</div>
          <h1>How can I help?</h1>
          <div class="chips">
            <button class="chip" onclick={() => text = '解释这个项目的目录结构'}>解释项目结构</button>
            <button class="chip" onclick={() => text = '帮我写一个单元测试'}>写单元测试</button>
            <button class="chip" onclick={() => text = '审查最近的代码变更'}>审查代码</button>
            <button class="chip" onclick={() => text = '/'}>命令</button>
          </div>
        </div>
      {:else if client.turns().length === 0}
        <div class="loading"><div class="spinner"></div></div>
      {:else}
        {#each client.turns() as turn (turn.id)}
          {#if turn.role === 'user'}
            <div class="msg user">
              {#if turn.images?.length}<div class="imgs">{#each turn.images as img}<img src={img.url} alt={img.alt ?? ''} />{/each}</div>{/if}
              {#if turn.text}<div class="bubble user-bubble">{turn.text}</div>{/if}
            </div>
          {:else if turn.role === 'compaction'}
            <div class="compact">对话已压缩</div>
          {:else}
            <div class="msg ai">
              {#each group(turn.blocks ?? []) as item, i}
                {#if item.kind === 'thinking'}
                  <details class="think"><summary>思考过程</summary><div class="think-body">{item.thinking}</div></details>
                {:else if item.kind === 'text'}
                  <div class="ai-text"><MarkdownRenderer text={item.text} streaming={running && turn === client.turns().at(-1)} /></div>
                {:else if item.kind === 'tool'}
                  <ToolCard tool={item.tool} />
                {:else if item.kind === 'tg'}
                  <button class="tg-toggle" onclick={() => expanded[i] = !(expanded[i] ?? true)}>{expanded[i] ?? true ? '▾' : '▸'} {item.tools.length} 个工具调用</button>
                  {#if expanded[i] ?? true}{#each item.tools as t}<ToolCard tool={t} />{/each}{/if}
                {/if}
              {/each}
            </div>
          {/if}
        {/each}
        {#if approval}<ApprovalCard request={approval} />{/if}
        {#if question}<QuestionCard question={question} />{/if}
      {/if}
    </div>
  </div>

  <Composer bind:text {running} onsubmit={submit} />
</div>

<style>
  .chat { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

  .hdr { flex: none; height: 42px; display: flex; align-items: center; gap: 8px; padding: 0 16px; border-bottom: 1px solid var(--glass-divider, rgba(255,255,255,0.06)); }
  .hdr-title { font-size: 13px; font-weight: 500; color: var(--color-text, rgba(255,255,255,0.92)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dot-run { width: 6px; height: 6px; border-radius: 50%; background: var(--color-success, #30d158); animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  .hdr-actions { margin-left: auto; display: flex; align-items: center; gap: 4px; }
  .stop-btn { padding: 3px 10px; border-radius: 5px; border: 1px solid var(--color-danger-bd, rgba(255,69,58,0.3)); background: transparent; color: var(--color-danger, #ff453a); font-size: 11px; cursor: pointer; }

  .msgs { flex: 1; overflow-y: auto; }
  .msgs-inner { max-width: 740px; margin: 0 auto; padding: 16px 20px 8px; display: flex; flex-direction: column; gap: 12px; }

  .welcome { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 50px 20px; text-align: center; }
  .w-logo { font-size: 32px; color: var(--color-text-faint); }
  .welcome h1 { font-size: 20px; font-weight: 500; color: var(--color-text); margin: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; max-width: 420px; }
  .chip { padding: 6px 12px; border-radius: 999px; border: 1px solid var(--color-line); background: transparent; color: var(--color-text-muted); font-size: 12px; cursor: pointer; }
  .chip:hover { border-color: var(--color-line-strong); color: var(--color-text); background: var(--color-hover); }

  .msg { display: flex; flex-direction: column; gap: 4px; }
  .msg.user { align-items: flex-end; }
  .bubble { max-width: 80%; padding: 7px 12px; border-radius: 14px 14px 4px 14px; }
  .user-bubble { background: var(--color-surface-raised, rgba(44,44,46,0.8)); color: var(--color-text); }
  .imgs { display: flex; gap: 4px; }
  .imgs img { max-width: 100px; border-radius: 6px; }
  .msg.ai { width: 100%; }
  .ai-text { color: var(--color-text); line-height: 1.6; opacity: 0.9; }
  .think { font-size: 12px; color: var(--color-text-faint); }
  .think summary { cursor: pointer; color: var(--color-text-faint); }
  .think-body { padding: 6px 10px; font-family: var(--font-mono, monospace); white-space: pre-wrap; color: var(--color-text-faint); }
  .tg-toggle { font-size: 11px; color: var(--color-text-faint); cursor: pointer; background: none; border: none; padding: 2px 0; }
  .compact { text-align: center; font-size: 11px; color: var(--color-text-faint); padding: 6px; border-top: 1px solid var(--glass-divider, rgba(255,255,255,0.06)); border-bottom: 1px solid var(--glass-divider, rgba(255,255,255,0.06)); }

  .loading { display: flex; justify-content: center; padding: 30px; }
  .spinner { width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.06); border-top-color: rgba(255,255,255,0.3); border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
