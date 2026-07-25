<!-- McpPanel.svelte — MCP server management panel.
     Lists configured MCP servers (from daemon), shows status, allows restart.
     Configuration is file-driven (POST /config or edit config file). -->
<script lang="ts">
  import { getKimiWebApi } from '../../api';
  import { invoke as tauriInvoke } from '@tauri-apps/api/core';
  import Icon from '../ui/Icon.svelte';
  import Button from '../ui/Button.svelte';
  import Card from '../ui/Card.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Input from '../ui/Input.svelte';
  import Select from '../ui/Select.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import Textarea from '../ui/Textarea.svelte';

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

  // Add/Edit form state
  let showForm = $state(false);
  let editingId = $state<string | null>(null);
  let formData = $state({
    name: '',
    command: '',
    args: '',
    env: '',
    cwd: '',
    transport: 'stdio' as string,
    url: '',
    headers: '',
  });
  let configPath = '';

  async function getConfigPath(): Promise<string> {
    if (configPath) return configPath;
    try {
      const home = await tauriInvoke<string>('get_kimi_home');
      configPath = `${home}/config.toml`;
    } catch {
      configPath = '~/.kimi-code/config.toml';
    }
    return configPath;
  }

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

  function openAddForm() {
    editingId = null;
    formData = { name: '', command: '', args: '', env: '', cwd: '', transport: 'stdio', url: '', headers: '' };
    showForm = true;
  }

  async function saveMcpServer() {
    const path = await getConfigPath();
    let config = '';
    try {
      config = await tauriInvoke<string>('read_text_file', { path });
    } catch { config = ''; }

    const serverName = formData.name.trim();
    if (!serverName) return;

    // Build TOML snippet for this server
    let snippet = `\n[mcp_servers.${serverName}]\n`;
    if (formData.transport === 'stdio') {
      snippet += `command = "${formData.command.trim()}"\n`;
      if (formData.args.trim()) {
        const argList = formData.args.split(/\s+/).filter(Boolean);
        snippet += `args = [${argList.map(a => `"${a}"`).join(', ')}]\n`;
      }
      if (formData.env.trim()) {
        snippet += `[mcp_servers.${serverName}.env]\n`;
        for (const line of formData.env.split('\n')) {
          const [k, v] = line.split('=').map(s => s.trim());
          if (k && v) snippet += `${k} = "${v}"\n`;
        }
      }
      if (formData.cwd.trim()) snippet += `cwd = "${formData.cwd.trim()}"\n`;
    } else {
      snippet += `url = "${formData.url.trim()}"\n`;
      if (formData.headers.trim()) {
        snippet += `[mcp_servers.${serverName}.headers]\n`;
        for (const line of formData.headers.split('\n')) {
          const [k, v] = line.split('=').map(s => s.trim());
          if (k && v) snippet += `${k} = "${v}"\n`;
        }
      }
    }

    // Remove existing entry if editing
    if (editingId) {
      const regex = new RegExp(`\\n\\[mcp_servers\\.${editingId}\\][\\s\\S]*?(?=\\n\\[|$)`, 'g');
      config = config.replace(regex, '');
    }

    // Append new entry
    config += snippet;

    try {
      await tauriInvoke('write_text_file', { path, content: config });
      showForm = false;
      // Restart the server to apply
      try {
        const api = getKimiWebApi();
        await api.restartMcpServer(serverName);
      } catch {}
      await loadServers();
    } catch (e) {
      error = `写入配置失败: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function deleteMcpServer(serverName: string) {
    const path = await getConfigPath();
    let config = '';
    try {
      config = await tauriInvoke<string>('read_text_file', { path });
    } catch { return; }

    // Remove the server block
    const regex = new RegExp(`\\n\\[mcp_servers\\.${serverName}\\][\\s\\S]*?(?=\\n\\[|$)`, 'g');
    config = config.replace(regex, '');

    try {
      await tauriInvoke('write_text_file', { path, content: config });
      await loadServers();
    } catch (e) {
      error = `删除失败: ${e instanceof Error ? e.message : String(e)}`;
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
    <div style="display: flex; gap: 6px;">
      <Button size="sm" icon="refresh" onclick={loadServers} disabled={loading}>刷新</Button>
      <Button size="sm" variant="primary" icon="plus" onclick={openAddForm}>添加</Button>
    </div>
  </div>

  {#if showForm}
    <div class="mcp-form">
      <div class="form-row">
        <label>名称
          <Input bind:value={formData.name} placeholder="my-server" size="sm" />
        </label>
      </div>
      <div class="form-row">
        <label>传输方式
          <Select
            bind:value={formData.transport}
            options={[
              { value: 'stdio', label: 'stdio (本地进程)' },
              { value: 'http', label: 'http (远程 API)' },
              { value: 'sse', label: 'sse (Server-Sent Events)' },
            ]}
          />
        </label>
      </div>
      {#if formData.transport === 'stdio'}
        <div class="form-row">
          <label>命令
            <Input bind:value={formData.command} placeholder="npx" size="sm" />
          </label>
        </div>
        <div class="form-row">
          <label>参数 (空格分隔)
            <Input bind:value={formData.args} placeholder="@modelcontextprotocol/server-filesystem /tmp" size="sm" />
          </label>
        </div>
        <div class="form-row">
          <label>环境变量 (每行 KEY=VALUE)
            <Textarea bind:value={formData.env} rows={2} placeholder="API_KEY=xxx" />
          </label>
        </div>
        <div class="form-row">
          <label>工作目录 (可选)
            <Input bind:value={formData.cwd} placeholder="/home/user" size="sm" />
          </label>
        </div>
      {:else}
        <div class="form-row">
          <label>URL
            <Input bind:value={formData.url} placeholder="https://api.example.com/mcp" size="sm" />
          </label>
        </div>
        <div class="form-row">
          <label>Headers (每行 KEY=VALUE)
            <Textarea bind:value={formData.headers} rows={2} placeholder="Authorization=Bearer xxx" />
          </label>
        </div>
      {/if}
      <div class="form-actions">
        <Button size="sm" variant="ghost" onclick={() => showForm = false}>取消</Button>
        <Button size="sm" variant="primary" onclick={saveMcpServer}>保存并重启</Button>
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="mcp-loading">
      <Spinner size="lg" />
      <p>加载中…</p>
    </div>
  {:else if error}
    <div class="mcp-error">
      <Icon name="error-warning" size="md" />
      <p>{error}</p>
      <Button size="sm" onclick={loadServers}>重试</Button>
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
        <Card variant="raised" padding="none">
          <div class="mcp-card">
          <div class="mcp-card-header">
            <div class="mcp-info">
              <div class="mcp-name-row">
                <span class="mcp-status-dot" data-status={server.status}></span>
                <span class="mcp-name">{server.name}</span>
              </div>
              <span class="mcp-id">{server.id}</span>
            </div>
            <div style="display: flex; gap: 4px;">
              <Button
                size="sm"
                onclick={() => handleRestart(server.id)}
                disabled={restarting === server.id}
              >
                {#if restarting === server.id}
                  <Spinner size="sm" />
                {:else}
                  <Icon name="refresh" size="sm" />
                {/if}
                重启
              </Button>
              <IconButton
                name="close"
                label="删除"
                size="sm"
                onclick={() => { if (confirm(`删除 ${server.name}?`)) deleteMcpServer(server.name); }}
              />
            </div>
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
        </Card>
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

  .mcp-meta {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .meta-chip {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: var(--g-radius-chip, 999px);
    background: var(--mat-chip-bg, rgba(255, 255, 255, 0.05));
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
    border-radius: var(--g-radius-card, 6px);
    background: var(--mat-surface-1, rgba(255, 255, 255, 0.03));
    color: var(--color-text-muted, #999);
    font-size: var(--text-xs, 12px);
    line-height: 1.5;
  }

  .mcp-form {
    background: var(--mat-surface-1, rgba(255,255,255,0.03));
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, rgba(255,255,255,0.06));
    border-radius: var(--g-radius-card, 10px);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .mcp-form .form-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .mcp-form label {
    font-size: 11px;
    color: var(--color-text-faint);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
