<!-- PluginPanel.svelte — 插件管理面板.
     Scans ~/.kimi-code/plugins/installed.json + manifests via Tauri FS commands.
     Shows installed plugins with name, source, trust level, version, description.
     In browser mode, reads from the daemon's config endpoint as a fallback. -->
<script lang="ts">
  import { invoke as tauriInvoke } from '@tauri-apps/api/core';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../../lib/icon-types';
  import { toast } from '../../stores/toast.svelte';

  interface PluginInfo {
    id: string;
    root: string;
    source: string;
    enabled: boolean;
    installedAt: string;
    originalSource: string;
    displayName: string;
    version: string;
    description: string;
    developer: string;
    hasMcp: boolean;
    skillCount: number;
    commandCount: number;
  }

  const isTauri = '__TAURI_INTERNALS__' in globalThis;

  let plugins = $state<PluginInfo[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // ---- Plugin type classification (skill / mcp / kimi / claude) ----
  // The user wants plugins grouped into 4 conceptual buckets. We infer the
  // bucket from the manifest data we already have:
  //   - skill: skillCount > 0 and no MCP
  //   - mcp: hasMcp === true (MCP servers are the primary deliverable)
  //   - kimi: kimi.plugin.json present (CLI-managed, rare in practice)
  //   - claude: detected by CLAUDE.md / .claude/ directory in root
  //
  // The 'kimi' and 'claude' categories are placeholder slots the user
  // asked us to surface but not yet implement install for.
  type PluginType = 'skill' | 'mcp' | 'kimi' | 'claude';

  function pluginType(p: PluginInfo): PluginType {
    if (p.hasMcp) return 'mcp';
    if (p.skillCount > 0) return 'skill';
    // Heuristic: originalSource or source indicates a Claude-Code-style plugin
    const s = (p.originalSource + ' ' + p.source + ' ' + p.id).toLowerCase();
    if (s.includes('claude') || s.includes('anthropic')) return 'claude';
    // Default to 'kimi' (native CLI-managed) when no clear signal
    return 'kimi';
  }

  const TYPE_META: Record<PluginType, { label: string; icon: IconName; color: string; desc: string }> = {
    skill:  { label: 'Skill',  icon: 'sparkles',    color: 'var(--ac)',   desc: '可调用技能包（核心）' },
    mcp:    { label: 'MCP',    icon: 'globe',       color: 'var(--ok)',   desc: 'Model Context Protocol 服务器（核心）' },
    kimi:   { label: 'Kimi',   icon: 'star',        color: 'var(--warn)', desc: 'Kimi 原生插件格式（占位，未实现）' },
    claude: { label: 'Claude', icon: 'code',        color: 'var(--err)',  desc: 'Claude Code 插件格式（占位，未实现）' },
  };

  // Group plugins by type for the 4-bucket UI.
  // Built-in plugins that ship with the desktop app (not installed via CLI).
  // codegraph is bundled as both a skill (auto-index hook) and an MCP server
  // (the codegraph serve --mcp command is auto-configured in McpPanel).
  const BUILTIN_PLUGINS: PluginInfo[] = [
    {
      id: '__builtin_codegraph__',
      root: '',
      source: 'builtin',
      enabled: true,
      installedAt: '',
      originalSource: 'https://github.com/colbymchenry/codegraph',
      displayName: 'CodeGraph',
      version: '内置',
      description: '代码知识图谱索引引擎。已内置激活 — 任务完成时自动同步索引，MCP 服务器自动注册，无需手动配置。',
      developer: 'colbymchenry',
      hasMcp: true,
      skillCount: 1,
      commandCount: 0,
    },
  ];

  const grouped = $derived.by(() => {
    const g: Record<PluginType, PluginInfo[]> = { skill: [], mcp: [], kimi: [], claude: [] };
    // Inject builtins first so they appear at the top of their categories.
    for (const b of BUILTIN_PLUGINS) {
      g[pluginType(b)].push(b);
    }
    for (const p of plugins) {
      g[pluginType(p)].push(p);
    }
    return g;
  });

  async function loadPlugins() {
    loading = true;
    error = null;
    try {
      if (isTauri) {
        plugins = await tauriInvoke<PluginInfo[]>('list_installed_plugins');
      } else {
        // Browser fallback: fetch installed.json via daemon fs or direct fetch.
        // Since daemon has no plugin endpoint, we try reading the file via the
        // kimi home path + a direct fetch through the Vite proxy.
        const res = await fetch('/api/v1/gui/store/getItem?key=__kimi_plugins_cache__');
        if (res.ok) {
          const data = await res.json();
          plugins = data?.data ?? [];
        }
        // If no cache, show empty state.
        if (!plugins.length) {
          plugins = [];
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  // Source display helpers
  function sourceLabel(source: string): string {
    switch (source) {
      case 'github': return 'GitHub';
      case 'zip-url': return 'ZIP URL';
      case 'marketplace': return '官方市场';
      default: return source;
    }
  }

  function sourceIcon(source: string): IconName {
    switch (source) {
      case 'github': return 'github';
      case 'zip-url': return 'download';
      case 'marketplace': return 'store';
      default: return 'plugin';
    }
  }

  function trustLevel(source: string): { label: string; color: string } {
    // Trust heuristics: official marketplace = high, github = medium, zip-url = low
    if (source === 'marketplace') return { label: '官方', color: 'success' };
    if (source === 'github') return { label: '社区', color: 'info' };
    return { label: '第三方', color: 'warning' };
  }

  function formatDate(iso: string): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  }

  // Install/Uninstall via Rust commands (no shell sidecar — avoids the
  // plugin:shell|execute ACL gate).
  let showInstallForm = $state(false);
  let installSource = $state('');
  let installing = $state(false);
  let installMsg = $state<string | null>(null);

  async function installPlugin() {
    if (!installSource.trim()) return;
    installing = true;
    installMsg = null;
    try {
      // Use the Rust install_plugin_from_local command — accepts zip path,
      // directory, or URL (the kimi CLI handles all three).
      const out = await tauriInvoke<string>('install_plugin_from_local', { localPath: installSource.trim() });
      installMsg = `安装成功${out ? `：${out.split('\n')[0]}` : ''}`;
      showInstallForm = false;
      installSource = '';
      await loadPlugins();
      toast.ok('插件已安装');
    } catch (e) {
      installMsg = `安装失败: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      installing = false;
    }
  }

  // Local zip install: opens a native file dialog via a hidden <input
  // type="file"> (Tauri routes these to the OS picker), then pipes the
  // chosen file path to the Rust install_plugin_from_local command. We
  // can't use tauri-plugin-dialog because it's not in our dep set, but
  // the HTML file input works in the Tauri webview and gives us the
  // absolute path through webkitRelativePath / Tauri's path conversion.
  let zipInputEl: HTMLInputElement | null = $state(null);

  async function installFromZip() {
    zipInputEl?.click();
  }

  async function handleZipChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    // Tauri's webview exposes the absolute path via the File object's
    // .path property (non-standard but Tauri-specific).
    const localPath = (file as unknown as { path?: string }).path ?? file.name;
    installing = true;
    installMsg = `正在从 ${file.name} 安装…`;
    try {
      const out = await tauriInvoke<string>('install_plugin_from_local', { localPath });
      installMsg = `安装成功${out ? `：${out.split('\n')[0]}` : ''}`;
      await loadPlugins();
      toast.ok('插件已安装');
    } catch (e) {
      installMsg = `安装失败: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      installing = false;
      // Reset input so picking the same file twice still fires onchange.
      input.value = '';
    }
  }

  async function uninstallPlugin(pluginId: string, displayName: string) {
    if (!confirm(`确认卸载插件 ${displayName}?`)) return;
    try {
      // Spawn kimi CLI directly through Rust (no shell sidecar, no ACL).
      // This uses install_plugin_from_local with a sentinel — the Rust
      // handler routes uninstall via the same kimi binary, just a different
      // argv. Cleaner: a dedicated uninstall command, but this avoids
      // adding one more Tauri command for now.
      const out = await tauriInvoke<string>('install_plugin_from_local', { localPath: `uninstall:${pluginId}` });
      void out;
      await loadPlugins();
      toast.ok(`已卸载 ${displayName}`);
    } catch (e) {
      error = `卸载失败: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function togglePlugin(pluginId: string, currentEnabled: boolean) {
    try {
      // Direct filesystem write via the Rust `toggle_plugin` command.
      // Avoids the previous Command.sidecar('kimi', ['plugin', ...]) flow
      // which required the shell:allow-execute ACL and failed with
      // "Command plugin:shell|execute not allowed by ACL".
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('toggle_plugin', { pluginId, enabled: !currentEnabled });
      await loadPlugins();
    } catch (e) {
      error = `操作失败: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  $effect(() => {
    void loadPlugins();
  });
</script>

<div class="plugin-panel">
  <!-- Hidden file input for local zip install -->
  <input
    bind:this={zipInputEl}
    type="file"
    accept=".zip"
    onchange={handleZipChange}
    style="display: none;"
  />
  <div class="plugin-header">
    <div>
      <h3>已安装插件</h3>
      <p class="plugin-desc">管理通过 Kimi Code CLI 安装的技能、MCP 服务器和数据源插件。</p>
    </div>
    <div style="display: flex; gap: 6px;">
      <button class="refresh-btn" onclick={loadPlugins} disabled={loading}>
        <Icon name="refresh" size="sm" />
        刷新
      </button>
      {#if isTauri}
        <button class="refresh-btn" onclick={installFromZip} disabled={installing} title="从本地 .zip 文件安装插件" style="color: var(--color-accent); border-color: var(--color-accent-bd);">
          <Icon name="download" size="sm" />
          本地安装
        </button>
        <button class="refresh-btn" onclick={() => showInstallForm = !showInstallForm} style="color: var(--color-accent); border-color: var(--color-accent-bd);">
          <Icon name="plus" size="sm" />
          URL/GitHub
        </button>
      {/if}
    </div>
  </div>

  {#if installMsg}
    <p class="plugin-install-msg">{installMsg}</p>
  {/if}

  {#if showInstallForm}
    <div class="plugin-install-form">
      <label style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--color-text-faint);">
        <span>插件源 (GitHub repo / 名称 / ZIP URL)</span>
        <input bind:value={installSource} placeholder="owner/repo 或 plugin-name" style="padding: 5px 10px; border-radius: 8px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); color: var(--color-text); font-size: 12px; outline: none;" onkeydown={(e) => { if (e.key === 'Enter') installPlugin(); }} />
      </label>
      {#if installMsg}<p style="font-size: 11px; color: var(--color-text-faint);">{installMsg}</p>{/if}
      <div style="display: flex; justify-content: flex-end; gap: 6px;">
        <button class="refresh-btn" onclick={() => showInstallForm = false}>取消</button>
        <button class="refresh-btn" style="color: var(--color-accent); border-color: var(--color-accent-bd);" onclick={installPlugin} disabled={installing}>
          {installing ? '安装中…' : '安装'}
        </button>
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="plugin-loading">
      <div class="spinner"></div>
      <p>扫描插件目录…</p>
    </div>
  {:else if error}
    <div class="plugin-error">
      <Icon name="error-warning" size="md" />
      <p>{error}</p>
      <button class="retry-btn" onclick={loadPlugins}>重试</button>
    </div>
  {:else if plugins.length === 0}
    <div class="plugin-empty">
      <Icon name="plugin" size="lg" />
      <h4>暂无已安装插件</h4>
      <p>通过 CLI 安装插件：<code>kimi plugin install &lt;github-repo&gt;</code></p>
      <p>或从官方市场安装：<code>kimi plugin install &lt;name&gt;</code></p>
      {#if !isTauri}
        <p class="browser-hint"><Icon name="information" size="sm" /> 浏览器模式仅显示缓存数据。请使用桌面应用获取完整插件列表。</p>
      {/if}
    </div>
  {:else}
    <div class="plugin-list">
      <!-- 4-bucket category sections: skill / mcp are core, kimi / claude
           are placeholder slots the user explicitly asked us to surface. -->
      {#each ['skill', 'mcp', 'kimi', 'claude'] as catKey (catKey)}
        {@const cat = catKey as 'skill' | 'mcp' | 'kimi' | 'claude'}
        {@const items = grouped[cat]}
        {@const meta = TYPE_META[cat]}
        {@const isPlaceholder = cat === 'kimi' || cat === 'claude'}
        <section class="plugin-category" data-cat={cat}>
          <header class="cat-head">
            <span class="cat-icon" style="color: {meta.color}"><Icon name={meta.icon} size="md" /></span>
            <span class="cat-title">{meta.label}</span>
            <span class="cat-count">{items.length}</span>
            <span class="cat-desc">{meta.desc}</span>
          </header>
          {#if isPlaceholder && items.length === 0}
            <div class="cat-placeholder">
              <Icon name="information" size="sm" />
              <span>{meta.label} 插件格式支持即将到来，敬请期待</span>
            </div>
          {:else if items.length === 0}
            <div class="cat-empty">尚无{meta.label}插件</div>
          {:else}
            {#each items as plugin (plugin.id)}
              {@const trust = trustLevel(plugin.source)}
              <div class="plugin-card glass-panel" class:disabled={!plugin.enabled}>
                <div class="plugin-card-top">
                  <div class="plugin-icon-wrap" style="color: {meta.color}">
                    <Icon name={meta.icon} size="md" />
                  </div>
                  <div class="plugin-meta">
                    <div class="plugin-name-row">
                      <span class="plugin-name">{plugin.displayName}</span>
                      <span class="plugin-version">v{plugin.version}</span>
                    </div>
                    <div class="plugin-sub">
                      <span class="plugin-source-chip">
                        <Icon name={sourceIcon(plugin.source)} size="sm" />
                        {sourceLabel(plugin.source)}
                      </span>
                      <span class="trust-chip {trust.color}">{trust.label}</span>
                      {#if plugin.hasMcp}
                        <span class="mcp-chip">MCP</span>
                      {/if}
                      {#if plugin.skillCount > 0}
                        <span class="count-chip" title="Skills 数量">{plugin.skillCount} skills</span>
                      {/if}
                      {#if plugin.commandCount > 0}
                        <span class="count-chip" title="Commands 数量">{plugin.commandCount} commands</span>
                      {/if}
                      {#if !plugin.enabled}
                        <span class="disabled-chip">已禁用</span>
                      {/if}
                    </div>
                  </div>
                </div>

                {#if plugin.description}
                  <p class="plugin-desc-text">{plugin.description}</p>
                {/if}

                <div class="plugin-card-footer">
                  <div class="plugin-dates">
                    {#if plugin.developer}<span class="footer-item">{plugin.developer}</span>{/if}
                    {#if plugin.installedAt}<span class="footer-item">安装于 {formatDate(plugin.installedAt)}</span>{/if}
                  </div>
                  <div style="display: flex; gap: 6px; align-items: center;">
                    {#if plugin.originalSource}
                      <a
                        class="plugin-link"
                        href={plugin.originalSource}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={plugin.originalSource}
                      >
                        <Icon name="external-link" size="sm" />
                        源
                      </a>
                    {/if}
                    {#if isTauri && !isPlaceholder}
                      <button class="refresh-btn" style="font-size: 11px; padding: 3px 8px;" onclick={() => togglePlugin(plugin.id, plugin.enabled)}>
                        {plugin.enabled ? '禁用' : '启用'}
                      </button>
                      <button class="refresh-btn" style="font-size: 11px; padding: 3px 8px; color: var(--color-danger);" onclick={() => uninstallPlugin(plugin.id, plugin.displayName)}>
                        卸载
                      </button>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </section>
      {/each}
    </div>
  {/if}

  <div class="plugin-help">
    <Icon name="information" size="sm" />
    <span>插件通过 CLI 命令 <code>kimi plugin install/uninstall</code> 管理。插件目录：<code>~/.kimi-code/plugins/</code></span>
  </div>
</div>

<style>
  .plugin-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .plugin-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .plugin-header h3 {
    font-size: var(--text-base, 14px);
    font-weight: var(--weight-medium, 500);
    margin: 0 0 4px;
  }
  .plugin-desc {
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
  .refresh-btn:hover { color: var(--color-text, #ececec); border-color: var(--color-line-strong, #3a3a3a); }
  .refresh-btn:disabled { opacity: 0.5; }

  .plugin-loading,
  .plugin-error,
  .plugin-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 40px 20px;
    text-align: center;
    color: var(--color-text-muted, #999);
  }
  .plugin-empty h4 {
    font-size: var(--text-base, 14px);
    color: var(--color-text, #ececec);
    margin: 0;
  }
  .plugin-empty p {
    font-size: var(--text-sm, 13px);
    margin: 0;
  }
  .plugin-empty code,
  .plugin-help code {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    background: rgba(255,255,255,0.06);
    padding: 1px 5px;
    border-radius: 3px;
  }
  .browser-hint {
    color: var(--color-text-faint, #555) !important;
    font-size: var(--text-xs, 12px) !important;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .plugin-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* Category sections (skill / mcp / kimi / claude) */
  .plugin-category {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cat-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 4px 4px;
    border-bottom: 1px solid var(--bd);
    margin-bottom: 4px;
  }
  .cat-icon { display: inline-flex; }
  .cat-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--tx);
  }
  .cat-count {
    font-size: 10.5px;
    background: var(--l3);
    color: var(--tx2);
    padding: 1px 8px;
    border-radius: 999px;
    min-width: 18px;
    text-align: center;
  }
  .cat-desc {
    font-size: 11px;
    color: var(--tx3);
    margin-left: auto;
  }
  .cat-placeholder, .cat-empty {
    padding: 14px;
    text-align: center;
    font-size: 11.5px;
    color: var(--tx3);
    background: var(--l2);
    border: 1px dashed var(--bd2);
    border-radius: var(--r-md);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .cat-empty { color: var(--tx3); font-style: italic; }
  .plugin-install-msg {
    margin: 0 0 8px;
    padding: 8px 12px;
    font-size: 11.5px;
    color: var(--tx2);
    background: var(--ac-soft);
    border-radius: var(--r-md);
  }

  .plugin-card {
    padding: 12px 14px;
    border-radius: var(--radius-md, 8px);
    transition: opacity 0.2s;
  }
  .plugin-card.disabled {
    opacity: 0.55;
  }

  .plugin-card-top {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .plugin-icon-wrap {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm, 6px);
    background: rgba(255,255,255,0.05);
    color: var(--color-text-muted, #999);
    flex-shrink: 0;
  }
  .plugin-meta {
    flex: 1;
    min-width: 0;
  }
  .plugin-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .plugin-name {
    font-size: var(--text-sm, 13px);
    font-weight: var(--weight-medium, 500);
    color: var(--color-text, #ececec);
  }
  .plugin-version {
    font-size: var(--text-xs, 11px);
    font-family: var(--font-mono, monospace);
    color: var(--color-text-faint, #555);
  }
  .plugin-sub {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    flex-wrap: wrap;
  }
  .plugin-source-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    padding: 2px 7px;
    border-radius: var(--radius-full, 999px);
    background: rgba(255,255,255,0.05);
    color: var(--color-text-muted, #999);
  }
  .trust-chip {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: var(--radius-full, 999px);
    font-weight: 500;
  }
  .trust-chip.success {
    background: rgba(63, 185, 80, 0.14);
    color: var(--color-success, #30d158);
  }
  .trust-chip.info {
    background: rgba(121, 184, 255, 0.14);
    color: #79b8ff;
  }
  .trust-chip.warning {
    background: rgba(210, 153, 34, 0.14);
    color: var(--color-warning, #d29922);
  }
  .mcp-chip {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: var(--radius-full, 999px);
    background: rgba(163, 113, 247, 0.14);
    color: #a371f7;
    font-family: var(--font-mono, monospace);
  }
  .count-chip {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: var(--radius-full, 999px);
    background: var(--color-accent-soft, rgba(79, 168, 255, 0.12));
    color: var(--color-accent, #4fa8ff);
    font-family: var(--font-mono, monospace);
  }
  .disabled-chip {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: var(--radius-full, 999px);
    background: rgba(248, 81, 73, 0.14);
    color: var(--color-danger, #ff453a);
  }

  .plugin-desc-text {
    font-size: var(--text-xs, 12px);
    color: var(--color-text-muted, #999);
    margin: 8px 0 0;
    line-height: 1.5;
  }

  .plugin-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
    gap: 8px;
  }
  .plugin-dates {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .footer-item {
    font-size: 10px;
    color: var(--color-text-faint, #555);
  }
  .plugin-link {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: var(--color-text-faint, #555);
    text-decoration: none;
    transition: color 0.15s;
  }
  .plugin-link:hover {
    color: var(--color-text, #ececec);
  }

  .plugin-help {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--radius-sm, 6px);
    background: rgba(255,255,255,0.03);
    color: var(--color-text-muted, #999);
    font-size: var(--text-xs, 12px);
    line-height: 1.5;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(255,255,255,0.1);
    border-top-color: var(--color-text, #ececec);
    border-radius: 50%;
    animation: kimi-spin var(--duration-spin, 0.8s) linear infinite;
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
