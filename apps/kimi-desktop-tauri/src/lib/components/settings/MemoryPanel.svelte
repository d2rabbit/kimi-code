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
  <!-- Section 1: Context Usage -->
  <section class="memory-section">
    <h3>上下文使用</h3>
    {#if usage}
      {@const pct = usage.contextLimit > 0 ? Math.min(100, (usage.contextTokens / usage.contextLimit) * 100) : 0}
      <div class="usage-card glass-panel">
        <div class="usage-bar-row">
          <div class="usage-bar-track">
            <div class="usage-bar-fill" style="width: {pct}%" class:warning={pct >= 80}></div>
          </div>
          <span class="usage-pct" class:warning={pct >= 80}>{pct.toFixed(0)}%</span>
        </div>
        <div class="usage-details">
          <div class="usage-stat">
            <span class="stat-label">上下文 Token</span>
            <span class="stat-value mono">{kFmt(usage.contextTokens)} / {kFmt(usage.contextLimit)}</span>
          </div>
          <div class="usage-stat">
            <span class="stat-label">输入 Token</span>
            <span class="stat-value mono">{kFmt(usage.inputTokens)}</span>
          </div>
          <div class="usage-stat">
            <span class="stat-label">输出 Token</span>
            <span class="stat-value mono">{kFmt(usage.outputTokens)}</span>
          </div>
          {#if usage.totalCostUsd > 0}
            <div class="usage-stat">
              <span class="stat-label">累计费用</span>
              <span class="stat-value mono">${usage.totalCostUsd.toFixed(4)}</span>
            </div>
          {/if}
          <div class="usage-stat">
            <span class="stat-label">模型</span>
            <span class="stat-value mono">{sessionStatus || '默认'}</span>
          </div>
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

  /* Usage card */
  .usage-card {
    padding: 14px 16px;
    border-radius: var(--radius-md, 8px);
  }
  .usage-bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
  }
  .usage-bar-track {
    flex: 1;
    height: 6px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-full, 999px);
    overflow: hidden;
  }
  .usage-bar-fill {
    height: 100%;
    background: var(--color-text-muted, #999);
    border-radius: var(--radius-full, 999px);
    transition: width 0.3s ease, background 0.2s ease;
  }
  .usage-bar-fill.warning {
    background: var(--color-warning, #d29922);
  }
  .usage-pct {
    font-size: var(--text-sm, 13px);
    font-weight: var(--weight-medium, 500);
    color: var(--color-text-muted, #999);
    min-width: 36px;
    text-align: right;
  }
  .usage-pct.warning {
    color: var(--color-warning, #d29922);
  }
  .usage-details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 16px;
  }
  .usage-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .stat-label {
    font-size: var(--text-xs, 11px);
    color: var(--color-text-faint, #555);
  }
  .stat-value {
    font-size: var(--text-sm, 13px);
    color: var(--color-text, #ececec);
  }
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
    transition: all var(--duration-fast, 120ms);
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
    animation: spin 0.8s linear infinite;
  }
  .mini-spinner {
    width: 12px;
    height: 12px;
    border: 1.5px solid rgba(255,255,255,0.1);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    display: inline-block;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
