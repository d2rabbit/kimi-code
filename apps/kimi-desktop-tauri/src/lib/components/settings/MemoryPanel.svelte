<!-- MemoryPanel.svelte — 记忆管理面板.
     1) View/edit AGENTS.md (project memory instructions)
     2) Trigger conversation compaction
     3) View context token usage details -->
<script lang="ts">
  import * as client from '../../stores/client.svelte';
  import { getKimiWebApi } from '../../api';
  import { invoke as tauriInvoke } from '@tauri-apps/api/core';
  import Icon from '../ui/Icon.svelte';

  const isTauri = '__TAURI_INTERNALS__' in globalThis;

  // --- AGENTS.md editing ---
  let agentsContent = $state('');
  let agentsPath = $state('');
  let agentsLoading = $state(true);
  let agentsError = $state<string | null>(null);
  let agentsDirty = $state(false);
  let agentsSaving = $state(false);

  async function loadAgentsMd() {
    agentsLoading = true;
    agentsError = null;
    const sid = client.activeSessionId();
    const session = client.sessions().find((s) => s.id === sid);
    if (!session?.cwd) {
      // Try to find any session with a cwd
      const anySession = client.sessions().find((s) => s.cwd);
      if (!anySession) {
        agentsError = '没有活跃会话，无法确定 AGENTS.md 路径';
        agentsLoading = false;
        return;
      }
    }
    const cwd = session?.cwd || client.sessions().find((s) => s.cwd)?.cwd || '';
    if (!cwd) {
      agentsError = '当前会话没有工作目录';
      agentsLoading = false;
      return;
    }
    agentsPath = cwd.endsWith('/') ? cwd + 'AGENTS.md' : cwd + '/AGENTS.md';

    try {
      if (isTauri) {
        agentsContent = await tauriInvoke<string>('read_text_file', { path: agentsPath });
      } else {
        // Browser dev mode: use daemon fs:read
        if (!sid) {
          agentsError = '没有活跃会话';
          agentsLoading = false;
          return;
        }
        const api = getKimiWebApi();
        const result = await api.readFile(sid, { path: 'AGENTS.md' });
        agentsContent = result.content;
      }
      agentsDirty = false;
    } catch (e) {
      agentsContent = '';
      agentsError = e instanceof Error ? e.message : String(e);
    } finally {
      agentsLoading = false;
    }
  }

  async function saveAgentsMd() {
    agentsSaving = true;
    try {
      if (isTauri) {
        await tauriInvoke('write_text_file', { path: agentsPath, content: agentsContent });
      } else {
        // Browser mode: can't write via daemon (no fs:write). Show notice.
        agentsError = '浏览器模式不支持写入文件。请在 Tauri 桌面应用中使用此功能。';
        agentsSaving = false;
        return;
      }
      agentsDirty = false;
    } catch (e) {
      agentsError = e instanceof Error ? e.message : String(e);
    } finally {
      agentsSaving = false;
    }
  }

  function onContentChange() {
    agentsDirty = true;
  }

  // --- Context usage ---
  const usage = $derived(client.activeSessionUsage());
  const sessionStatus = $derived(client.activeSessionModel());

  // --- Compaction ---
  let compacting = $state(false);
  let compactMsg = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleCompact() {
    const sid = client.activeSessionId();
    if (!sid) return;
    compacting = true;
    compactMsg = null;
    try {
      await client.client.compact();
      compactMsg = { type: 'success', text: '对话压缩已触发，Agent 将在后台处理。' };
    } catch (e) {
      compactMsg = { type: 'error', text: e instanceof Error ? e.message : String(e) };
    } finally {
      compacting = false;
      setTimeout(() => { compactMsg = null; }, 5000);
    }
  }

  function kFmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
    return String(n);
  }

  // Load AGENTS.md when a session is active.
  $effect(() => {
    void client.activeSessionId();
    if (client.activeSessionId()) {
      void loadAgentsMd();
    }
  });
</script>

