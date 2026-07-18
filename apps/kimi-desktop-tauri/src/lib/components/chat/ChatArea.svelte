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
    {#if running}<span class="chip-run"><span class="dot-run"></span>运行中</span>{/if}
    <div class="hdr-actions">
      {#if running}<button class="stop-btn" onclick={abort}>停止</button>{/if}
      {#if client.activeSession()}<IconButton name="close" label="归档" size="sm" onclick={() => client.client.archiveSession(client.activeSessionId())} />{/if}
    </div>
  </header>

  <div class="msgs" bind:this={scrollEl}>
    <div class="msgs-inner">
      {#if client.turns().length === 0 && !client.sessionLoading()}
        <div class="welcome">
          <div class="w-logo"><span class="w-mark">K</span></div>
          <h1>有什么可以帮你？</h1>
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
            <div class="msg">
              <span class="avatar u">你</span>
              <div class="body">
                {#if turn.images?.length}<div class="imgs">{#each turn.images as img}<img src={img.url} alt={img.alt ?? ''} />{/each}</div>{/if}
                {#if turn.text}<div class="u-text">{turn.text}</div>{/if}
              </div>
            </div>
          {:else if turn.role === 'compaction'}
            <div class="compact">对话已压缩</div>
          {:else}
            <div class="msg">
              <span class="avatar a">K</span>
              <div class="body">
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

  .hdr { flex: none; height: 46px; display: flex; align-items: center; gap: 10px; padding: 0 20px; border-bottom: 1px solid var(--bd); }
  .hdr-title { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip-run { display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; padding: 2px 8px; font-size: 10.5px; font-weight: 600; background: var(--ok-soft); color: var(--ok); }
  .dot-run { width: 5px; height: 5px; border-radius: 50%; background: var(--ok); animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  .hdr-actions { margin-left: auto; display: flex; align-items: center; gap: 4px; }
  .stop-btn { padding: 3px 10px; border-radius: var(--r-sm); border: 1px solid var(--color-danger-bd); background: transparent; color: var(--err); font-size: 11px; cursor: pointer; }
  .stop-btn:hover { background: var(--err-soft); }

  .msgs { flex: 1; overflow-y: auto; }
  .msgs-inner { max-width: 760px; margin: 0 auto; padding: 20px 22px 8px; display: flex; flex-direction: column; gap: 18px; }

  .welcome { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 56px 20px; text-align: center; }
  .w-logo .w-mark { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #4fa8ff, #5bc0be); color: #fff; font-size: 19px; font-weight: 800; box-shadow: 0 0 24px rgba(79, 168, 255, 0.35); }
  .welcome h1 { font-size: 18px; font-weight: 600; color: var(--tx); margin: 0; letter-spacing: -0.01em; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; max-width: 420px; }
  .chip { padding: 6px 12px; border-radius: 999px; border: 1px solid var(--bd2); background: transparent; color: var(--tx2); font-size: 12px; cursor: pointer; transition: border-color var(--duration-fast) var(--ease), background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease); }
  .chip:hover { border-color: var(--ac); color: var(--ac); background: var(--ac-soft); }

  .msg { display: flex; gap: 10px; font-size: 13px; line-height: 1.65; }
  .msg .body { flex: 1; min-width: 0; }
  .avatar { width: 22px; height: 22px; border-radius: var(--r-sm); flex: none; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; }
  .avatar.u { background: var(--amb-soft); color: var(--amb); }
  .avatar.a { background: linear-gradient(135deg, #4fa8ff, #5bc0be); color: #fff; }
  .u-text { color: var(--tx); }
  .imgs { display: flex; gap: 4px; margin-bottom: 4px; }
  .imgs img { max-width: 100px; border-radius: 6px; }
  .ai-text { color: var(--tx); line-height: 1.65; }
  .think { font-size: 12px; color: var(--tx3); }
  .think summary { cursor: pointer; color: var(--tx3); }
  .think-body { padding: 6px 10px; font-family: var(--font-mono); white-space: pre-wrap; color: var(--tx3); }
  .tg-toggle { font-size: 11px; color: var(--tx3); cursor: pointer; background: none; border: none; padding: 2px 0; }
  .tg-toggle:hover { color: var(--tx2); }
  .compact { text-align: center; font-size: 11px; color: var(--tx3); padding: 6px; border-top: 1px solid var(--bd); border-bottom: 1px solid var(--bd); }

  .loading { display: flex; justify-content: center; padding: 30px; }
  .spinner { width: 20px; height: 20px; border: 2px solid var(--bd); border-top-color: var(--ac); border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
