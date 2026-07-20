<!-- ConfigDialog.svelte — the "傻瓜化" configuration panel.
     Five tabs: 账号 / 模型 / Provider / Skills / 通用.
     Lets users configure everything through GUI without editing TOML. -->
<script lang="ts">
  import Dialog from '../ui/Dialog.svelte';
  import { daemon } from '../../stores/daemon.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import SkillsPanel from './SkillsPanel.svelte';
  import McpPanel from './McpPanel.svelte';
  import MemoryPanel from './MemoryPanel.svelte';
  import PluginPanel from './PluginPanel.svelte';
  import * as client from '../../stores/client.svelte';
  import { invoke } from '@tauri-apps/api/core';

  let {
    open = $bindable(true),
  }: { open?: boolean } = $props();

  let activeTab = $state<'account' | 'models' | 'providers' | 'skills' | 'mcp' | 'plugins' | 'memory' | 'general' | 'archived' | 'advanced'>('account');
  let saving = $state(false);
  let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  // --- OAuth login state ---
  let oauthState = $state<'idle' | 'starting' | 'pending' | 'success' | 'expired' | 'error'>('idle');
  let oauthData = $state<{
    verificationUri?: string;
    verificationUriComplete?: string;
    userCode?: string;
  }>({});
  let oauthTimer: ReturnType<typeof setInterval> | null = null;

  function showMessage(type: 'success' | 'error', text: string) {
    message = { type, text };
    setTimeout(() => { message = null; }, 4000);
  }

  // === Account tab ===
  async function startLogin() {
    oauthState = 'starting';
    oauthData = {};
    try {
      const result = await client.client.startOAuthLogin();
      oauthState = 'pending';
      oauthData = {
        verificationUri: result.verificationUri,
        verificationUriComplete: result.verificationUriComplete,
        userCode: result.userCode,
      };
      // Open the verification URL in the system browser.
      const url = result.verificationUriComplete || result.verificationUri;
      if (url) {
        try { await invoke('open_path', { path: url }); } catch { window.open(url, '_blank'); }
      }
      // Start polling.
      const interval = (result.interval ?? 5) * 1000;
      oauthTimer = setInterval(async () => {
        try {
          const poll = await client.client.pollOAuthLogin();
          if (!poll) return;
          if (poll.status === 'authenticated') {
            stopPolling();
            oauthState = 'success';
            await client.client.checkAuth();
            showMessage('success', '登录成功');
          } else if (poll.status === 'expired' || poll.status === 'denied') {
            stopPolling();
            oauthState = 'expired';
          }
        } catch { /* keep polling */ }
      }, interval);
    } catch (e) {
      oauthState = 'error';
      showMessage('error', `启动登录失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function stopPolling() {
    if (oauthTimer) { clearInterval(oauthTimer); oauthTimer = null; }
  }

  async function cancelLogin() {
    stopPolling();
    try { await client.client.cancelOAuthLogin(); } catch { /* ignore */ }
    oauthState = 'idle';
  }

  async function handleLogout() {
    saving = true;
    try {
      await client.client.logout();
      showMessage('success', '已退出登录');
    } catch (e) {
      showMessage('error', `退出失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      saving = false;
    }
  }

  // === Provider add/edit ===
  let showProviderForm = $state(false);
  let editingProviderId = $state<string | null>(null);
  let providerForm = $state({
    id: '',
    type: 'openai' as string,
    apiKey: '',
    baseUrl: '',
    defaultModel: '',
  });

  const PROVIDER_TYPES = [
    { value: 'kimi', label: 'Kimi (Moonshot)' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'google-genai', label: 'Google Gemini' },
    { value: 'openai_responses', label: 'OpenAI Responses API' },
  ];

  function openAddProvider() {
    editingProviderId = null;
    providerForm = { id: '', type: 'openai', apiKey: '', baseUrl: '', defaultModel: '' };
    showProviderForm = true;
  }

  function openEditProvider(id: string) {
    editingProviderId = id;
    const existing = client.providers().find((p) => p.id === id);
    providerForm = {
      id,
      type: existing?.type ?? 'openai',
      apiKey: '', // can't prefill — daemon only returns hasApiKey
      baseUrl: existing?.baseUrl ?? '',
      defaultModel: existing?.defaultModel ?? '',
    };
    showProviderForm = true;
  }

  async function saveProvider() {
    if (!providerForm.id.trim()) {
      showMessage('error', '请填写 Provider 名称');
      return;
    }
    saving = true;
    try {
      await client.client.saveProvider(providerForm.id.trim(), {
        type: providerForm.type,
        apiKey: providerForm.apiKey || undefined,
        baseUrl: providerForm.baseUrl || undefined,
        defaultModel: providerForm.defaultModel || undefined,
      });
      showMessage('success', `Provider "${providerForm.id}" 已保存`);
      showProviderForm = false;
    } catch (e) {
      showMessage('error', `保存失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      saving = false;
    }
  }

  async function refreshProvider(id: string) {
    saving = true;
    try {
      await client.client.refreshProviderModels(id);
      showMessage('success', `已刷新 ${id} 的模型列表`);
    } catch (e) {
      showMessage('error', `刷新失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      saving = false;
    }
  }

  // === Model alias add ===
  let showModelForm = $state(false);
  let modelForm = $state({
    alias: '',
    provider: '',
    model: '',
    maxContextSize: 128000,
    displayName: '',
  });

  function openAddModel() {
    if (client.providers().length === 0) {
      showMessage('error', '请先在 Provider 标签页添加一个 Provider');
      return;
    }
    modelForm = {
      alias: '',
      provider: client.providers()[0]?.id ?? '',
      model: '',
      maxContextSize: 128000,
      displayName: '',
    };
    showModelForm = true;
  }

  async function saveModel() {
    if (!modelForm.alias.trim() || !modelForm.provider || !modelForm.model.trim()) {
      showMessage('error', '请填写别名、Provider 和模型名');
      return;
    }
    saving = true;
    try {
      await client.client.saveModelAlias(modelForm.alias.trim(), {
        provider: modelForm.provider,
        model: modelForm.model.trim(),
        maxContextSize: modelForm.maxContextSize,
        displayName: modelForm.displayName || undefined,
      });
      showMessage('success', `模型别名 "${modelForm.alias}" 已保存`);
      showModelForm = false;
    } catch (e) {
      showMessage('error', `保存失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      saving = false;
    }
  }

  async function selectDefaultModel(modelId: string) {
    saving = true;
    try {
      await client.client.setDefaultModel(modelId);
      showMessage('success', `默认模型已设为 ${modelId}`);
    } catch (e) {
      showMessage('error', `设置失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      saving = false;
    }
  }

  // === General settings ===
  async function toggleConfig(key: 'telemetry' | 'planMode' | 'yolo' | 'mergeAllAvailableSkills', value: boolean) {
    saving = true;
    try {
      await client.client.updateConfig({ [key]: value });
    } catch (e) {
      showMessage('error', `设置失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      saving = false;
    }
  }

  // Thinking is a nested object { enabled?, effort? } — must spread to avoid clobbering effort.
  async function toggleThinking(enabled: boolean) {
    saving = true;
    try {
      await client.client.updateConfig({
        thinking: { ...client.config()?.thinking, enabled },
      });
    } catch (e) {
      showMessage('error', `设置失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      saving = false;
    }
  }

  async function setPermission(mode: 'manual' | 'auto' | 'yolo') {
    saving = true;
    try {
      await client.client.updateConfig({ defaultPermissionMode: mode });
    } catch (e) {
      showMessage('error', `设置失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      saving = false;
    }
  }

  async function setColorScheme(scheme: 'light' | 'dark' | 'system' | 'clay' | 'brutal' | 'glass' | 'aqua') {
    client.client.setColorScheme(scheme);
  }

  // Clean up on close — cancel any in-flight OAuth flow on the server too.
  function handleClose() {
    stopPolling();
    if (oauthState === 'pending') {
      void client.client.cancelOAuthLogin().catch(() => {});
    }
    oauthState = 'idle';
    showProviderForm = false;
    showModelForm = false;
  }
</script>

<!-- Intercept ESC: when a form overlay is open, close the form first (don't
     let it bubble to Dialog which would close the entire settings panel).
     stopImmediatePropagation prevents the Dialog's own window-level Escape
     handler from also firing (they share the same window target). -->
<svelte:window onkeydown={(e) => {
  if (e.key === 'Escape' && (showProviderForm || showModelForm)) {
    e.stopImmediatePropagation();
    e.preventDefault();
    showProviderForm = false;
    showModelForm = false;
  }
}} />

<Dialog bind:open title="设置" onClose={handleClose}>
  <!-- Tab bar -->
  <div class="tabs">
    <button class="tab" class:active={activeTab === 'account'} onclick={() => activeTab = 'account'}>
      <Icon name="user" size="sm" /> 账号
    </button>
    <button class="tab" class:active={activeTab === 'models'} onclick={() => activeTab = 'models'}>
      <Icon name="bolt" size="sm" /> 模型
    </button>
    <button class="tab" class:active={activeTab === 'providers'} onclick={() => activeTab = 'providers'}>
      <Icon name="globe" size="sm" /> Provider
    </button>
    <button class="tab" class:active={activeTab === 'skills'} onclick={() => activeTab = 'skills'}>
      <Icon name="sparkles" size="sm" /> Skills
    </button>
    <button class="tab" class:active={activeTab === 'mcp'} onclick={() => activeTab = 'mcp'}>
      <Icon name="server" size="sm" /> MCP
    </button>
    <button class="tab" class:active={activeTab === 'memory'} onclick={() => activeTab = 'memory'}>
      <Icon name="brain" size="sm" /> 记忆
    </button>
    <button class="tab" class:active={activeTab === 'plugins'} onclick={() => activeTab = 'plugins'}>
      <Icon name="plugin" size="sm" /> 插件
    </button>
    <button class="tab" class:active={activeTab === 'general'} onclick={() => activeTab = 'general'}>
      <Icon name="settings" size="sm" /> 通用
    </button>
    <button class="tab" class:active={activeTab === 'archived'} onclick={() => { activeTab = 'archived'; client.client.loadArchivedSessions(); }}>
      <Icon name="archive" size="sm" /> 已归档
    </button>
    <button class="tab" class:active={activeTab === 'advanced'} onclick={() => activeTab = 'advanced'}>
      <Icon name="tools" size="sm" /> 高级
    </button>
  </div>

  <!-- Message toast -->
  {#if message}
    <div class="msg msg-{message.type}">{message.text}</div>
  {/if}

  <!-- === Account tab === -->
  {#if activeTab === 'account'}
    <div class="tab-content">
      <h3>Kimi 账号</h3>
      {#if client.authProvider()?.status === 'authenticated'}
        <div class="status-card ok">
          <Icon name="check" size="md" />
          <div>
            <div class="status-title">已登录</div>
            <div class="status-sub">{client.authProvider()?.name}</div>
          </div>
        </div>
        <Button variant="default" onclick={handleLogout} disabled={saving}>
          {saving ? '退出中…' : '退出登录'}
        </Button>
      {:else if oauthState === 'pending'}
        <div class="oauth-pending">
          <p>请在浏览器中完成授权：</p>
          {#if oauthData.userCode}
            <div class="user-code">{oauthData.userCode}</div>
            <p class="hint">将上面的代码输入到授权页面</p>
          {/if}
          <p class="hint">等待授权完成…</p>
          <Button variant="default" onclick={cancelLogin}>取消</Button>
        </div>
      {:else if oauthState === 'success'}
        <div class="status-card ok">
          <Icon name="check" size="md" />
          <span>登录成功！</span>
        </div>
      {:else}
        <div class="status-card warn">
          <Icon name="alert-triangle" size="md" />
          <div>
            <div class="status-title">未登录</div>
            <div class="status-sub">登录 Kimi 账号以使用 Kimi K2 模型</div>
          </div>
        </div>
        <Button variant="primary" onclick={startLogin} disabled={oauthState === 'starting'}>
          {oauthState === 'starting' ? '启动中…' : '登录 Kimi 账号'}
        </Button>
        <div class="divider"><span>或使用 API Key</span></div>
        <p class="hint">
          如果你有 API Key，可以在「Provider」标签页手动添加 Provider。
        </p>
      {/if}
    </div>
  {/if}

  <!-- === Models tab === -->
  {#if activeTab === 'models'}
    <div class="tab-content">
      <div class="section-header">
        <h3>模型列表</h3>
        <Button size="sm" variant="default" icon="plus" onclick={openAddModel}>添加模型</Button>
      </div>
      {#if client.models().length === 0}
        <p class="empty">暂无模型。请先添加 Provider，然后添加模型别名。</p>
      {:else}
        <div class="model-list">
          {#each client.models() as model (model.id)}
            <div class="model-row" class:default={model.id === client.defaultModel()}>
              <div class="model-info">
                <span class="model-name">{model.displayName || model.id}</span>
                <span class="model-meta">{model.provider} · {model.model}</span>
                {#if model.id === client.defaultModel()}
                  <span class="badge-default">默认</span>
                {/if}
              </div>
              {#if model.id !== client.defaultModel()}
                <Button size="sm" variant="ghost" onclick={() => selectDefaultModel(model.id)}>设为默认</Button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <!-- Add model form -->
      {#if showModelForm}
        <div class="form-overlay" onclick={() => showModelForm = false} onkeydown={(e) => { if (e.key === "Escape") showModelForm = false; }} role="presentation" tabindex="-1">
          <div class="form-card" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
            <h4>添加模型别名</h4>
            <label>别名 (用于选择模型)
              <input bind:value={modelForm.alias} placeholder="如 gpt-4o" />
            </label>
            <label>Provider
              <select bind:value={modelForm.provider}>
                {#each client.providers() as p (p.id)}
                  <option value={p.id}>{p.id} ({p.type})</option>
                {/each}
              </select>
            </label>
            <label>真实模型名
              <input bind:value={modelForm.model} placeholder="如 gpt-4o-2024-11-20" />
            </label>
            <label>最大上下文长度
              <input type="number" bind:value={modelForm.maxContextSize} min="1000" step="1000" />
            </label>
            <label>显示名称 (可选)
              <input bind:value={modelForm.displayName} placeholder="如 GPT-4o" />
            </label>
            <div class="form-actions">
              <Button variant="ghost" onclick={() => showModelForm = false}>取消</Button>
              <Button variant="primary" onclick={saveModel} disabled={saving}>保存</Button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- === Providers tab === -->
  {#if activeTab === 'providers'}
    <div class="tab-content">
      <div class="section-header">
        <h3>Provider 列表</h3>
        <Button size="sm" variant="default" icon="plus" onclick={openAddProvider}>添加 Provider</Button>
      </div>
      {#if client.providers().length === 0}
        <p class="empty">暂无 Provider。点击「添加 Provider」开始配置。</p>
      {:else}
        <div class="provider-list">
          {#each client.providers() as p (p.id)}
            <div class="provider-row">
              <div class="provider-info">
                <div class="provider-top">
                  <span class="provider-name">{p.id}</span>
                  <span class="provider-type">{p.type}</span>
                  <span class="provider-key" class:ok={p.hasApiKey} class:no={!p.hasApiKey}>
                    {p.hasApiKey ? '🔑 已配 Key' : '⚠ 未配 Key'}
                  </span>
                </div>
                {#if p.baseUrl}
                  <span class="provider-url">{p.baseUrl}</span>
                {/if}
              </div>
              <div class="provider-actions">
                <IconButton name="arrow-down" label="刷新模型" size="sm" onclick={() => refreshProvider(p.id)} />
                <IconButton name="pencil" label="编辑" size="sm" onclick={() => openEditProvider(p.id)} />
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Add/edit provider form -->
      {#if showProviderForm}
        <div class="form-overlay" onclick={() => showProviderForm = false} onkeydown={(e) => { if (e.key === "Escape") showProviderForm = false; }} role="presentation" tabindex="-1">
          <div class="form-card" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
            <h4>{editingProviderId ? '编辑 Provider' : '添加 Provider'}</h4>
            <label>名称 (唯一标识)
              <input bind:value={providerForm.id} placeholder="如 my-openai" disabled={!!editingProviderId} />
            </label>
            <label>类型
              <select bind:value={providerForm.type}>
                {#each PROVIDER_TYPES as pt}
                  <option value={pt.value}>{pt.label}</option>
                {/each}
              </select>
            </label>
            <label>API Key
              <input type="password" bind:value={providerForm.apiKey} placeholder={editingProviderId ? '留空表示不修改' : 'sk-...'} />
            </label>
            <label>Base URL (可选)
              <input bind:value={providerForm.baseUrl} placeholder="https://api.openai.com/v1" />
            </label>
            <label>默认模型 (可选)
              <input bind:value={providerForm.defaultModel} placeholder="gpt-4o" />
            </label>
            <div class="form-actions">
              <Button variant="ghost" onclick={() => showProviderForm = false}>取消</Button>
              <Button variant="primary" onclick={saveProvider} disabled={saving}>保存</Button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- === Skills tab === -->
  {#if activeTab === 'skills'}
    <div class="tab-content">
      <SkillsPanel />
    </div>
  {/if}

  <!-- === MCP tab === -->
  {#if activeTab === 'mcp'}
    <div class="tab-content">
      <McpPanel />
    </div>
  {/if}

  <!-- === Memory tab === -->
  {#if activeTab === 'memory'}
    <div class="tab-content">
      <MemoryPanel />
    </div>
  {/if}

  <!-- === Plugins tab === -->
  {#if activeTab === 'plugins'}
    <div class="tab-content">
      <PluginPanel />
    </div>
  {/if}

  <!-- === General tab === -->
  {#if activeTab === 'general'}
    <div class="tab-content">
      <h3>外观</h3>
      <div class="setting-row">
        <span>主题</span>
        <div class="segmented">
          {#each ['light', 'dark', 'clay', 'brutal', 'glass', 'aqua', 'system'] as scheme}
            <button
              class="seg-btn"
              class:active={client.colorScheme() === scheme}
              onclick={() => setColorScheme(scheme as 'light' | 'dark' | 'system' | 'clay' | 'brutal' | 'glass' | 'aqua')}
            >
              {scheme === 'light' ? '浅色' : scheme === 'dark' ? '深色' : scheme === 'clay' ? '粘土' : scheme === 'brutal' ? '粗野' : scheme === 'glass' ? '玻璃' : scheme === 'aqua' ? '水凝' : '跟随系统'}
            </button>
          {/each}
        </div>
      </div>

      <h3>权限模式</h3>
      <div class="setting-row">
        <span>默认权限</span>
        <div class="segmented">
          {#each [['manual', '手动确认'], ['auto', '自动批准'], ['yolo', 'YOLO']] as [val, label]}
            <button
              class="seg-btn"
              class:active={client.config()?.defaultPermissionMode === val}
              onclick={() => setPermission(val as 'manual' | 'auto' | 'yolo')}
              disabled={saving}
            >
              {label}
            </button>
          {/each}
        </div>
      </div>

      <h3>开关</h3>
      <label class="switch-row">
        <span>
          <div class="switch-label">思考模式</div>
          <div class="switch-sub">启用模型的思考/推理能力</div>
        </span>
        <input
          type="checkbox"
          class="toggle"
          checked={client.config()?.thinking?.enabled}
          disabled={saving}
          onchange={(e) => toggleThinking((e.target as HTMLInputElement).checked)}
        />
      </label>
      <label class="switch-row">
        <span>
          <div class="switch-label">遥测</div>
          <div class="switch-sub">发送匿名使用数据帮助改进产品</div>
        </span>
        <input
          type="checkbox"
          class="toggle"
          checked={client.config()?.telemetry}
          disabled={saving}
          onchange={(e) => toggleConfig('telemetry', (e.target as HTMLInputElement).checked)}
        />
      </label>
      <label class="switch-row">
        <span>
          <div class="switch-label">合并所有可用 Skills</div>
          <div class="switch-sub">自动合并所有来源的 Skills</div>
        </span>
        <input
          type="checkbox"
          class="toggle"
          checked={client.config()?.mergeAllAvailableSkills}
          disabled={saving}
          onchange={(e) => toggleConfig('mergeAllAvailableSkills', (e.target as HTMLInputElement).checked)}
        />
      </label>
    </div>
  {/if}

  <!-- === Archived sessions tab === -->
  {#if activeTab === 'archived'}
    <div class="tab-content">
      <h3>已归档会话</h3>
      {#if client.client.archivedLoading}
        <div class="archived-loading"><div class="spinner"></div><p>加载中…</p></div>
      {:else if client.client.archivedSessions.length === 0}
        <div class="archived-empty">
          <Icon name="archive" size="lg" />
          <p>没有已归档的会话</p>
        </div>
      {:else}
        <div class="archived-list">
          {#each client.client.archivedSessions as session (session.id)}
            <div class="archived-row glass-panel">
              <div class="archived-info">
                <span class="archived-title">{session.title || '新对话'}</span>
                <span class="archived-meta">{session.cwd ?? ''}</span>
              </div>
              <button class="restore-btn" onclick={() => client.client.restoreSession(session.id)}>
                <Icon name="refresh" size="sm" /> 恢复
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- === Advanced tab === -->
  {#if activeTab === 'advanced'}
    <div class="tab-content">
      <h3>高级</h3>
      <div class="setting-row">
        <div>
          <div class="switch-label">Daemon 版本</div>
          <div class="switch-sub">{client.serverVersion() || '未知'}</div>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <div class="switch-label">端点地址</div>
          <div class="switch-sub mono">{daemon.state.origin || 'http://127.0.0.1:58627'}</div>
        </div>
      </div>
      <label class="setting-row">
        <div>
          <div class="switch-label">遥测</div>
          <div class="switch-sub">发送匿名使用数据帮助改进产品</div>
        </div>
        <input
          type="checkbox"
          class="switch"
          checked={client.config()?.telemetry}
          onchange={(e) => toggleConfig('telemetry', (e.target as HTMLInputElement).checked)}
        />
      </label>
    </div>
  {/if}
</Dialog>

<style>
  .tabs {
    display: flex;
    gap: 2px;
    border-bottom: 1px solid var(--color-line, rgba(84,84,88,0.65));
    margin-bottom: 20px;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: none;
    background: transparent;
    color: var(--color-text-muted, rgba(235,235,245,0.6));
    font-size: var(--text-sm, 13px);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color var(--duration-fast, 120ms), border-color var(--duration-fast, 120ms);
  }
  .tab:hover { color: var(--color-text, rgba(255,255,255,0.92)); }
  .tab.active {
    color: var(--color-accent, #2dd4bf);
    border-bottom-color: var(--color-accent, #2dd4bf);
  }

  .tab-content h3 {
    font-size: var(--text-base, 14px);
    font-weight: var(--weight-medium, 500);
    margin: 0 0 12px;
    color: var(--color-text, rgba(255,255,255,0.92));
  }
  .tab-content h3:not(:first-child) {
    margin-top: 24px;
  }

  .msg {
    padding: 8px 12px;
    border-radius: var(--radius-sm, 6px);
    font-size: var(--text-sm, 13px);
    margin-bottom: 16px;
  }
  .msg-success { background: var(--color-success-soft, rgba(78, 201, 176, 0.12)); color: var(--color-success, #30d158); }
  .msg-error { background: var(--color-danger-soft, rgba(255, 107, 107, 0.12)); color: var(--color-danger, #ff453a); }

  /* Status cards */
  .status-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-radius: var(--radius-lg, 12px);
    margin-bottom: 12px;
  }
  .status-card.ok { background: var(--color-success-soft, rgba(78, 201, 176, 0.1)); }
  .status-card.warn { background: var(--color-warning-soft, rgba(255, 193, 7, 0.1)); }
  .status-title { font-weight: var(--weight-medium, 500); }
  .status-sub { font-size: var(--text-sm, 13px); color: var(--color-text-muted, rgba(235,235,245,0.6)); }

  .oauth-pending { text-align: center; padding: 20px 0; }
  .oauth-pending p { margin: 8px 0; color: var(--color-text-muted, rgba(235,235,245,0.6)); }
  .user-code {
    font-family: var(--font-mono, monospace);
    font-size: 28px;
    font-weight: var(--weight-semibold, 700);
    letter-spacing: 0.1em;
    padding: 12px 24px;
    background: var(--color-surface-raised, #1a1a1e);
    border-radius: var(--radius-md, 8px);
    margin: 12px 0;
    display: inline-block;
  }
  .hint { font-size: var(--text-xs, 12px); color: var(--color-text-faint, rgba(235,235,245,0.3)); }
  .divider {
    text-align: center;
    margin: 20px 0;
    position: relative;
    color: var(--color-text-faint, rgba(235,235,245,0.3));
    font-size: var(--text-xs, 12px);
  }
  .divider::before {
    content: '';
    position: absolute;
    left: 0; right: 0; top: 50%;
    border-top: 1px solid var(--color-line, rgba(84,84,88,0.65));
  }
  .divider span { background: var(--color-surface, rgba(28,28,30,0.72)); padding: 0 12px; position: relative; }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .section-header h3 { margin: 0; }

  .empty { color: var(--color-text-muted, rgba(235,235,245,0.6)); font-size: var(--text-sm, 13px); padding: 20px 0; }

  /* Model list */
  .model-list, .provider-list { display: flex; flex-direction: column; gap: 4px; }
  .model-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: var(--radius-md, 8px);
    transition: background var(--duration-fast, 120ms);
  }
  .model-row:hover { background: var(--color-hover, rgba(255, 255, 255, 0.04)); }
  .model-row.default { background: var(--color-accent-soft, rgba(124, 140, 255, 0.08)); }
  .model-info { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .model-name { font-weight: var(--weight-medium, 500); }
  .model-meta { font-size: var(--text-xs, 12px); color: var(--color-text-faint, rgba(235,235,245,0.3)); }
  .badge-default {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-full, 999px);
    background: var(--color-accent, #2dd4bf);
    color: #fff;
  }

  /* Provider list */
  .provider-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--color-line, rgba(84,84,88,0.65));
  }
  .provider-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .provider-name { font-weight: var(--weight-medium, 500); }
  .provider-type { font-size: var(--text-xs, 12px); color: var(--color-text-muted, rgba(235,235,245,0.6)); }
  .provider-key { font-size: var(--text-xs, 12px); }
  .provider-key.ok { color: var(--color-success, #30d158); }
  .provider-key.no { color: var(--color-warning, #ffc107); }
  .provider-url { font-size: var(--text-xs, 12px); color: var(--color-text-faint, rgba(235,235,245,0.3)); font-family: var(--font-mono, monospace); }
  .provider-actions { display: flex; gap: 4px; }

  /* Form overlay */
  .form-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 400);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    animation: kimi-fade-in var(--duration-fast, 120ms) var(--ease, ease);
  }
  .form-card {
    background: var(--color-surface, rgba(28,28,30,0.72));
    border: 1px solid var(--color-line, rgba(84,84,88,0.65));
    border-radius: var(--radius-lg, 12px);
    padding: 24px;
    width: min(440px, 90vw);
    display: flex;
    flex-direction: column;
    gap: 14px;
    animation: kimi-fade-in-up var(--duration-base, 160ms) var(--ease-out, ease);
  }
  .form-card h4 { margin: 0 0 4px; font-size: var(--text-base, 14px); font-weight: var(--weight-medium, 500); }
  .form-card label { display: flex; flex-direction: column; gap: 4px; font-size: var(--text-sm, 13px); color: var(--color-text-muted, rgba(235,235,245,0.6)); }
  .form-card input, .form-card select {
    padding: 8px 10px;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--color-line, rgba(84,84,88,0.65));
    background: var(--color-surface-raised, #1a1a1e);
    color: var(--color-text, rgba(255,255,255,0.92));
    font-size: var(--text-sm, 13px);
    font-family: inherit;
  }
  .form-card input:focus, .form-card select:focus {
    outline: none;
    border-color: var(--color-accent, #2dd4bf);
  }
  .form-card input:disabled { opacity: 0.5; }
  .form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }

  /* General settings */
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    margin-bottom: 8px;
  }
  .segmented { display: flex; gap: 2px; background: var(--color-surface-raised, #1a1a1e); border-radius: var(--radius-sm, 6px); padding: 2px; }
  .seg-btn {
    padding: 5px 12px;
    border: none;
    background: transparent;
    color: var(--color-text-muted, rgba(235,235,245,0.6));
    font-size: var(--text-xs, 12px);
    border-radius: var(--radius-xs, 4px);
    cursor: pointer;
    transition: background var(--duration-fast, 120ms), color var(--duration-fast, 120ms);
  }
  .seg-btn:hover { color: var(--color-text, rgba(255,255,255,0.92)); }
  .seg-btn.active { background: var(--color-accent, #2dd4bf); color: #fff; }

  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    cursor: pointer;
  }
  .switch-label { font-size: var(--text-sm, 13px); font-weight: var(--weight-medium, 500); }
  .switch-sub { font-size: var(--text-xs, 12px); color: var(--color-text-faint, rgba(235,235,245,0.3)); margin-top: 2px; }
  .toggle {
    appearance: none;
    width: 38px;
    height: 22px;
    background: var(--color-line-strong, rgba(84,84,88,0.4));
    border-radius: 11px;
    position: relative;
    cursor: pointer;
    transition: background var(--duration-fast, 120ms);
    flex: none;
  }
  .toggle:checked { background: var(--color-accent, #2dd4bf); }
  .toggle::after {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    top: 3px;
    left: 3px;
    transition: transform var(--duration-fast, 120ms);
  }
  .toggle:checked::after { transform: translateX(16px); }

  /* Archived sessions */
  .archived-loading,
  .archived-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px 20px;
    color: var(--color-text-faint, #555);
  }
  .archived-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .archived-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-radius: var(--radius-md, 8px);
  }
  .archived-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }
  .archived-title {
    font-size: var(--text-sm, 13px);
    color: var(--color-text, #ececec);
  }
  .archived-meta {
    font-size: var(--text-xs, 11px);
    font-family: var(--font-mono, monospace);
    color: var(--color-text-faint, #555);
  }
  .restore-btn {
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
  .restore-btn:hover {
    color: var(--color-text, #ececec);
    border-color: var(--color-line-strong, #3a3a3a);
  }
  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(255,255,255,0.1);
    border-top-color: var(--color-text, #ececec);
    border-radius: 50%;
    animation: kimi-spin var(--duration-spin, 0.8s) linear infinite;
  }
  .mono {
    font-family: var(--font-mono, monospace);
  }
</style>
