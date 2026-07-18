<!-- SettingsView.svelte — full-window settings page (design-draft audit):
     top header + left nav with left accent bar + rich row-cards:
     Kimi binding card, quota bars, usage hero with context ring, item lists
     with tinted icon squares, search rows, dashed add boxes. -->
<script lang="ts">
  import Icon from '../components/ui/Icon.svelte';
  import type { IconName } from '../lib/icon-types';
  import PluginPanel from '../components/settings/PluginPanel.svelte';
  import * as client from '../stores/client.svelte';
  import { daemon } from '../stores/daemon.svelte';

  let { onnavigate = () => {} }: { onnavigate?: () => void } = $props();

  type Section = 'general' | 'preview' | 'models' | 'subagents' | 'plugins' | 'commands' | 'index' | 'usage' | 'guide';
  let active = $state<Section>('general');

  const navItems: { id: Section; label: string; icon: IconName }[] = [
    { id: 'general', label: '常规', icon: 'settings' },
    { id: 'preview', label: '代码预览', icon: 'file-text' },
    { id: 'models', label: '模型设置', icon: 'sparkles' },
    { id: 'subagents', label: '子智能体', icon: 'git-branch' },
    { id: 'plugins', label: '插件管理', icon: 'plugin' },
    { id: 'commands', label: '命令', icon: 'bolt' },
    { id: 'index', label: '索引库', icon: 'server' },
    { id: 'usage', label: '使用统计', icon: 'check-list' },
    { id: 'guide', label: '引导', icon: 'help-circle' },
  ];

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onnavigate();
  }

  let saving = false; void saving;
  let msg = $state<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function toggleConfig(key: 'telemetry' | 'mergeAllAvailableSkills', value: boolean) {
    saving = true;
    try { await client.client.updateConfig({ [key]: value } as Record<string, never>); }
    catch (e) { msg = { type: 'err', text: String(e) }; setTimeout(() => msg = null, 3000); }
    finally { saving = false; }
  }

  function kFmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
    return String(n);
  }

  // Model/provider CRUD state
  let showAddModel = $state(false);
  let newModelAlias = $state('');
  let newModelProvider = $state('');
  let newModelName = $state('');
  let newModelContext = $state('128000');
  let newModelDisplay = $state('');

  let showAddProvider = $state(false);
  let newProviderId = $state('');
  let newProviderType = $state('openai');
  let newProviderKey = $state('');
  let newProviderUrl = $state('');

  let showEditProvider = $state(false);
  let editingProvider = $state('');
  let providerApiKey = $state('');

  // Preview preferences (localStorage-backed)
  let previewMode = $state(typeof localStorage !== 'undefined' ? (localStorage.getItem('kode.preview-mode') ?? 'source') : 'source');
  let diffAutoExpand = $state(typeof localStorage !== 'undefined' ? localStorage.getItem('kode.diff-expand') === 'true' : false);
  let hlTheme = $state(typeof localStorage !== 'undefined' ? (localStorage.getItem('kode.hl-theme') ?? 'one-dark') : 'one-dark');

  // Plugin list filter (visual only, real data inside PluginPanel)
  let pluginTab = $state<'installed' | 'discover'>('installed');

  // Usage hero: context ring geometry
  const usage = $derived(client.activeSessionUsage());
  const ringPct = $derived(usage && usage.contextLimit > 0 ? Math.min(1, usage.contextTokens / usage.contextLimit) : 0);
  const RING_C = 2 * Math.PI * 34; // r=34 → 213.6
</script>

<svelte:window onkeydown={onKeydown} />

