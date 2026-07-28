<!-- ChatArea.svelte — clean chat view: header + messages + composer. -->
<script lang="ts">
  import * as client from '../../stores/client.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import Composer from './Composer.svelte';
  import MarkdownRenderer from './MarkdownRenderer.svelte';
  import ThinkCard from './ThinkCard.svelte';
  import ToolCard from './ToolCard.svelte';
  import ApprovalCard from './ApprovalCard.svelte';
  import QuestionCard from './QuestionCard.svelte';
  import GoalStrip from './GoalStrip.svelte';
  import ConversationToc, { type TocItem } from './ConversationToc.svelte';
  import { tryDispatchSlash } from '../../lib/dispatchSlash';
  import { toast } from '../../stores/toast.svelte';
  import type { ToolCall, TurnBlock } from '../../types';
  import { getKimiWebApi } from '../../api';
  import type { AppSessionWarning } from '../../api/types';

  let text = $state('');
  let scrollEl: HTMLElement | null = $state(null);
  let stickToBottom = $state(true);

  // Composer prefill intents (e.g. 子智能体 委派入口) — apply and clear.
  $effect(() => {
    if (client.pendingComposerPrefill() !== null) {
      const v = client.client.consumeComposerPrefill();
      if (v) text = v;
    }
  });

  // ---- Session warnings (server: oversized AGENTS.md, secondary-model issues) ----
  let sessionWarnings = $state<AppSessionWarning[]>([]);
  let dismissedWarnings = $state<string[]>([]);

  $effect(() => {
    const sid = client.activeSessionId();
    sessionWarnings = [];
    dismissedWarnings = [];
    if (!sid) return;
    getKimiWebApi()
      .getSessionWarnings(sid)
      .then((w) => { sessionWarnings = w; })
      .catch(() => { /* warnings are best-effort */ });
  });

  const visibleWarnings = $derived(
    sessionWarnings.filter((w) => !dismissedWarnings.includes(w.code)),
  );

  // Track whether the user is scrolled to the bottom. If they scrolled up
  // to read history, don't yank them back down on every new delta — only
  // auto-scroll when they're already at (or near) the bottom.
  function onScroll() {
    if (!scrollEl) return;
    const threshold = 80; // px from bottom considered "at bottom"
    stickToBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < threshold;
  }

  $effect(() => {
    void client.turns().length;
    void client.turns().at(-1)?.blocks?.length;
    if (scrollEl && stickToBottom) {
      requestAnimationFrame(() => { if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight; });
    }
  });

  // ---- Conversation TOC (one entry per user turn) ----
  const tocItems = $derived<TocItem[]>(
    client
      .turns()
      .filter((t) => t.role === 'user')
      .map((t, i) => ({
        id: t.id,
        no: i + 1,
        title: tocTitle(t.text),
      })),
  );

  function tocTitle(raw: string): string {
    const text = (raw ?? '').trim().replace(/\s+/g, ' ');
    return text.length > 0 ? text : '对话';
  }

  // Track the user turn that currently owns the viewport middle.
  let activeTurnId = $state<string | null>(null);
  let tocObserver: IntersectionObserver | null = null;

  function scrollToTurn(turnId: string): void {
    const el = scrollEl?.querySelector(`[data-turn-id="${cssEscape(turnId)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // cssEscape shim — turn ids may contain characters that break attribute
  // selectors. Prefer the native CSS.escape if available.
  function cssEscape(s: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
    return s.replace(/["\\]/g, '\\$&');
  }

  // Rebuild the IntersectionObserver whenever the set of user turns changes.
  $effect(() => {
    // Subscribe to turns so this re-runs when they change.
    const ids = client
      .turns()
      .filter((t) => t.role === 'user')
      .map((t) => t.id);
    if (!scrollEl || ids.length === 0) {
      tocObserver?.disconnect();
      tocObserver = null;
      return;
    }
    tocObserver?.disconnect();
    tocObserver = new IntersectionObserver(
      (entries) => {
        // Pick the topmost user-turn anchor whose intersection ratio is
        // highest near the viewport top — the query "owning" the reading
        // position sits just above center.
        let best: { id: string; ratio: number } | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).dataset.turnId;
          if (!id) continue;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { id, ratio: entry.intersectionRatio };
          }
        }
        if (best) activeTurnId = best.id;
      },
      {
        root: scrollEl,
        // Track the band around the viewport top third — the user message
        // anchored there is the one the reader is currently engaged with.
        rootMargin: '-10% 0px -70% 0px',
        threshold: [0, 0.25, 0.5, 1],
      },
    );
    // Observe after the DOM has settled.
    requestAnimationFrame(() => {
      if (!tocObserver || !scrollEl) return;
      const anchors = scrollEl.querySelectorAll('[data-turn-id]');
      anchors.forEach((a) => tocObserver!.observe(a));
    });
  });

  async function submit(attachments?: { fileId: string; kind: 'image' | 'video' }[]) {
    const t = text.trim();
    if (!t && !attachments?.length) return;
    // Local slash commands (e.g. /clear /new /fork /compact /undo /title ...)
    // are dispatched client-side; only fall through to sendPrompt for normal
    // messages and daemon-side slash commands (/init /goal /export-md ...).
    if (!attachments?.length && await tryDispatchSlash(t)) {
      text = '';
      return;
    }
    text = '';
    try { await client.client.sendPrompt(t || ' ', attachments); } catch { text = t; }
  }
  async function abort() { await client.client.abortCurrentPrompt(); }

  // Export the session diagnostic archive (POST /sessions/{id}/export). As a
  // desktop host we pass `desktop: true` so the server bundles the on-disk
  // desktop app log (`<home>/logs/kimi-code-desktop.log`, skipped if missing).
  let exporting = $state(false);
  async function exportDiagnostics() {
    const id = client.activeSessionId();
    if (!id || exporting) return;
    exporting = true;
    try {
      const blob = await client.client.exportSession(id, { desktop: true });
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${id}.zip`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
      toast.ok('已导出会话诊断包');
    } catch (e) {
      toast.err(`导出失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      exporting = false;
    }
  }

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
      {#if client.activeSession()}<IconButton name="download" label="导出诊断包" size="sm" disabled={exporting} onclick={exportDiagnostics} />{/if}
      {#if client.activeSession()}<IconButton name="close" label="归档" size="sm" onclick={() => client.client.archiveSession(client.activeSessionId())} />{/if}
    </div>
  </header>

  <GoalStrip />

  {#each visibleWarnings as w (w.code)}
    <div class="sess-warn" class:warn-err={w.severity === 'error'} role="alert">
      <span class="sw-text">{w.message}</span>
      <IconButton name="close" label="忽略" size="sm" onclick={() => { dismissedWarnings = [...dismissedWarnings, w.code]; }} />
    </div>
  {/each}

  <div class="msgs" bind:this={scrollEl} onscroll={onScroll}>
    <ConversationToc items={tocItems} activeId={activeTurnId} onselect={scrollToTurn} />
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
        <div class="loading"><Spinner size="md" /></div>
      {:else}
        {#each client.turns() as turn (turn.id)}
          {#if turn.role === 'user'}
            <!-- 用户：右侧气泡（QQ 聊天式）— markdown 渲染支持代码块/列表/链接 -->
            <div class="msg user" id="turn-{turn.id}" data-turn-id={turn.id}>
              <div class="bubble u-bub">
                {#if turn.images?.length}<div class="imgs">{#each turn.images as img}<img src={img.url} alt={img.alt ?? ''} />{/each}</div>{/if}
                {#if turn.skillActivation}
                  <!-- 技能激活卡片（kimi-web 同款，替代裸 "/xxx" 文本） -->
                  <div class="skill-act">
                    <div class="sa-head">
                      <span class="sa-icon">✦</span>
                      <span class="sa-title">已激活技能</span>
                      <span class="sa-name mono">{turn.skillActivation.name}</span>
                    </div>
                    {#if turn.skillActivation.args}<div class="sa-args">{turn.skillActivation.args}</div>{/if}
                  </div>
                {:else if turn.pluginCommand}
                  <!-- 插件命令卡片（替代展开后的插件正文） -->
                  <div class="skill-act">
                    <div class="sa-head">
                      <span class="sa-icon">🧩</span>
                      <span class="sa-name mono">/{turn.pluginCommand.pluginId}:{turn.pluginCommand.commandName}</span>
                    </div>
                    {#if turn.pluginCommand.args}<div class="sa-args">{turn.pluginCommand.args}</div>{/if}
                  </div>
                {:else if turn.text}
                  <div class="u-text">
                    <MarkdownRenderer text={turn.text} streaming={false} />
                  </div>
                {/if}
              </div>
              <span class="avatar u">你</span>
            </div>
          {:else if turn.role === 'compaction'}
            <div class="compact">对话已压缩</div>
          {:else}
            <!-- Agent：左侧气泡（QQ 聊天式，与用户气泡镜像）+ 下方工具卡 -->
            <div class="msg agent">
              <span class="avatar a">K</span>
              <div class="a-col">
                <div class="a-text">
                  {#each group(turn.blocks ?? []) as item}
                    {#if item.kind === 'thinking'}
                      <ThinkCard
                        thinking={item.thinking}
                        streaming={running && turn === client.turns().at(-1)}
                      />
                    {:else if item.kind === 'text'}
                      <div class="bubble a-bub">
                        <div class="ai-text"><MarkdownRenderer text={item.text} streaming={running && turn === client.turns().at(-1)} /></div>
                      </div>
                    {/if}
                  {/each}
                </div>
                {#each group(turn.blocks ?? []) as item, i}
                  {#if item.kind === 'tool'}
                    <ToolCard tool={item.tool} />
                  {:else if item.kind === 'tg'}
                    <button class="tg-toggle" onclick={() => expanded[i] = !(expanded[i] ?? true)} type="button">
                      <span class="tg-chevron">{expanded[i] ?? true ? '▾' : '▸'}</span>
                      <span class="tg-icon">🔧</span>
                      <span class="tg-count">{item.tools.length} 个工具调用</span>
                      <span class="tg-summary">{[...new Set(item.tools.map((t) => t.name))].slice(0, 3).join(' · ')}{item.tools.length > 3 ? ' …' : ''}</span>
                    </button>
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

  {#if client.promptQueue().length > 0}
    <div class="queue-strip" aria-label="排队中的消息">
      <span class="qs-label">排队 {client.promptQueue().length}</span>
      {#each client.promptQueue() as p (p.promptId)}
        <span class="qs-item" title={p.text}>
          <span class="qs-text">{p.text || '(空消息)'}</span>
          <button class="qs-act steer" type="button" title="插入当前轮（steer）" onclick={() => client.client.steerPrompt([p.promptId])}>插入</button>
          <button class="qs-act" type="button" title="取消该排队消息" onclick={() => client.client.abortQueuedPrompt(p.promptId)}>✕</button>
        </span>
      {/each}
    </div>
  {/if}

  <Composer bind:text {running} onsubmit={submit} />
</div>

<style>
  .chat { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

  .hdr { flex: none; height: 46px; display: flex; align-items: center; gap: 10px; padding: 0 20px; border-bottom: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd)); }
  .hdr-title { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip-run { display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; padding: 2px 8px; font-size: 10.5px; font-weight: 600; background: var(--ok-soft); color: var(--ok); }
  .dot-run { width: 5px; height: 5px; border-radius: 50%; background: var(--ok); animation: kimi-pulse 1.5s infinite; }
  .hdr-actions { margin-left: auto; display: flex; align-items: center; gap: 4px; }
  .stop-btn { padding: 3px 10px; border-radius: var(--r-sm); border: 1px solid var(--color-danger-bd); background: transparent; color: var(--err); font-size: 11px; cursor: pointer; }
  .stop-btn:hover { background: var(--err-soft); }

  /* 会话警告 banner（服务端 /sessions/:id/warnings） */
  .sess-warn {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 20px 0;
    padding: 8px 12px;
    border-radius: var(--g-radius-card, 4px);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--color-warning-bd, var(--amb));
    background: var(--color-warning-soft, var(--amb-soft));
    color: var(--tx2);
    font-size: 12px;
  }
  .sess-warn.warn-err {
    border-color: var(--color-danger-bd, var(--err));
    background: var(--color-danger-soft, var(--err-soft));
  }
  .sw-text { flex: 1; min-width: 0; line-height: 1.5; }

  /* 排队 prompt 条（daemon prompt queue + steer） */
  .queue-strip {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 20px;
    overflow-x: auto;
    border-top: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    background: var(--mat-surface-1, var(--l1));
  }
  .qs-label {
    flex: none;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--tx3);
  }
  .qs-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 320px;
    padding: 3px 6px 3px 10px;
    border-radius: var(--g-radius-chip, 999px);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    background: var(--mat-chip-bg, var(--l2));
    box-shadow: var(--elev-chip, none);
    font-size: 11px;
    color: var(--tx2);
  }
  .qs-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .qs-act {
    flex: none;
    border: none;
    background: transparent;
    color: var(--tx3);
    font-size: 10.5px;
    cursor: pointer;
    padding: 1px 4px;
    border-radius: var(--g-radius-control, 4px);
  }
  .qs-act:hover { color: var(--tx); background: var(--color-hover); }
  .qs-act.steer { color: var(--ac); font-weight: 600; }
  .qs-act.steer:hover { background: var(--ac-soft); }

  .msgs { flex: 1; overflow-y: auto; position: relative; }
  .msgs-inner { max-width: 920px; margin: 0 auto; padding: 24px 32px 12px; display: flex; flex-direction: column; gap: 18px; }

  .welcome { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 72px 20px; text-align: center; }
  .w-logo .w-mark { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #4fa8ff, #5bc0be); color: #fff; font-size: 19px; font-weight: 800; box-shadow: 0 0 24px rgba(79, 168, 255, 0.35); }
  .welcome h1 { font-size: 22px; font-weight: 700; color: var(--tx); margin: 0; letter-spacing: -0.02em; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; max-width: 420px; }
  .chip { padding: 7px 14px; border-radius: var(--g-radius-chip, 999px); border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd)); background: var(--mat-chip-bg, var(--l2)); box-shadow: var(--elev-chip, none); color: var(--tx2); font-size: 12px; cursor: pointer; transition: border-color var(--duration-fast) var(--ease), background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease), transform var(--duration-fast) var(--ease); }
  .chip:hover { border-color: var(--ac-bd); color: var(--ac); background: var(--ac-soft); transform: var(--motion-hover-lift, translateY(-1px)); }

  .msg { display: flex; gap: 10px; font-size: 13px; line-height: 1.65; }
  .msg.user { justify-content: flex-end; }
  .avatar { width: 22px; height: 22px; border-radius: var(--r-sm); flex: none; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; margin-top: 2px; }
  .avatar.u { background: var(--amb-soft); color: var(--amb); }
  .avatar.a { background: linear-gradient(135deg, #4fa8ff, #5bc0be); color: #fff; }

  /* ---- QQ 式气泡（M3：契约 token 驱动表面） ---- */
  .bubble { max-width: 88%; padding: 10px 14px; font-size: 13px; line-height: 1.65; }
  .u-bub {
    background: var(--mat-bubble-bg, var(--ac-soft));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--ac-bd));
    color: var(--tx);
    border-radius: var(--g-radius-bubble, 14px 14px 4px 14px);
    box-shadow: var(--elev-bubble, none);
  }
  .a-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  .a-text { display: flex; flex-direction: column; gap: 8px; max-width: 100%; }
  /* Agent 气泡：与用户气泡镜像且色彩分立——用户用 accent 蓝，agent 用 K 头像
     渐变里的青（#5bc0be），QQ 式绿白对比；surface-2 为底调出主题自适应 */
  .a-bub {
    max-width: 92%;
    background: var(--mat-bubble-agent-bg, color-mix(in srgb, #5bc0be 11%, var(--l2)));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--mat-bubble-agent-bd, color-mix(in srgb, #5bc0be 26%, transparent));
    color: var(--tx);
    border-radius: var(--g-radius-bubble-agent, 14px 14px 14px 4px);
    box-shadow: var(--elev-bubble, none);
  }
  .imgs { display: flex; gap: 4px; margin-bottom: 4px; }
  .imgs img { max-width: 100px; border-radius: 6px; }
  .u-text { word-break: break-word; }
  /* Compact markdown inside user bubbles — tighter spacing than agent output */
  .u-text :global(.md-body) { font-size: 12.5px; line-height: 1.55; }
  .u-text :global(.md-body p:last-child) { margin-bottom: 0; }
  .u-text :global(.md-body p) { margin: 0 0 6px; }
  .u-text :global(.md-body ul),
  .u-text :global(.md-body ol) { margin: 0 0 6px; }
  .u-text :global(.md-body .cb-wrap) { margin: 0 0 6px; }

  /* 技能激活 / 插件命令卡片：气泡内的墨色淡染小卡，呼应融合层 */
  .skill-act {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 7px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, currentColor 7%, transparent);
    border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  }
  .sa-head {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    font-weight: 600;
  }
  .sa-icon { font-size: 11px; opacity: 0.85; }
  .sa-title { opacity: 0.75; font-weight: 500; }
  .sa-name {
    padding: 1px 7px;
    border-radius: 6px;
    background: color-mix(in srgb, currentColor 10%, transparent);
    font-size: 11px;
  }
  .mono { font-family: var(--font-mono, monospace); }
  .sa-args {
    padding-left: 18px;
    font-size: 12px;
    line-height: 1.55;
    color: color-mix(in srgb, currentColor 78%, transparent);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* ---- 气泡融合层 ------------------------------------------------------
     气泡内的 markdown 渲染不再引用页面层 token（--l1/--l3/--bd/--ac），
     一律以气泡自身墨色（currentColor）的透明度梯度派生表面与线条，
     使文字/代码/链接/引用/表格在全部 7 套主题下都与气泡浑然一体。 */
  .u-text :global(.md-body),
  .ai-text :global(.md-body) { color: inherit; }

  /* 行内代码：气泡墨色的轻染，而非异色小药丸 */
  .u-text :global(.md-body :not(pre) > code),
  .ai-text :global(.md-body :not(pre) > code) {
    background: color-mix(in srgb, currentColor 10%, transparent);
    border: none;
    color: inherit;
  }

  /* 链接：同色加粗 + 半透明下划线（聊天气泡惯例） */
  .u-text :global(.md-body a),
  .ai-text :global(.md-body a) {
    color: inherit;
    font-weight: 500;
    text-decoration-color: color-mix(in srgb, currentColor 55%, transparent);
  }

  /* 代码块：去卡片化——整块的淡墨染 + 细发丝线，头部不再另起一层 */
  .u-text :global(.md-body .cb-wrap),
  .ai-text :global(.md-body .cb-wrap) {
    background: color-mix(in srgb, currentColor 6%, transparent);
    border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
    border-radius: 10px;
  }
  .u-text :global(.md-body .cb-head),
  .ai-text :global(.md-body .cb-head) {
    border-bottom-color: color-mix(in srgb, currentColor 10%, transparent);
    color: color-mix(in srgb, currentColor 55%, transparent);
  }
  .u-text :global(.md-body .cb-copy),
  .ai-text :global(.md-body .cb-copy),
  .u-text :global(.md-body .cb-preview),
  .ai-text :global(.md-body .cb-preview) {
    color: color-mix(in srgb, currentColor 55%, transparent);
  }
  .u-text :global(.md-body .cb-copy:hover),
  .ai-text :global(.md-body .cb-copy:hover),
  .u-text :global(.md-body .cb-preview:hover),
  .ai-text :global(.md-body .cb-preview:hover) { color: inherit; }
  /* shiki 主题的内联底色必须让位于气泡 */
  .u-text :global(.md-body pre.shiki),
  .ai-text :global(.md-body pre.shiki) {
    background: transparent !important;
    border: none;
    margin: 0;
  }

  /* 引用块：左侧竖线与文字同样取自气泡墨色 */
  .u-text :global(.md-body blockquote),
  .ai-text :global(.md-body blockquote) {
    border-left-color: color-mix(in srgb, currentColor 30%, transparent);
    color: color-mix(in srgb, currentColor 80%, transparent);
  }

  /* 表格与分隔线 */
  .u-text :global(.md-body th),
  .ai-text :global(.md-body th),
  .u-text :global(.md-body td),
  .ai-text :global(.md-body td) { border-color: color-mix(in srgb, currentColor 18%, transparent); }
  .u-text :global(.md-body hr),
  .ai-text :global(.md-body hr) { border-top-color: color-mix(in srgb, currentColor 15%, transparent); }

  .ai-text { color: var(--tx); line-height: 1.65; }
  /* Agent 气泡内的 markdown 节奏：比用户气泡略松，仍保持气泡紧凑感 */
  .ai-text :global(.md-body p:last-child) { margin-bottom: 0; }
  .ai-text :global(.md-body p) { margin: 0 0 8px; }
  .ai-text :global(.md-body ul),
  .ai-text :global(.md-body ol) { margin: 0 0 8px; }
  .ai-text :global(.md-body .cb-wrap) { margin: 0 0 8px; }

  .tg-toggle {
    display: flex; align-items: center; gap: 5px;
    width: fit-content;
    font-size: 11px; color: var(--tx3);
    cursor: pointer;
    background: var(--mat-control-bg, var(--l2));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    border-radius: var(--g-radius-control, var(--r-sm));
    box-shadow: var(--elev-control, none);
    padding: 4px 10px;
    transition: color var(--duration-fast) var(--ease), border-color var(--duration-fast) var(--ease), background var(--duration-fast) var(--ease);
  }
  .tg-toggle:hover {
    color: var(--tx); border-color: var(--bd2); background: var(--mat-control-bg-hover, var(--l3));
  }
  .tg-chevron { font-size: 9px; transition: transform var(--duration-fast) var(--ease); width: 8px; }
  .tg-icon { font-size: 11px; }
  .tg-count { font-weight: 600; color: var(--tx2); }
  .tg-summary {
    color: var(--tx3); font-size: 10px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 280px;
  }
  .compact { text-align: center; font-size: 11px; color: var(--tx3); padding: 6px; border-top: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd)); border-bottom: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd)); }

  .loading { display: flex; justify-content: center; padding: 30px; }
</style>
