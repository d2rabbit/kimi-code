<!-- McpPanel.svelte — MCP server management panel.
     Lists configured MCP servers (from daemon), shows status, allows restart.
     Configuration is file-driven (POST /config or edit config file). -->
<script lang="ts">
  import { getKimiWebApi } from '../../api';
  import Icon from '../ui/Icon.svelte';

  interface McpServer {
    id: string;
    name: string;
    status: string;
    toolCount?: number;
    transport?: string;
  }

  let servers = $state<McpServer[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let restarting = $state<string | null>(null);

  async function loadServers() {
    loading = true;
    error = null;
    try {
      const api = getKimiWebApi();
      servers = await api.listMcpServers();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function handleRestart(serverId: string) {
    restarting = serverId;
    try {
      const api = getKimiWebApi();
      await api.restartMcpServer(serverId);
      await loadServers();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      restarting = null;
    }
  }

  // Load on mount.
  $effect(() => {
    void loadServers();
  });
</script>

<div class="mcp-panel">
  <div class="mcp-header">
    <div>
      <h3>MCP 服务器</h3>
      <p class="mcp-desc">Model Context Protocol 服务器为 Agent 提供外部工具和数据源。</p>
    </div>
    <button class="refresh-btn" onclick={loadServers} disabled={loading}>
      <Icon name="refresh" size="sm" />
      刷新
    </button>
  </div>

  {#if loading}
    <div class="mcp-loading">
      <div class="spinner"></div>
      <p>加载中…</p>
    </div>
  {:else if error}
    <div class="mcp-error">
      <Icon name="error-warning" size="md" />
      <p>{error}</p>
      <button class="retry-btn" onclick={loadServers}>重试</button>
    </div>
  {:else if servers.length === 0}
    <div class="mcp-empty">
      <Icon name="server" size="lg" />
      <h4>未配置 MCP 服务器</h4>
      <p>MCP 配置通过配置文件管理。编辑 <code>~/.kimi-code/config.toml</code> 中的 <code>[mcp_servers]</code> 段落来添加服务器。</p>
    </div>
  {:else}
    <div class="mcp-list">
      {#each servers as server (server.id)}
        <div class="mcp-card glass-panel">
          <div class="mcp-card-header">
            <div class="mcp-info">
              <div class="mcp-name-row">
                <span class="mcp-status-dot" data-status={server.status}></span>
                <span class="mcp-name">{server.name}</span>
              </div>
              <span class="mcp-id">{server.id}</span>
            </div>
            <button
              class="restart-btn"
              onclick={() => handleRestart(server.id)}
              disabled={restarting === server.id}
            >
              {#if restarting === server.id}
                <div class="mini-spinner"></div>
              {:else}
                <Icon name="refresh" size="sm" />
              {/if}
              重启
            </button>
          </div>
          <div class="mcp-meta">
            {#if server.toolCount !== undefined}
              <span class="meta-chip">{server.toolCount} 个工具</span>
            {/if}
            {#if server.transport}
              <span class="meta-chip">{server.transport}</span>
            {/if}
            <span class="meta-chip status-{server.status}">{server.status}</span>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <div class="mcp-help">
    <Icon name="information" size="sm" />
    <span>MCP 服务器配置在 <code>~/.kimi-code/config.toml</code> 中管理，修改后重启 daemon 生效。</span>
  </div>
</div>

<style>
  .mcp-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .mcp-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .mcp-header h3 {
    font-size: var(--text-base, 14px);
    font-weight: var(--weight-medium, 500);
    margin: 0 0 4px;
  }
  .mcp-desc {
    font-size: var(--text-xs, 12px);
    color: var(--color-text-muted, #999);
    margin: 0;
  }
  .refresh-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--color-line, #2e2e2e);
    background: transparent;
    color: var(--color-text-muted, #999);
    font-size: var(--text-xs, 12px);
    cursor: pointer;
    flex-shrink: 0;
  }
  .refresh-btn:hover {
    color: var(--color-text, #ececec);
    border-color: var(--color-line-strong, #3a3a3a);
  }
  .refresh-btn:disabled {
    opacity: 0.5;
  }

  .mcp-loading,
  .mcp-error,
  .mcp-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px 20px;
    text-align: center;
    color: var(--color-text-muted, #999);
  }
  .mcp-loading p,
  .mcp-empty p {
    font-size: var(--text-sm, 13px);
    max-width: 360px;
    line-height: 1.5;
  }
  .mcp-empty h4 {
    font-size: var(--text-base, 14px);
    color: var(--color-text, #ececec);
    margin: 0;
  }
  .mcp-empty code,
  .mcp-help code {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    background: rgba(255, 255, 255, 0.06);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .mcp-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .mcp-card {
    padding: 12px 14px;
    border-radius: var(--radius-md, 8px);
  }
  .mcp-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .mcp-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }
  .mcp-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mcp-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--color-text-faint, #555);
  }
  .mcp-status-dot[data-status="connected"] {
    background: var(--color-success, #30d158);
  }
  .mcp-status-dot[data-status="error"],
  .mcp-status-dot[data-status="disconnected"] {
    background: var(--color-danger, #ff453a);
  }
  .mcp-name {
    font-size: var(--text-sm, 13px);
    font-weight: var(--weight-medium, 500);
    color: var(--color-text, #ececec);
  }
  .mcp-id {
    font-size: var(--text-xs, 11px);
    font-family: var(--font-mono, monospace);
    color: var(--color-text-faint, #555);
  }

  .restart-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--color-line, #2e2e2e);
    background: transparent;
    color: var(--color-text-muted, #999);
    font-size: var(--text-xs, 12px);
    cursor: pointer;
    flex-shrink: 0;
    transition: all var(--duration-fast, 120ms);
  }
  .restart-btn:hover:not(:disabled) {
    color: var(--color-text, #ececec);
    border-color: var(--color-line-strong, #3a3a3a);
    background: var(--color-hover, rgba(255,255,255,0.04));
  }
  .restart-btn:disabled {
    opacity: 0.5;
  }

  .mcp-meta {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .meta-chip {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: var(--radius-full, 999px);
    background: rgba(255, 255, 255, 0.05);
    color: var(--color-text-muted, #999);
    font-family: var(--font-mono, monospace);
  }
  .meta-chip.status-connected {
    color: var(--color-success, #30d158);
  }
  .meta-chip.status-error {
    color: var(--color-danger, #ff453a);
  }

  .mcp-help {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--radius-sm, 6px);
    background: rgba(255, 255, 255, 0.03);
    color: var(--color-text-muted, #999);
    font-size: var(--text-xs, 12px);
    line-height: 1.5;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-top-color: var(--color-text, #ececec);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  .mini-spinner {
    width: 12px;
    height: 12px;
    border: 1.5px solid rgba(255, 255, 255, 0.1);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
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
</style>