<div class="memory-panel">
  <!-- Section 1: Context Usage — Bento Grid -->
  <section class="memory-section">
    <h3>上下文使用</h3>
    {#if usage}
      {@const pct = usage.contextLimit > 0 ? Math.min(100, (usage.contextTokens / usage.contextLimit) * 100) : 0}
      {@const total = usage.inputTokens + usage.outputTokens}
      {@const cacheHit = usage.cacheReadTokens + usage.cacheCreationTokens > 0
        ? Math.round((usage.cacheReadTokens / (usage.cacheReadTokens + usage.inputTokens)) * 100)
        : 0}
      <div class="bento-grid">
        <!-- Big cell: context progress ring -->
        <div class="bento-cell bento-lg bento-context">
          <div class="bento-label">上下文窗口</div>
          <div class="bento-ring-wrap">
            <svg class="bento-ring" viewBox="0 0 100 100" style="--pct: {pct}">
              <circle class="ring-bg" cx="50" cy="50" r="42" />
              <circle class="ring-fill" cx="50" cy="50" r="42" class:warning={pct >= 80} />
            </svg>
            <div class="bento-ring-center">
              <span class="ring-num" class:warning={pct >= 80}>{pct.toFixed(0)}<small>%</small></span>
              <span class="ring-sub">{kFmt(usage.contextTokens)} / {kFmt(usage.contextLimit)}</span>
            </div>
          </div>
        </div>

        <!-- Medium cell: total tokens this session -->
        <div class="bento-cell bento-md">
          <div class="bento-label">本轮总计</div>
          <div class="bento-big-num mono">{kFmt(total)}</div>
          <div class="bento-sub">
            <span class="bento-chip in">↓ {kFmt(usage.inputTokens)}</span>
            <span class="bento-chip out">↑ {kFmt(usage.outputTokens)}</span>
          </div>
        </div>

        <!-- Small cell: cache hit rate -->
        {#if cacheHit > 0}
          <div class="bento-cell bento-sm">
            <div class="bento-label">缓存命中</div>
            <div class="bento-big-num mono" style="font-size: 22px;">{cacheHit}%</div>
          </div>
        {/if}

        <!-- Small cell: turn count -->
        <div class="bento-cell bento-sm">
          <div class="bento-label">对话轮数</div>
          <div class="bento-big-num mono" style="font-size: 22px;">{usage.turnCount}</div>
        </div>

        <!-- Medium cell: cost -->
        {#if usage.totalCostUsd > 0}
          <div class="bento-cell bento-md bento-cost">
            <div class="bento-label">累计费用</div>
            <div class="bento-big-num mono" style="color: var(--ok);">${usage.totalCostUsd.toFixed(4)}</div>
            <div class="bento-sub">本次会话</div>
          </div>
        {/if}

        <!-- Wide cell: model + compact button -->
        <div class="bento-cell bento-wide">
          <div class="bento-wide-left">
            <div class="bento-label">当前模型</div>
            <div class="bento-value mono">{sessionStatus || '默认'}</div>
          </div>
          <button class="bento-compact-btn" onclick={handleCompact} disabled={compacting} type="button">
            {compacting ? '压缩中…' : '⧉ 压缩对话'}
          </button>
        </div>
      </div>
    {:else}
      <div class="memory-empty">
        <Icon name="information" size="md" />
        <p>选择一个会话查看上下文使用详情</p>
      </div>
    {/if}
  </section>

  <!-- Section 2: Conversation Compaction -->
  <section class="memory-section">
    <h3>对话压缩</h3>
    <div class="compact-card glass-panel">
      <div class="compact-info">
        <p>压缩会将当前对话历史总结为一条摘要消息，释放上下文窗口空间。</p>
        <p class="compact-hint">适合在上下文使用率超过 80% 时执行。</p>
      </div>
      <button
        class="compact-action-btn"
        onclick={handleCompact}
        disabled={compacting || !client.activeSessionId()}
      >
        {#if compacting}
          <div class="mini-spinner"></div> 压缩中…
        {:else}
          <Icon name="contract" size="sm" /> 压缩对话
        {/if}
      </button>
      {#if compactMsg}
        <div class="compact-msg" class:error={compactMsg.type === 'error'}>
          {compactMsg.text}
        </div>
      {/if}
    </div>
  </section>

  <!-- Section 3: AGENTS.md Editor -->
  <section class="memory-section">
    <div class="agents-header">
      <h3>项目记忆 (AGENTS.md)</h3>
      {#if agentsDirty && !agentsSaving}
        <span class="dirty-badge">未保存</span>
      {/if}
      <button class="agents-save-btn" onclick={saveAgentsMd} disabled={!agentsDirty || agentsSaving || !isTauri}>
        {#if agentsSaving}<div class="mini-spinner"></div>{/if}
        保存
      </button>
    </div>
    <p class="agents-path mono" title={agentsPath}>{agentsPath || '未确定路径'}</p>

    {#if agentsLoading}
      <div class="agents-loading"><div class="spinner"></div><p>加载 AGENTS.md…</p></div>
    {:else if agentsError && !agentsContent}
      <div class="agents-error">
        <Icon name="error-warning" size="md" />
        <p>{agentsError}</p>
        <button class="retry-btn" onclick={loadAgentsMd}>重试</button>
      </div>
    {:else}
      <textarea
        class="agents-editor"
        bind:value={agentsContent}
        oninput={onContentChange}
        spellcheck="false"
        placeholder="# AGENTS.md — Agent 指南文件&#10;&#10;在此编写项目特定的 Agent 指令、代码规范、架构说明等。"
      ></textarea>
      {#if !isTauri}
        <p class="browser-notice">
          <Icon name="information" size="sm" />
          浏览器模式下为只读。请在桌面应用中编辑保存。
        </p>
      {/if}
    {/if}
  </section>
</div>

<style>
  .memory-panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .memory-section h3 {
    font-size: var(--text-base, 14px);
    font-weight: var(--weight-medium, 500);
    margin: 0 0 8px;
  }

  /* Bento Grid — usage stats dashboard */
  .bento-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-auto-rows: minmax(80px, auto);
    gap: 10px;
  }
  .bento-cell {
    border-radius: var(--r-lg, 14px);
    border: 1px solid var(--bd, rgba(255,255,255,0.06));
    background: var(--l2);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    position: relative;
    overflow: hidden;
    transition: border-color var(--duration-fast, 120ms) var(--ease, ease),
                transform var(--duration-fast, 120ms) var(--ease, ease);
  }
  .bento-cell:hover {
    border-color: var(--bd2);
    transform: translateY(-1px);
  }
  /* Cell sizes — bento asymmetry */
  .bento-lg { grid-column: span 2; grid-row: span 2; }
  .bento-md { grid-column: span 2; }
  .bento-sm { grid-column: span 1; }
  .bento-wide { grid-column: span 4; flex-direction: row; align-items: center; justify-content: space-between; }

  .bento-label {
    font-size: 10.5px;
    color: var(--tx3);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .bento-big-num {
    font-size: 28px;
    font-weight: 700;
    color: var(--tx);
    line-height: 1.2;
  }
  .ring-num small {
    font-size: 14px;
    font-weight: 500;
    opacity: 0.6;
  }
  .bento-sub {
    font-size: 11px;
    color: var(--tx3);
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .bento-chip {
    padding: 1px 7px;
    border-radius: 999px;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 600;
  }
  .bento-chip.in { background: var(--ac-soft); color: var(--ac); }
  .bento-chip.out { background: var(--ok-soft); color: var(--ok); }
  .bento-value {
    font-size: 13px;
    color: var(--tx);
    font-weight: 500;
  }
  .bento-wide-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* Context ring (SVG progress) */
  .bento-context {
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--ac-soft), transparent 70%);
  }
  .bento-ring-wrap {
    position: relative;
    width: 120px;
    height: 120px;
    margin: 4px auto;
  }
  .bento-ring {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  .ring-bg {
    fill: none;
    stroke: var(--bd2);
    stroke-width: 8;
  }
  .ring-fill {
    fill: none;
    stroke: var(--ac);
    stroke-width: 8;
    stroke-linecap: round;
    stroke-dasharray: 264; /* 2 * PI * 42 */
    stroke-dashoffset: calc(264 - 264 * var(--pct, 0) / 100);
    transition: stroke-dashoffset 0.6s var(--ease, ease), stroke 0.3s var(--ease, ease);
  }
  .ring-fill.warning { stroke: var(--warn); }
  .bento-ring-center {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
  }
  .ring-num {
    font-size: 28px;
    font-weight: 800;
    color: var(--tx);
    line-height: 1;
  }
  .ring-num.warning { color: var(--warn); }
  .ring-sub {
    display: block;
    font-size: 10px;
    font-family: var(--font-mono, monospace);
    color: var(--tx3);
    margin-top: 4px;
  }

  /* Compact button in wide cell */
  .bento-compact-btn {
    padding: 6px 14px;
    border-radius: var(--r-md);
    border: 1px solid var(--ac-bd);
    background: var(--ac-soft);
    color: var(--ac);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 120ms) var(--ease, ease);
    white-space: nowrap;
  }
  .bento-compact-btn:hover:not(:disabled) {
    background: var(--ac);
    color: var(--color-text-on-accent, #fff);
  }
  .bento-compact-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .mono {
    font-family: var(--font-mono, monospace);
  }

  /* Compaction card */
  .compact-card {
    padding: 14px 16px;
    border-radius: var(--radius-md, 8px);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .compact-info p {
    font-size: var(--text-sm, 13px);
    color: var(--color-text-muted, #999);
    margin: 0;
    line-height: 1.5;
  }
  .compact-hint {
    color: var(--color-text-faint, #555) !important;
    font-size: var(--text-xs, 12px) !important;
  }
  .compact-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--color-line, #2e2e2e);
    background: transparent;
    color: var(--color-text, #ececec);
    font-size: var(--text-sm, 13px);
    cursor: pointer;
    align-self: flex-start;
    transition: background var(--duration-fast, 120ms) var(--ease), color var(--duration-fast, 120ms) var(--ease);
  }
  .compact-action-btn:hover:not(:disabled) {
    border-color: var(--color-line-strong, #3a3a3a);
    background: var(--color-hover, rgba(255,255,255,0.04));
  }
  .compact-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .compact-msg {
    font-size: var(--text-xs, 12px);
    padding: 6px 10px;
    border-radius: var(--radius-sm, 6px);
    background: rgba(63, 185, 80, 0.1);
    color: var(--color-success, #30d158);
  }
  .compact-msg.error {
    background: rgba(248, 81, 73, 0.1);
    color: var(--color-danger, #ff453a);
  }

  /* AGENTS.md editor */
  .agents-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .agents-header h3 {
    margin: 0;
  }
  .dirty-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-full, 999px);
    background: var(--color-warning, #d29922);
    color: #000;
    font-weight: 600;
  }
  .agents-save-btn {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--color-line, #2e2e2e);
    background: transparent;
    color: var(--color-text, #ececec);
    font-size: var(--text-xs, 12px);
    cursor: pointer;
  }
  .agents-save-btn:hover:not(:disabled) {
    background: var(--color-hover, rgba(255,255,255,0.04));
  }
  .agents-save-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .agents-path {
    font-size: 10px;
    color: var(--color-text-faint, #444);
    margin: 0 0 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .agents-editor {
    width: 100%;
    min-height: 240px;
    padding: 12px 14px;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--color-line, #2e2e2e);
    background: var(--color-surface-sunken, #161616);
    color: var(--color-text, #ececec);
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs, 12px);
    line-height: 1.6;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
  }
  .agents-editor:focus {
    border-color: var(--color-line-strong, #3a3a3a);
  }
  .browser-notice {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-xs, 12px);
    color: var(--color-text-faint, #555);
    margin: 6px 0 0;
  }

  .agents-loading,
  .agents-error,
  .memory-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 30px 20px;
    color: var(--color-text-muted, #999);
    font-size: var(--text-sm, 13px);
  }
  .retry-btn {
    padding: 6px 14px;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--color-line, #2e2e2e);
    background: transparent;
    color: var(--color-text, #ececec);
    font-size: var(--text-sm, 13px);
    cursor: pointer;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(255,255,255,0.1);
    border-top-color: var(--color-text, #ececec);
    border-radius: 50%;
    animation: kimi-spin var(--duration-spin, 0.8s) linear infinite;
  }
  .mini-spinner {
    width: 12px;
    height: 12px;
    border: 1.5px solid rgba(255,255,255,0.1);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: kimi-spin var(--duration-spin, 0.8s) linear infinite;
    display: inline-block;
  }

  /* Responsive: narrow panels collapse to 2 columns */
  @media (max-width: 520px) {
    .bento-grid { grid-template-columns: repeat(2, 1fr); }
    .bento-lg { grid-column: span 2; grid-row: span 1; }
    .bento-md { grid-column: span 2; }
    .bento-wide { grid-column: span 2; flex-direction: column; align-items: flex-start; gap: 8px; }
    .bento-ring-wrap { width: 90px; height: 90px; }
  }
</style>