<div class="settings-page">
  <!-- Top header (design draft shell bar) -->
  <header class="sp-header">
    <span class="sp-header-t">设置</span>
    <span class="sp-header-r"><kbd class="kbd">Esc</kbd><span class="hint">返回工作区</span></span>
  </header>

  <div class="sp-body">
    <!-- Left nav -->
    <nav class="sp-nav">
      <button class="sp-back" onclick={onnavigate}><Icon name="arrow-left" size="sm" /> 返回工作区</button>
      <div class="sp-divider"></div>
      {#each navItems as item (item.id)}
        <button class="sp-tab" class:on={active === item.id} onclick={() => active = item.id}>
          <Icon name={item.icon} size="sm" />
          <span>{item.label}</span>
        </button>
      {/each}
      <div class="sp-divider" style="margin-top:auto"></div>
      <div class="sp-foot">
        <div class="avatar">{(client.authProvider()?.name || 'U')[0].toUpperCase()}</div>
        <span class="user-name">{client.authProvider()?.name || '未登录'}</span>
        {#if client.authProvider()?.status === 'authenticated'}<span class="badge-pro">Pro</span>{/if}
      </div>
    </nav>

    <!-- Content -->
    <main class="sp-content">
      {#if msg}<div class="toast" class:err={msg.type === 'err'}>{msg.text}</div>{/if}
      <div class="sp-col">

      {#if active === 'general'}
        <h2>常规</h2>
        <p class="sub-desc">外观偏好和应用设置</p>
        <div class="scard">
          <span class="lab"><span class="t">界面主题</span><span class="d">深色 / 浅色 / 跟随系统</span></span>
          <div class="seg">
            <button class="seg-btn" class:on={!client.colorScheme() || client.colorScheme() === 'dark'} onclick={() => client.client.setColorScheme('dark')}>深色</button>
            <button class="seg-btn" class:on={client.colorScheme() === 'light'} onclick={() => client.client.setColorScheme('light')}>浅色</button>
            <button class="seg-btn" class:on={client.colorScheme() === 'system'} onclick={() => client.client.setColorScheme('system')}>跟随系统</button>
          </div>
        </div>
        <div class="scard">
          <span class="lab"><span class="t">字体大小</span><span class="d">UI 字体大小 (px)</span></span>
          <span class="slider-wrap">
            <input type="range" min="12" max="18" value={client.uiFontSize()} oninput={(e) => client.client.setUiFontSize(parseInt((e.target as HTMLInputElement).value))} class="slider" style="--pct:{((client.uiFontSize() - 12) / 6) * 100}%" />
            <span class="mono-val">{client.uiFontSize()}</span>
          </span>
        </div>
        <label class="scard toggle-card">
          <span class="lab"><span class="t">遥测</span><span class="d">发送匿名使用数据</span></span>
          <button class="toggle" class:on={client.config()?.telemetry} onclick={() => toggleConfig('telemetry', !client.config()?.telemetry)} aria-label="切换遥测"></button>
        </label>
        <label class="scard toggle-card">
          <span class="lab"><span class="t">合并所有 Skills</span><span class="d">自动合并所有来源的技能</span></span>
          <button class="toggle" class:on={client.config()?.mergeAllAvailableSkills} onclick={() => toggleConfig('mergeAllAvailableSkills', !client.config()?.mergeAllAvailableSkills)} aria-label="切换合并 Skills"></button>
        </label>
        <h3>诊断</h3>
        <div class="scard">
          <span class="lab"><span class="t">内嵌 Agent</span><span class="d">应用私有代理进程，随应用启动/退出</span></span>
          <span class="mono-val">{daemon.state.origin ?? '—'}</span>
          <span class="okchip">● {daemon.state.status === 'connected' ? '已连接' : '未连接'}</span>
        </div>
        <div class="scard">
          <span class="lab"><span class="t">版本</span><span class="d">Kimi Code Desktop · daemon {client.serverVersion() || '未知'}</span></span>
          <button class="btn sm" onclick={() => { msg = { type: 'ok', text: '已是最新版本' }; setTimeout(() => msg = null, 2000); }} type="button">检查更新</button>
        </div>

      {:else if active === 'preview'}
        <h2>代码预览</h2>
        <p class="sub-desc">文件预览的显示偏好</p>
        <div class="scard">
          <span class="lab"><span class="t">默认渲染模式</span><span class="d">文件预览的默认显示方式</span></span>
          <div class="seg">
            <button class="seg-btn" class:on={previewMode === 'source'} onclick={() => { previewMode = 'source'; localStorage.setItem('kode.preview-mode', 'source'); }} type="button">源码</button>
            <button class="seg-btn" class:on={previewMode === 'markdown'} onclick={() => { previewMode = 'markdown'; localStorage.setItem('kode.preview-mode', 'markdown'); }} type="button">Markdown</button>
            <button class="seg-btn" class:on={previewMode === 'html'} onclick={() => { previewMode = 'html'; localStorage.setItem('kode.preview-mode', 'html'); }} type="button">HTML</button>
          </div>
        </div>
        <div class="scard">
          <span class="lab"><span class="t">Diff 展开方式</span><span class="d">工具调用中的 diff 默认状态</span></span>
          <div class="seg">
            <button class="seg-btn" class:on={!diffAutoExpand} onclick={() => { diffAutoExpand = false; localStorage.setItem('kode.diff-expand', 'false'); }} type="button">折叠</button>
            <button class="seg-btn" class:on={diffAutoExpand} onclick={() => { diffAutoExpand = true; localStorage.setItem('kode.diff-expand', 'true'); }} type="button">展开</button>
          </div>
        </div>
        <div class="scard">
          <span class="lab"><span class="t">语法高亮主题</span><span class="d">代码块的配色方案</span></span>
          <div class="seg">
            <button class="seg-btn" class:on={hlTheme === 'one-dark'} onclick={() => { hlTheme = 'one-dark'; localStorage.setItem('kode.hl-theme', 'one-dark'); }} type="button">One Dark</button>
            <button class="seg-btn" class:on={hlTheme === 'github-dark'} onclick={() => { hlTheme = 'github-dark'; localStorage.setItem('kode.hl-theme', 'github-dark'); }} type="button">GitHub Dark</button>
            <button class="seg-btn" class:on={hlTheme === 'dracula'} onclick={() => { hlTheme = 'dracula'; localStorage.setItem('kode.hl-theme', 'dracula'); }} type="button">Dracula</button>
          </div>
        </div>

      {:else if active === 'models'}
        <h2>模型设置</h2>
        <p class="sub-desc">管理模型供应商，配置后可在聊天时选择使用</p>

        <!-- Kimi binding card (design draft: provider binding + plan row) -->
        <div class="bind-card">
          <div class="bind-head">
            <span class="bind-name">Kimi</span>
            {#if client.authProvider()?.status === 'authenticated'}<span class="okchip">已启用</span>{/if}
            <span class="bind-right">{client.authProvider()?.status === 'authenticated' ? '连接方式: 个人套餐' : '未连接'}</span>
          </div>
          <div class="bind-body">
            <div class="bind-plan">
              <span class="t">{client.authProvider()?.status === 'authenticated' ? (client.authProvider()?.name ?? 'Kimi 账号') : 'Kimi 账号'}</span>
              <span class="d">{#if client.authProvider()?.status === 'authenticated'}订阅生效中 · 第一方模型可用{:else}登录后可使用 Kimi K2 等第一方模型，无需 API Key{/if}</span>
            </div>
            {#if client.authProvider()?.status === 'authenticated'}
              <button class="btn sm" onclick={() => { msg = { type: 'ok', text: '账号管理（浏览器打开）' }; setTimeout(() => msg = null, 2000); }} type="button">管理</button>
              <button class="btn ghost-acc sm" onclick={() => { void client.client.logout(); }} type="button">解绑</button>
            {:else}
              <button class="btn pri sm" onclick={() => { void client.client.startOAuthLogin(); }} type="button">登录 Kimi</button>
            {/if}
          </div>
        </div>

        <!-- Quota bars (structure per draft; fills render only when quota data exists) -->
        <div class="quota-row">
          <div class="quota-card">
            <div class="quota-t"><span>Token 额度</span><span class="mono pct">—</span></div>
            <div class="bar"><i style="width:0%"></i></div>
            <div class="quota-m mono">额度数据即将接入</div>
          </div>
          <div class="quota-card">
            <div class="quota-t"><span>MCP 额度</span><span class="mono pct purple">—</span></div>
            <div class="bar purple"><i style="width:0%"></i></div>
            <div class="quota-m mono">额度数据即将接入</div>
          </div>
        </div>

        <h3>模型列表</h3>
        {#if client.models().length > 0}
          {#each client.models() as m (m.id)}
            <div class="item-row">
              <span class="isq"><Icon name="sparkles" size="sm" /></span>
              <span class="ir">
                <span class="it">{m.displayName || m.id}{#if m.id === client.defaultModel()}<span class="defchip">默认</span>{/if}</span>
                <span class="id mono">{m.provider} · {kFmt(m.maxContextSize)} context</span>
              </span>
              {#if m.id !== client.defaultModel()}
                <button class="btn sm" onclick={() => { void client.client.setDefaultModel(m.id); }} type="button">设为默认</button>
              {/if}
            </div>
          {/each}
        {:else}
          <p class="empty-text">暂无模型。请先在下方添加供应商。</p>
        {/if}

        <h3>自定义供应商</h3>
        {#each client.providers() as p (p.id)}
          <div class="item-row">
            <span class="isq"><Icon name="server" size="sm" /></span>
            <span class="ir">
              <span class="it">{p.id}</span>
              <span class="id mono">{p.type}{#if p.baseUrl} · {p.baseUrl}{/if}</span>
            </span>
            {#if p.status === 'connected'}<span class="okchip">已连接</span>
            {:else if p.status === 'error'}<span class="warnchip">错误</span>
            {:else}<span class="warnchip">未配置</span>{/if}
            {#if p.hasApiKey}
              <button class="btn sm" onclick={() => { void client.client.refreshProviderModels(p.id); }} type="button">↻</button>
              <button class="btn sm" onclick={() => { editingProvider = p.id; providerApiKey = ''; showEditProvider = true; }} type="button">更新 Key</button>
            {:else}
              <button class="btn sm" onclick={() => { editingProvider = p.id; providerApiKey = ''; showEditProvider = true; }} type="button">配置</button>
            {/if}
          </div>
        {/each}

        {#if showAddProvider}
          <div class="scard add-model-form">
            <div class="form-row-vertical"><span class="form-lbl">供应商 ID</span><input class="form-input" bind:value={newProviderId} placeholder="my-openai" /></div>
            <div class="form-row-vertical"><span class="form-lbl">类型</span>
              <select class="form-input" bind:value={newProviderType}>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="kimi">Kimi</option>
                <option value="google-genai">Google GenAI</option>
                <option value="openai_responses">OpenAI Responses</option>
              </select>
            </div>
            <div class="form-row-vertical"><span class="form-lbl">API Key</span><input class="form-input" type="password" bind:value={newProviderKey} placeholder="sk-..." /></div>
            <div class="form-row-vertical"><span class="form-lbl">Base URL (可选)</span><input class="form-input" bind:value={newProviderUrl} placeholder="https://api.openai.com/v1" /></div>
            <div class="form-actions">
              <button class="btn sm" onclick={() => showAddProvider = false} type="button">取消</button>
              <button class="btn pri sm" onclick={async () => {
                if (!newProviderId.trim()) return;
                await client.client.saveProvider(newProviderId.trim(), {
                  type: newProviderType,
                  apiKey: newProviderKey.trim() || undefined,
                  baseUrl: newProviderUrl.trim() || undefined,
                });
                showAddProvider = false;
                newProviderId = ''; newProviderKey = ''; newProviderUrl = '';
              }} type="button">添加</button>
            </div>
          </div>
        {:else}
          <button class="dashed-btn" onclick={() => showAddProvider = true} type="button">+ 添加供应商</button>
        {/if}

        {#if showEditProvider}
          <div class="scard add-model-form">
            <div class="form-row-vertical"><span class="form-lbl">更新 {editingProvider} 的 API Key</span><input class="form-input" type="password" bind:value={providerApiKey} placeholder="输入新的 API Key" /></div>
            <div class="form-actions">
              <button class="btn sm" onclick={() => showEditProvider = false} type="button">取消</button>
              <button class="btn pri sm" onclick={async () => {
                if (!editingProvider || !providerApiKey.trim()) return;
                const existing = client.providers().find((p) => p.id === editingProvider);
                await client.client.saveProvider(editingProvider, {
                  type: existing?.type ?? 'openai',
                  apiKey: providerApiKey.trim(),
                  baseUrl: existing?.baseUrl,
                });
                showEditProvider = false; providerApiKey = '';
              }} type="button">保存</button>
            </div>
          </div>
        {/if}

        <h3>自定义模型</h3>
        {#if showAddModel}
          <div class="scard add-model-form">
            <div class="form-row-vertical"><span class="form-lbl">别名</span><input class="form-input" bind:value={newModelAlias} placeholder="my-model" /></div>
            <div class="form-row-vertical"><span class="form-lbl">供应商 ID</span><input class="form-input" bind:value={newModelProvider} placeholder="openai" /></div>
            <div class="form-row-vertical"><span class="form-lbl">模型名</span><input class="form-input" bind:value={newModelName} placeholder="gpt-4o" /></div>
            <div class="form-row-vertical"><span class="form-lbl">Context 大小</span><input class="form-input" type="number" bind:value={newModelContext} placeholder="128000" /></div>
            <div class="form-row-vertical"><span class="form-lbl">显示名 (可选)</span><input class="form-input" bind:value={newModelDisplay} placeholder="GPT-4o" /></div>
            <div class="form-actions">
              <button class="btn sm" onclick={() => showAddModel = false} type="button">取消</button>
              <button class="btn pri sm" onclick={async () => {
                if (!newModelAlias.trim() || !newModelProvider.trim() || !newModelName.trim()) return;
                await client.client.saveModelAlias(newModelAlias.trim(), {
                  provider: newModelProvider.trim(),
                  model: newModelName.trim(),
                  maxContextSize: parseInt(newModelContext) || 128000,
                  displayName: newModelDisplay.trim() || undefined,
                });
                showAddModel = false;
                newModelAlias = ''; newModelProvider = ''; newModelName = '';
                newModelContext = '128000'; newModelDisplay = '';
              }} type="button">添加</button>
            </div>
          </div>
        {:else}
          <button class="dashed-btn" onclick={() => showAddModel = true} type="button">+ 添加自定义模型</button>
        {/if}

      {:else if active === 'subagents'}
        <h2>子智能体</h2>
        <p class="sub-desc">查看和管理子智能体 profile</p>
        <div class="list-meta"><span>已安装 0 项</span><span class="dim-i">来自已启用插件，当前只读</span></div>
        <div class="item-row">
          <span class="isq purple"><Icon name="git-branch" size="sm" /></span>
          <span class="ir">
            <span class="it">coder</span>
            <span class="id mono">通用代码编写 agent · 定义文件位于 agent 私有 home 的 agents/ 目录</span>
          </span>
          <span class="pchip">插件</span>
        </div>
        <p class="empty-text">管理界面即将推出；当前页展示结构与设计稿一致，数据接入后自动填充。</p>

      {:else if active === 'plugins'}
        <h2>插件管理 <span class="beta-badge">Beta</span></h2>
        <p class="sub-desc">技能 / MCP / 命令统一由插件承载；启用或停用已安装的插件</p>
        <div class="list-controls">
          <div class="seg">
            <button class="seg-btn" class:on={pluginTab === 'installed'} onclick={() => pluginTab = 'installed'} type="button">已安装</button>
            <button class="seg-btn" class:on={pluginTab === 'discover'} onclick={() => pluginTab = 'discover'} type="button">发现</button>
          </div>
          <div class="searchbox"><Icon name="search" size="sm" /><span>搜索插件…</span></div>
        </div>
        {#if pluginTab === 'installed'}
          <PluginPanel />
        {:else}
          <p class="empty-text">插件市场即将上线。</p>
        {/if}

      {:else if active === 'commands'}
        <h2>命令</h2>
        <p class="sub-desc">自定义斜杠命令（与插件命令一起出现在 / 菜单）</p>
        <div class="list-controls">
          <div class="searchbox"><Icon name="search" size="sm" /><span>搜索命令…</span></div>
        </div>
        <div class="item-row">
          <span class="isq"><Icon name="bolt" size="sm" /></span>
          <span class="ir">
            <span class="it">自定义命令</span>
            <span class="id">命令文件位于项目 .kimi/commands/ 与全局 commands/ 目录；管理界面即将推出</span>
          </span>
          <button class="btn sm" disabled type="button">＋ 新建</button>
        </div>

      {:else if active === 'index'}
        <h2>索引库</h2>
        <p class="sub-desc">工作区文件索引，支撑 @ 提及与语义搜索</p>
        <div class="list-controls">
          <div class="searchbox"><Icon name="search" size="sm" /><span>搜索工作区…</span></div>
        </div>
        {#each client.workspaces() as ws (ws.id)}
          <div class="item-row">
            <span class="isq"><Icon name="folder-solid" size="sm" /></span>
            <span class="ir">
              <span class="it">{ws.name}</span>
              <span class="id mono">@ 提及当前基于实时文件搜索；语义索引即将推出</span>
            </span>
            <button class="btn sm" disabled type="button">重建索引</button>
          </div>
        {/each}

      {:else if active === 'usage'}
        <h2>使用统计</h2>
        <p class="sub-desc">Token 用量、费用和额度概览</p>
        {#if usage}
          <div class="usage-hero">
            <!-- Main stat card (gradient header + 2×2 big numbers) -->
            <div class="hero-main">
              <div class="hero-head">
                <span class="hero-tag">当前会话</span>
                <span class="defchip">{client.activeSessionModel() || client.defaultModel() || '默认模型'}</span>
              </div>
              <div class="hero-grid">
                <div><div class="hg-l">输入 Token</div><div class="hg-v mono">{kFmt(usage.inputTokens)}</div></div>
                <div><div class="hg-l">输出 Token</div><div class="hg-v mono">{kFmt(usage.outputTokens)}</div></div>
                <div><div class="hg-l">缓存命中</div><div class="hg-v mono acc">{kFmt(usage.cacheReadTokens)}</div></div>
                <div><div class="hg-l">费用</div><div class="hg-v mono ok">${usage.totalCostUsd.toFixed(4)}</div></div>
              </div>
            </div>
            <!-- Context ring card -->
            <div class="hero-ring">
              <div class="ring-wrap">
                <svg width="80" height="80" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="var(--ac-soft)" stroke-width="6" />
                  <circle cx="40" cy="40" r="34" fill="none" stroke="url(#ringGrad)" stroke-width="6" stroke-linecap="round"
                    stroke-dasharray={RING_C} stroke-dashoffset={RING_C * (1 - ringPct)} transform="rotate(-90 40 40)" />
                  <defs>
                    <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stop-color="#4fa8ff" />
                      <stop offset="100%" stop-color="#5bc0be" />
                    </linearGradient>
                  </defs>
                </svg>
                <div class="ring-c"><div class="mono ring-pct">{Math.round(ringPct * 100)}%</div><div class="ring-l">Context</div></div>
              </div>
              <div class="ring-m mono">{kFmt(usage.contextTokens)} / {kFmt(usage.contextLimit)}</div>
            </div>
          </div>
        {:else}
          <p class="empty-text">选择会话后显示用量数据。</p>
        {/if}

        <h3>额度概览</h3>
        <div class="quota-row">
          <div class="quota-card">
            <div class="quota-t"><span>模型额度</span><span class="mono pct">—</span></div>
            <div class="bar"><i style="width:0%"></i></div>
            <div class="quota-m mono">额度数据即将接入</div>
          </div>
          <div class="quota-card">
            <div class="quota-t"><span>MCP 额度</span><span class="mono pct purple">—</span></div>
            <div class="bar purple"><i style="width:0%"></i></div>
            <div class="quota-m mono">额度数据即将接入</div>
          </div>
        </div>

        <h3>按工作区</h3>
        {#if usage}
          <div class="ws-bar-row">
            <span class="ws-name">{client.activeSession()?.title ?? '当前会话'}</span>
            <div class="bar grad"><i style="width:100%"></i></div>
            <span class="mono ws-tok">{kFmt(usage.inputTokens + usage.outputTokens)}</span>
            <span class="mono ws-cost">${usage.totalCostUsd.toFixed(4)}</span>
          </div>
        {:else}
          <p class="empty-text">暂无数据。</p>
        {/if}

      {:else if active === 'guide'}
        <h2>引导</h2>
        <p class="sub-desc">重新查看首次启动引导或了解快捷键</p>
        <div class="scard">
          <span class="lab"><span class="t">新手引导</span><span class="d">包含 Kimi 登录与主题选择，可随时重新打开</span></span>
          <button class="btn ghost-acc sm" onclick={() => { client.client.setOnboarded(false); onnavigate(); }} type="button">重新打开 →</button>
        </div>
        <h3>快捷键</h3>
        {#each [['⌘K', '命令面板'], ['⌘N', '新建对话'], ['⌘B', '切换侧栏'], ['⌘J', '切换右栏'], ['⌘S', 'Steer (注入运行中)'], ['⌘.', '中断当前'], ['Esc', '返回 / 关闭']] as [key, desc]}
          <div class="key-row">
            <span class="key-desc">{desc}</span>
            <kbd class="keycap">{key}</kbd>
          </div>
        {/each}
      {/if}

      </div>
    </main>
  </div>
</div>

<style>
  .settings-page { display: flex; flex-direction: column; height: 100%; width: 100%; overflow: hidden; animation: spIn 0.18s var(--ease); }
  @keyframes spIn { from { opacity: 0; transform: translateY(6px); } }

  /* ---- Top header ---- */
  .sp-header { flex: none; height: 40px; display: flex; align-items: center; padding: 0 16px; background: var(--l1); border-bottom: 1px solid var(--bd); }
  .sp-header-t { font-size: 13px; color: var(--tx2); font-weight: 500; }
  .sp-header-r { margin-left: auto; display: flex; align-items: center; gap: 6px; }
  .sp-header-r .hint { font-size: 10px; color: var(--tx3); }
  .kbd { font-family: var(--font-mono); font-size: 10px; border: 1px solid var(--bd2); border-radius: 4px; padding: 1px 5px; color: var(--tx3); }

  .sp-body { flex: 1; display: flex; overflow: hidden; }

  /* ---- Left nav ---- */
  .sp-nav { width: 220px; flex: none; height: 100%; display: flex; flex-direction: column; background: var(--l1); border-right: 1px solid var(--bd); padding: 12px 8px; overflow-y: auto; }
  .sp-back { display: flex; align-items: center; gap: 7px; padding: 7px 10px; border: none; border-radius: var(--r-md); background: transparent; font-size: 12.5px; color: var(--tx2); cursor: pointer; transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease); }
  .sp-back:hover { background: var(--ac-soft); color: var(--tx); }
  .sp-divider { height: 1px; background: var(--bd); margin: 8px 4px; }
  .sp-tab { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; border: none; border-radius: var(--r-md); background: transparent; font-size: 13px; color: var(--tx2); cursor: pointer; text-align: left; transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease); }
  .sp-tab:hover { background: var(--color-hover); color: var(--tx); }
  .sp-tab.on { background: var(--ac-soft); color: var(--ac); border-left: 2px solid var(--ac); padding-left: 8px; font-weight: 600; }
  .sp-foot { display: flex; align-items: center; gap: 8px; padding: 4px; }
  .sp-foot .avatar { width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #4fa8ff, #5bc0be); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; }
  .sp-foot .user-name { font-size: 11px; color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge-pro { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 99px; background: var(--amb-soft); color: var(--amb); }

  /* ---- Content ---- */
  .sp-content { flex: 1; overflow-y: auto; }
  .sp-col { max-width: 680px; margin: 0 auto; padding: 32px 40px 60px; }
  .sp-col h2 { font-size: 20px; font-weight: 600; color: var(--tx); margin: 0 0 4px; }
  .sp-col h3 { font-size: 12px; font-weight: 600; color: var(--ac); margin: 24px 0 12px; letter-spacing: 0.04em; text-transform: uppercase; }
  .sub-desc { font-size: 12px; color: var(--tx3); margin: 0 0 20px; }

  /* ---- Row cards ---- */
  .scard { display: flex; align-items: center; gap: 16px; padding: 14px 18px; margin-bottom: 10px; border: 1px solid var(--bd); border-radius: 14px; background: var(--l2); box-shadow: var(--toplight); font-size: 13px; }
  .scard .lab { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .scard .lab .t { font-size: 13px; font-weight: 500; color: var(--tx); }
  .scard .lab .d { font-size: 11px; color: var(--tx3); }
  .toggle-card { cursor: pointer; }
  .mono-val { font-family: var(--font-mono); font-size: 11px; color: var(--tx2); }

  .seg { display: inline-flex; border: 1px solid var(--bd2); border-radius: var(--r-md); overflow: hidden; }
  .seg-btn { padding: 5px 12px; border: none; background: transparent; color: var(--tx2); font-size: 12px; cursor: pointer; transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease); }
  .seg-btn.on { background: var(--ac-soft); color: var(--ac); font-weight: 600; }

  .slider-wrap { display: flex; align-items: center; gap: 10px; }
  .slider { width: 140px; height: 4px; -webkit-appearance: none; appearance: none; border-radius: 2px; background: linear-gradient(90deg, var(--ac) var(--pct, 50%), var(--bd2) var(--pct, 50%)); outline: none; cursor: pointer; }
  .slider::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.3); cursor: pointer; }

  .toggle { width: 36px; height: 20px; border-radius: 999px; border: none; background: var(--bd2); cursor: pointer; position: relative; transition: background 0.2s; flex: none; }
  .toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--tx2); transition: left 0.2s var(--ease), background 0.2s var(--ease); }
  .toggle.on { background: var(--ac); }
  .toggle.on::after { left: 18px; background: #fff; }

  .btn { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 12px; border-radius: var(--r-md); font-size: 12px; font-weight: 600; border: 1px solid var(--bd2); color: var(--tx2); background: transparent; cursor: pointer; white-space: nowrap; transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease), border-color var(--duration-fast) var(--ease); }
  .btn:hover:not(:disabled) { color: var(--tx); border-color: var(--tx3); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.pri { background: var(--ac); border-color: transparent; color: #fff; }
  .btn.pri:hover:not(:disabled) { background: var(--ac-h); color: #fff; }
  .btn.ghost-acc { border-color: var(--ac-bd); color: var(--ac); background: var(--ac-soft); }
  .btn.ghost-acc:hover:not(:disabled) { border-color: var(--ac); color: var(--ac); }
  .btn.sm { height: 26px; padding: 0 10px; font-size: 11px; }

  .okchip { font-size: 10px; color: var(--ok); background: var(--ok-soft); border-radius: 99px; padding: 2px 8px; white-space: nowrap; }
  .warnchip { font-size: 10px; color: var(--warn); background: var(--warn-soft); border-radius: 99px; padding: 2px 8px; white-space: nowrap; }
  .defchip { font-size: 10px; color: var(--ac); background: var(--ac-soft); border-radius: 99px; padding: 2px 8px; font-weight: 600; }
  .pchip { font-size: 10px; color: var(--color-done); background: var(--color-done-soft); border-radius: 99px; padding: 2px 8px; font-weight: 600; }
  .beta-badge { font-size: 10px; padding: 2px 8px; border-radius: 99px; background: var(--ac-soft); color: var(--ac); vertical-align: middle; font-weight: 600; }
  .keycap { font-family: var(--font-mono); font-size: 11px; padding: 3px 10px; border-radius: var(--r-md); background: var(--ac-soft); color: var(--ac); border: 1px solid var(--ac-bd); }
  .empty-text { color: var(--tx3); font-size: 13px; }

  /* ---- Binding card (Kimi provider, gradient brand border) ---- */
  .bind-card { border-radius: 14px; padding: 18px; margin-bottom: 12px; background: linear-gradient(135deg, rgba(79,168,255,0.10), rgba(91,192,190,0.05)); border: 1px solid var(--ac-bd); }
  .bind-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .bind-name { font-size: 15px; font-weight: 600; color: var(--tx); }
  .bind-right { margin-left: auto; font-size: 12px; color: var(--tx2); }
  .bind-body { display: flex; align-items: center; gap: 10px; padding-top: 12px; border-top: 1px solid var(--bd); }
  .bind-plan { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .bind-plan .t { font-size: 13px; font-weight: 500; color: var(--tx); }
  .bind-plan .d { font-size: 11px; color: var(--tx3); }

  /* ---- Quota bars ---- */
  .quota-row { display: flex; gap: 10px; margin-bottom: 12px; }
  .quota-card { flex: 1; border-radius: 14px; background: var(--l2); border: 1px solid var(--bd); box-shadow: var(--toplight); padding: 16px; }
  .quota-t { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 11px; color: var(--tx2); }
  .quota-t .pct { font-size: 11px; color: var(--ac); }
  .quota-t .pct.purple { color: var(--color-done); }
  .bar { height: 6px; border-radius: 3px; background: var(--ac-soft); overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: 3px; background: var(--ac); transition: width 0.3s var(--ease); }
  .bar.purple { background: var(--color-done-soft); }
  .bar.purple i { background: var(--color-done); }
  .bar.grad i { background: linear-gradient(90deg, #4fa8ff, #5bc0be); }
  .quota-m { font-size: 10px; color: var(--tx3); margin-top: 6px; }

  /* ---- Item rows (icon square + title + desc + controls) ---- */
  .item-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 12px; background: var(--l2); border: 1px solid var(--bd); box-shadow: var(--toplight); margin-bottom: 8px; }
  .isq { width: 28px; height: 28px; border-radius: 8px; background: var(--ac-soft); color: var(--ac); display: flex; align-items: center; justify-content: center; flex: none; }
  .isq.purple { background: var(--color-done-soft); color: var(--color-done); }
  .ir { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .it { font-size: 13px; font-weight: 500; color: var(--tx); display: flex; align-items: center; gap: 6px; }
  .id { font-size: 11px; color: var(--tx3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .id.mono { font-family: var(--font-mono); }
  .list-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; font-size: 11px; color: var(--tx2); }
  .list-meta .dim-i { color: var(--tx3); font-style: italic; }
  .list-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .searchbox { flex: 1; display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: var(--r-lg); background: var(--l1); border: 1px solid var(--bd); color: var(--tx3); font-size: 12px; }

  /* ---- Usage hero ---- */
  .usage-hero { display: flex; gap: 16px; margin-bottom: 12px; }
  .hero-main { flex: 2; border-radius: 14px; background: linear-gradient(135deg, rgba(79,168,255,0.10), rgba(91,192,190,0.04)); border: 1px solid var(--ac-bd); padding: 20px; }
  .hero-head { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .hero-tag { font-size: 11px; color: var(--ac); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .hero-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .hg-l { font-size: 10px; color: var(--tx3); margin-bottom: 4px; }
  .hg-v { font-size: 20px; color: var(--tx); font-weight: 600; }
  .hg-v.acc { color: var(--ac); }
  .hg-v.ok { color: var(--ok); }
  .hero-ring { flex: 1; border-radius: 14px; background: var(--l2); border: 1px solid var(--bd); box-shadow: var(--toplight); padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
  .ring-wrap { position: relative; width: 80px; height: 80px; }
  .ring-c { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }
  .ring-pct { font-size: 16px; font-weight: 600; color: var(--tx); }
  .ring-l { font-size: 9px; color: var(--tx3); }
  .ring-m { font-size: 10px; color: var(--tx2); }
  .ws-bar-row { display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-radius: 12px; background: var(--l1); border: 1px solid var(--bd); margin-bottom: 6px; }
  .ws-name { font-size: 13px; color: var(--tx); min-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ws-bar-row .bar { flex: 1; }
  .ws-tok { font-size: 11px; color: var(--tx2); min-width: 50px; text-align: right; }
  .ws-cost { font-size: 11px; color: var(--ok); min-width: 56px; text-align: right; }

  /* ---- Shortcut rows ---- */
  .key-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 18px; border-radius: 10px; background: var(--l1); border: 1px solid var(--bd); margin-bottom: 4px; }
  .key-desc { font-size: 13px; color: var(--tx2); }

  /* ---- Forms ---- */
  .add-model-form { flex-direction: column; align-items: stretch; gap: 10px; display: flex; }
  .form-row-vertical { display: flex; flex-direction: column; gap: 3px; }
  .form-lbl { font-size: 11px; color: var(--tx3); }
  .form-input { padding: 6px 10px; border-radius: var(--r-md); background: var(--l1); border: 1px solid var(--bd); color: var(--tx); font-size: 12px; outline: none; font-family: inherit; }
  .form-input:focus { border-color: var(--ac); }
  .form-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .dashed-btn { width: 100%; padding: 14px; border: 1.5px dashed var(--ac-bd); border-radius: 14px; background: transparent; color: var(--ac); font-size: 13px; cursor: pointer; font-family: inherit; opacity: 0.8; transition: border-color var(--duration-fast) var(--ease), background var(--duration-fast) var(--ease), opacity var(--duration-fast) var(--ease); }
  .dashed-btn:hover { border-color: var(--ac); background: var(--ac-soft); opacity: 1; }

  .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 9px 16px; border-radius: 99px; background: var(--l3); border: 1px solid var(--bd2); color: var(--ok); font-size: 12px; z-index: 500; box-shadow: var(--sh-lg); }
  .toast.err { color: var(--err); }
</style>
