<!-- SettingsView.svelte — full-window settings page: left nav with indicator,
     centered row-card content, 9 sections (skills/MCP folded into plugins). -->
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
</script>

<svelte:window onkeydown={onKeydown} />

<div class="settings-page">
  <!-- Left nav -->
  <nav class="sp-nav">
    <button class="sp-back" onclick={onnavigate}><Icon name="arrow-left" size="sm" /> 返回工作区</button>
    <div class="sp-tabs">
      {#each navItems as item (item.id)}
        <button class="sp-tab" class:on={active === item.id} onclick={() => active = item.id}>
          <Icon name={item.icon} size="sm" />
          <span>{item.label}</span>
        </button>
      {/each}
    </div>
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
      <p class="desc">外观、语言与系统行为</p>
      <div class="scard">
        <span class="lab"><span class="t">界面主题</span><span class="d">磨砂明暗双主题，实时切换</span></span>
        <div class="seg">
          <button class="seg-btn" class:on={!client.colorScheme() || client.colorScheme() === 'dark'} onclick={() => client.client.setColorScheme('dark')}>深色</button>
          <button class="seg-btn" class:on={client.colorScheme() === 'light'} onclick={() => client.client.setColorScheme('light')}>浅色</button>
          <button class="seg-btn" class:on={client.colorScheme() === 'system'} onclick={() => client.client.setColorScheme('system')}>跟随系统</button>
        </div>
      </div>
      <div class="scard">
        <span class="lab"><span class="t">字号</span><span class="d">调整界面文字显示大小</span></span>
        <input type="range" min="12" max="18" value={client.uiFontSize()} oninput={(e) => client.client.setUiFontSize(parseInt((e.target as HTMLInputElement).value))} class="slider" />
        <span class="mono-val">{client.uiFontSize()}</span>
      </div>
      <div class="sp-sec">隐私与数据</div>
      <label class="scard toggle-card">
        <span class="lab"><span class="t">遥测</span><span class="d">发送匿名使用数据，帮助改进产品</span></span>
        <button class="toggle" class:on={client.config()?.telemetry} onclick={() => toggleConfig('telemetry', !client.config()?.telemetry)} aria-label="切换遥测"></button>
      </label>
      <label class="scard toggle-card">
        <span class="lab"><span class="t">合并所有 Skills</span><span class="d">自动合并所有来源的技能</span></span>
        <button class="toggle" class:on={client.config()?.mergeAllAvailableSkills} onclick={() => toggleConfig('mergeAllAvailableSkills', !client.config()?.mergeAllAvailableSkills)} aria-label="切换合并 Skills"></button>
      </label>
      <div class="sp-sec">连接与版本</div>
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
      <p class="desc">文件预览和 Diff 显示偏好</p>
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
        <span class="lab"><span class="t">语法高亮主题</span><span class="d">5 色收敛色板，随主题切换</span></span>
        <div class="seg">
          <button class="seg-btn" class:on={hlTheme === 'one-dark'} onclick={() => { hlTheme = 'one-dark'; localStorage.setItem('kode.hl-theme', 'one-dark'); }} type="button">One Dark</button>
          <button class="seg-btn" class:on={hlTheme === 'github-dark'} onclick={() => { hlTheme = 'github-dark'; localStorage.setItem('kode.hl-theme', 'github-dark'); }} type="button">GitHub Dark</button>
          <button class="seg-btn" class:on={hlTheme === 'dracula'} onclick={() => { hlTheme = 'dracula'; localStorage.setItem('kode.hl-theme', 'dracula'); }} type="button">Dracula</button>
        </div>
      </div>

    {:else if active === 'models'}
      <h2>模型设置</h2>
      <p class="desc">登录 Kimi 账号或配置其他模型服务</p>

      <!-- Kimi account card -->
      <div class="scard kimi-card">
        <span class="kav">K</span>
        <span class="lab">
          <span class="t">
            {client.authProvider()?.name ?? 'Kimi 账号'}
            {#if client.authProvider()?.status === 'authenticated'}<span class="prochip">Pro</span> <span class="okchip">● 已登录</span>{/if}
          </span>
          <span class="d">{#if client.authProvider()?.status === 'authenticated'}Kimi 订阅生效中 · 第一方模型可用{:else}登录后可使用 Kimi K2 等第一方模型，无需 API Key{/if}</span>
        </span>
        {#if client.authProvider()?.status === 'authenticated'}
          <button class="btn sm" onclick={() => { msg = { type: 'ok', text: '账号管理（浏览器打开）' }; setTimeout(() => msg = null, 2000); }} type="button">管理账号</button>
          <button class="btn dng sm" onclick={() => { void client.client.logout(); }} type="button">退出登录</button>
        {:else}
          <button class="btn pri sm" onclick={() => { void client.client.startOAuthLogin(); }} type="button">登录 Kimi</button>
        {/if}
      </div>

      <div class="sp-sec">模型</div>
      {#if client.models().length > 0}
        {#each client.models() as m (m.id)}
          <div class="scard">
            <span class="lab"><span class="t">{m.displayName || m.id}</span><span class="d mono-val">{m.provider} · {kFmt(m.maxContextSize)} context</span></span>
            {#if m.id === client.defaultModel()}
              <span class="defchip">默认</span>
            {:else}
              <button class="btn sm" onclick={() => { void client.client.setDefaultModel(m.id); }} type="button">设为默认</button>
            {/if}
          </div>
        {/each}
      {:else}
        <p class="empty-text">暂无模型。请先在下方添加供应商。</p>
      {/if}

      <div class="add-model-section">
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
      </div>

      <div class="sp-sec">供应商</div>
      <div style="display: flex; gap: 8px; margin-bottom: 4px;">
        <button class="btn sm" onclick={() => { void client.client.refreshProviders(); }} type="button">↻ 刷新全部</button>
        <button class="btn sm" onclick={() => { void client.client.refreshProviderModels('oauth'); }} type="button">↻ 刷新 OAuth 模型</button>
      </div>
      {#each client.providers() as p (p.id)}
        <div class="scard">
          <span class="lab"><span class="t">{p.id}</span><span class="d mono-val">{p.type}{#if p.baseUrl} · {p.baseUrl}{/if}</span></span>
          {#if p.status === 'connected'}
            <span class="okchip">● 已连接</span>
          {:else if p.status === 'error'}
            <span class="warnchip">错误</span>
          {:else}
            <span class="warnchip">未配置</span>
          {/if}
          {#if p.hasApiKey}
            <button class="btn sm" onclick={() => { void client.client.refreshProviderModels(p.id); }} type="button">↻ 刷新模型</button>
            <button class="btn sm" onclick={() => { editingProvider = p.id; providerApiKey = ''; showEditProvider = true; }} type="button">更新 Key</button>
          {:else}
            <button class="btn sm" onclick={() => { editingProvider = p.id; providerApiKey = ''; showEditProvider = true; }} type="button">配置</button>
          {/if}
        </div>
      {/each}

      <div class="add-model-section">
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
      </div>

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

    {:else if active === 'subagents'}
      <h2>子智能体</h2>
      <p class="desc">独立系统提示 + 工具白名单 + 默认模型；在侧栏「子智能体」模块中同样可见</p>
      <div class="scard"><span class="lab"><span class="t">子智能体定义</span><span class="d">定义文件位于 agent 私有 home 的 agents/ 目录；管理界面即将推出</span></span><button class="btn sm" disabled type="button">＋ 新建</button></div>

    {:else if active === 'plugins'}
      <PluginPanel />

    {:else if active === 'commands'}
      <h2>命令</h2>
      <p class="desc">自定义斜杠命令（与插件命令一起出现在 / 菜单）</p>
      <div class="scard"><span class="lab"><span class="t">自定义命令</span><span class="d">命令文件位于项目 .kimi/commands/ 与全局 commands/ 目录；管理界面即将推出</span></span><button class="btn sm" disabled type="button">＋ 新建命令</button></div>

    {:else if active === 'index'}
      <h2>索引库</h2>
      <p class="desc">工作区文件索引，支撑 @ 提及与语义搜索</p>
      <div class="scard"><span class="lab"><span class="t">工作区索引</span><span class="d">@ 提及当前基于实时文件搜索；语义索引即将推出</span></span><button class="btn sm" disabled type="button">重建索引</button></div>

    {:else if active === 'usage'}
      <h2>使用统计</h2>
      <p class="desc">当前会话 token 消耗</p>
      {#if client.activeSessionUsage()}
        {@const u = client.activeSessionUsage()!}
        <div class="stat-grid">
          <div class="stat"><div class="v">{kFmt(u.inputTokens)}</div><div class="l">输入 tokens</div></div>
          <div class="stat"><div class="v">{kFmt(u.outputTokens)}</div><div class="l">输出 tokens</div></div>
          <div class="stat"><div class="v">{kFmt(u.cacheReadTokens)}</div><div class="l">缓存读取</div></div>
          <div class="stat"><div class="v">${u.totalCostUsd.toFixed(4)}</div><div class="l">费用</div></div>
        </div>
      {:else}
        <p class="empty-text">暂无使用数据。</p>
      {/if}

    {:else if active === 'guide'}
      <h2>引导</h2>
      <p class="desc">重新查看首次启动引导（欢迎 → 登录 → 偏好）</p>
      <div class="scard">
        <span class="lab"><span class="t">新手引导</span><span class="d">包含 Kimi 登录与主题选择，可随时重新打开</span></span>
        <button class="btn pri sm" onclick={() => { client.client.setOnboarded(false); onnavigate(); }} type="button">重新打开引导</button>
      </div>
      <div class="sp-sec">快捷键</div>
      {#each [['⌘K', '命令面板'], ['⌘N', '新建对话'], ['⌘B', '切换侧栏'], ['⌘J', '切换右栏'], ['⌘S', 'Steer (注入运行中)'], ['⌘.', '中断当前'], ['Esc', '返回 / 关闭']] as [key, desc]}
        <div class="scard">
          <span class="lab"><span class="t" style="font-weight: 400; color: var(--tx2);">{desc}</span></span>
          <kbd class="keycap">{key}</kbd>
        </div>
      {/each}
    {/if}

    </div>
  </main>
</div>

<style>
  .settings-page { display: flex; height: 100%; width: 100%; overflow: hidden; animation: spIn 0.18s var(--ease); }
  @keyframes spIn { from { opacity: 0; transform: translateY(6px); } }

  /* ---- Left nav ---- */
  .sp-nav { width: 208px; flex: none; display: flex; flex-direction: column; background: var(--l1); border-right: 1px solid var(--bd); }
  .sp-back {
    display: flex; align-items: center; gap: 7px; margin: 12px 12px 8px; padding: 7px 10px;
    border: none; border-radius: var(--r-md); background: transparent;
    font-size: 12.5px; font-weight: 600; color: var(--tx2); cursor: pointer;
    transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease);
  }
  .sp-back:hover { background: var(--ac-soft); color: var(--tx); }
  .sp-tabs { flex: 1; overflow-y: auto; padding: 2px 8px; }
  .sp-tab {
    position: relative; display: flex; align-items: center; gap: 9px; width: 100%; height: 32px;
    padding: 0 10px; border: none; border-radius: var(--r-md); background: transparent;
    font-size: 12.5px; color: var(--tx2); cursor: pointer; text-align: left;
    transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease);
  }
  .sp-tab:hover { background: var(--ac-soft); color: var(--tx); }
  .sp-tab.on { background: var(--ac-soft); color: var(--ac); font-weight: 600; }
  .sp-tab.on::after {
    content: ""; position: absolute; right: -8px; top: 8px; bottom: 8px;
    width: 3px; border-radius: 99px; background: var(--ac);
  }
  .sp-foot { display: flex; align-items: center; gap: 8px; padding: 12px; border-top: 1px solid var(--bd); }
  .sp-foot .avatar { width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #4fa8ff, #5bc0be); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; }
  .sp-foot .user-name { font-size: 12px; font-weight: 500; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge-pro { font-size: 9px; color: var(--amb); border: 1px solid var(--amb); border-radius: 4px; padding: 0 4px; font-weight: 700; }

  /* ---- Content column ---- */
  .sp-content { flex: 1; overflow-y: auto; }
  .sp-col { max-width: 820px; margin: 0 auto; padding: 26px 32px 60px; display: flex; flex-direction: column; gap: 12px; }
  .sp-col h2 { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: var(--tx); }
  .sp-col .desc { font-size: 11.5px; color: var(--tx3); margin-top: -6px; margin-bottom: 4px; }
  .sp-sec { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--tx3); font-weight: 600; margin-top: 8px; }

  /* ---- Row cards ---- */
  .scard {
    display: flex; align-items: center; gap: 16px; padding: 15px 18px;
    border: 1px solid var(--bd); border-radius: var(--r-xl);
    background: var(--l2); box-shadow: var(--toplight);
    font-size: 13px;
  }
  .scard .lab { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .scard .lab .t { font-weight: 600; color: var(--tx); display: flex; gap: 8px; align-items: center; }
  .scard .lab .d { font-size: 11px; color: var(--tx3); }
  .toggle-card { cursor: pointer; }
  .mono-val { font-family: var(--font-mono); font-size: 11px; color: var(--tx2); }

  .seg { display: inline-flex; border: 1px solid var(--bd2); border-radius: var(--r-md); overflow: hidden; background: var(--l1); }
  .seg-btn { padding: 5px 14px; border: none; background: transparent; color: var(--tx2); font-size: 11.5px; font-weight: 500; cursor: pointer; transition: all var(--duration-fast) var(--ease); }
  .seg-btn.on { background: var(--ac); color: #fff; font-weight: 600; }
  .slider { width: 150px; accent-color: var(--ac); }

  .toggle { width: 30px; height: 17px; border-radius: 99px; border: none; background: var(--bd2); cursor: pointer; position: relative; transition: background 0.15s; flex: none; }
  .toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: #fff; transition: all 0.15s var(--ease); box-shadow: 0 1px 3px rgba(0,0,0,0.25); }
  .toggle.on { background: var(--ac); }
  .toggle.on::after { left: 15px; }

  .btn { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 12px; border-radius: var(--r-md); font-size: 12px; font-weight: 600; border: 1px solid var(--bd2); color: var(--tx2); background: transparent; cursor: pointer; transition: all var(--duration-fast) var(--ease); }
  .btn:hover:not(:disabled) { color: var(--tx); border-color: var(--tx3); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.pri { background: var(--ac); border-color: transparent; color: #fff; }
  .btn.pri:hover:not(:disabled) { background: var(--ac-h); color: #fff; }
  .btn.dng { border-color: var(--err); color: var(--err); }
  .btn.dng:hover:not(:disabled) { background: var(--err-soft); color: var(--err); }
  .btn.sm { height: 22px; padding: 0 9px; font-size: 11px; border-radius: var(--r-sm); }

  .okchip { font-size: 10px; color: var(--ok); background: var(--ok-soft); border-radius: 99px; padding: 2px 7px; white-space: nowrap; }
  .warnchip { font-size: 10px; color: var(--warn); background: var(--warn-soft); border-radius: 99px; padding: 2px 7px; white-space: nowrap; }
  .defchip { font-size: 10px; color: var(--ac); background: var(--ac-soft); border-radius: 4px; padding: 2px 7px; font-weight: 600; }
  .prochip { font-size: 9px; color: var(--amb); border: 1px solid var(--amb); border-radius: 4px; padding: 0 4px; font-weight: 700; }
  .keycap { font-family: var(--font-mono); font-size: 11px; padding: 3px 10px; border-radius: var(--r-md); background: var(--ac-soft); color: var(--ac); border: 1px solid var(--ac-bd); }
  .empty-text { color: var(--tx3); font-size: 12px; }

  /* Kimi account card */
  .kimi-card .kav { width: 38px; height: 38px; border-radius: var(--r-lg); background: linear-gradient(135deg, #4fa8ff, #5bc0be); color: #fff; font-weight: 700; font-size: 15px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 16px rgba(79, 168, 255, 0.30); flex: none; }

  /* Usage stats */
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .stat { border: 1px solid var(--bd); border-radius: var(--r-xl); background: var(--l2); box-shadow: var(--toplight); padding: 16px 18px; }
  .stat .v { font-size: 22px; font-weight: 700; font-family: var(--font-mono); letter-spacing: -0.02em; color: var(--tx); }
  .stat .l { font-size: 11px; color: var(--tx3); margin-top: 4px; }

  /* Model/provider CRUD */
  .add-model-section { margin-top: 0; }
  .add-model-form { flex-direction: column; align-items: stretch; gap: 10px; display: flex; }
  .form-row-vertical { display: flex; flex-direction: column; gap: 3px; }
  .form-lbl { font-size: 11px; color: var(--tx3); }
  .form-input { padding: 6px 10px; border-radius: var(--r-md); background: var(--l1); border: 1px solid var(--bd); color: var(--tx); font-size: 12px; outline: none; font-family: inherit; }
  .form-input:focus { border-color: var(--ac); }
  .form-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .dashed-btn { width: 100%; padding: 13px; border: 1.5px dashed var(--bd2); border-radius: var(--r-lg); background: transparent; color: var(--ac); font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all var(--duration-fast) var(--ease); font-family: inherit; }
  .dashed-btn:hover { border-color: var(--ac); background: var(--ac-soft); }

  .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 9px 16px; border-radius: 99px; background: var(--l3); border: 1px solid var(--bd2); color: var(--ok); font-size: 12px; z-index: 500; box-shadow: var(--sh-lg); }
  .toast.err { color: var(--err); }
</style>
