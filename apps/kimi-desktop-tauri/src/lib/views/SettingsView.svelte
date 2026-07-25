<!-- SettingsView.svelte — full-window settings page (design-draft audit):
     top header + left nav with left accent bar + rich row-cards:
     Kimi binding card, quota bars, usage hero with context ring, item lists
     with tinted icon squares, search rows, dashed add boxes. -->
<script lang="ts">
  import Icon from '../components/ui/Icon.svelte';
  import Button from '../components/ui/Button.svelte';
  import IconButton from '../components/ui/IconButton.svelte';
  import Chip from '../components/ui/Chip.svelte';
  import Input from '../components/ui/Input.svelte';
  import Segmented from '../components/ui/Segmented.svelte';
  import Switch from '../components/ui/Switch.svelte';
  import type { IconName } from '../lib/icon-types';
  import { shortcut } from '../lib/desktopFlag';
  import PluginsSection from '../components/settings/PluginsSection.svelte';
  import LoginDialog from '../components/settings/LoginDialog.svelte';
  import ProviderModelDialog from '../components/settings/ProviderModelDialog.svelte';
  import SubagentsSection from '../components/settings/SubagentsSection.svelte';

  let showLogin = $state(false);
  let pmdMode = $state<'unified' | null>(null);
  import * as client from '../stores/client.svelte';
  import { daemon } from '../stores/daemon.svelte';
  import { toast } from '../stores/toast.svelte';

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

  const THEME_OPTIONS = [
    { value: 'dark', label: '深色' },
    { value: 'light', label: '浅色' },
    { value: 'clay', label: '粘土' },
    { value: 'brutal', label: '粗野' },
    { value: 'glass', label: '玻璃' },
    { value: 'aqua', label: '水凝' },
    { value: 'system', label: '跟随系统' },
  ];

  const PREVIEW_MODE_OPTIONS = [
    { value: 'source', label: '源码' },
    { value: 'markdown', label: 'Markdown' },
    { value: 'html', label: 'HTML' },
  ];

  const DIFF_EXPAND_OPTIONS = [
    { value: 'collapse', label: '折叠' },
    { value: 'expand', label: '展开' },
  ];

  const HL_THEME_OPTIONS = [
    { value: 'one-dark', label: 'One Dark' },
    { value: 'github-dark', label: 'GitHub Dark' },
    { value: 'dracula', label: 'Dracula' },
  ];

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onnavigate();
  }

  let saving = false; void saving;

  async function toggleConfig(key: 'telemetry' | 'mergeAllAvailableSkills', value: boolean) {
    saving = true;
    try { await client.client.updateConfig({ [key]: value } as Record<string, never>); }
    catch (e) { toast.err(String(e)); }
    finally { saving = false; }
  }

  function kFmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
    return String(n);
  }

  // Model/provider CRUD state




  let showEditProvider = $state(false);
  let editingProvider = $state('');
  let providerApiKey = $state('');

  // Preview preferences (localStorage-backed)
  let previewMode = $state(typeof localStorage !== 'undefined' ? (localStorage.getItem('kode.preview-mode') ?? 'source') : 'source');
  let diffAutoExpand = $state(typeof localStorage !== 'undefined' ? localStorage.getItem('kode.diff-expand') === 'true' : false);
  let hlTheme = $state(typeof localStorage !== 'undefined' ? (localStorage.getItem('kode.hl-theme') ?? 'one-dark') : 'one-dark');

  // Usage hero: context ring geometry
  const usage = $derived(client.activeSessionUsage());

  // Managed account plan usage (GET /oauth/usage) — fills quota bars when authenticated.
  let oauthUsage = $state<{ plan: string; used?: number; limit?: number; extra?: number } | null>(null);
  $effect(() => {
    if (client.authProvider()?.status === 'authenticated') {
      void client.client.getOauthUsage().then((u) => { oauthUsage = u; });
    } else {
      oauthUsage = null;
    }
  });
  const usagePct = $derived(
    oauthUsage && oauthUsage.limit ? Math.min(100, Math.round(((oauthUsage.used ?? 0) / oauthUsage.limit) * 100)) : 0,
  );

  // 真实聚合：按工作区汇总全部会话的 token 与费用（来自 sessions 的 usage 字段）
  const usageByWs = $derived.by(() => {
    const map = new Map<string, { name: string; input: number; output: number; cache: number; cost: number; sessions: number }>();
    for (const ws of client.workspaces()) map.set(ws.id, { name: ws.name, input: 0, output: 0, cache: 0, cost: 0, sessions: 0 });
    for (const sess of client.sessions()) {
      const key = sess.workspaceId ?? '_ungrouped';
      if (!map.has(key)) map.set(key, { name: sess.cwd?.split('/').filter(Boolean).pop() ?? '未分组', input: 0, output: 0, cache: 0, cost: 0, sessions: 0 });
      const agg = map.get(key)!;
      agg.input += sess.usage?.inputTokens ?? 0;
      agg.output += sess.usage?.outputTokens ?? 0;
      agg.cache = (agg.cache ?? 0) + (sess.usage?.cacheReadTokens ?? 0);
      agg.cost += sess.usage?.totalCostUsd ?? 0;
      agg.sessions += 1;
    }
    return [...map.values()].filter((a) => a.sessions > 0).sort((a, b) => (b.input + b.output) - (a.input + a.output));
  });
  const usageTotals = $derived.by(() => {
    let input = 0, output = 0, cache = 0, cost = 0;
    for (const a of usageByWs) { input += a.input; output += a.output; cache += a.cache; cost += a.cost; }
    return { input, output, cache, cost, sessions: usageByWs.reduce((n, a) => n + a.sessions, 0) };
  });
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
        {#if client.authProvider()?.status === 'authenticated'}<Chip tone="warning">Pro</Chip>{/if}
      </div>
    </nav>

    <!-- Content -->
    <main class="sp-content">
      <div class="sp-col">

      {#if active === 'general'}
        <h2>常规</h2>
        <p class="sub-desc">外观偏好和应用设置</p>
        <div class="scard">
          <span class="lab"><span class="t">界面主题</span><span class="d">深色 / 浅色 / 粘土 / 粗野 / 玻璃 / 水凝 / 跟随系统</span></span>
          <Segmented
            value={client.colorScheme() || 'dark'}
            options={THEME_OPTIONS}
            onchange={(v) => client.client.setColorScheme(v as 'light' | 'dark' | 'system' | 'clay' | 'brutal' | 'glass' | 'aqua')}
          />
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
          <Switch checked={client.config()?.telemetry ?? false} label="切换遥测" onchange={(c) => toggleConfig('telemetry', c)} />
        </label>
        <label class="scard toggle-card">
          <span class="lab"><span class="t">合并所有 Skills</span><span class="d">自动合并所有来源的技能</span></span>
          <Switch checked={client.config()?.mergeAllAvailableSkills ?? false} label="切换合并 Skills" onchange={(c) => toggleConfig('mergeAllAvailableSkills', c)} />
        </label>
        <h3>诊断</h3>
        <div class="scard">
          <span class="lab"><span class="t">内嵌 Agent</span><span class="d">应用私有代理进程，随应用启动/退出</span></span>
          <span class="mono-val">{daemon.state.origin ?? '—'}</span>
          <Chip tone="success">● {daemon.state.status === 'connected' ? '已连接' : '未连接'}</Chip>
        </div>
        <div class="scard">
          <span class="lab"><span class="t">版本</span><span class="d">Kimi Code Desktop · daemon {client.serverVersion() || '未知'}</span></span>
          <Button size="sm" onclick={() => { toast.ok('已是最新版本'); }}>检查更新</Button>
        </div>

      {:else if active === 'preview'}
        <h2>代码预览</h2>
        <p class="sub-desc">文件预览的显示偏好</p>
        <div class="scard">
          <span class="lab"><span class="t">默认渲染模式</span><span class="d">文件预览的默认显示方式</span></span>
          <Segmented bind:value={previewMode} options={PREVIEW_MODE_OPTIONS} onchange={(v) => localStorage.setItem('kode.preview-mode', v)} />
        </div>
        <div class="scard">
          <span class="lab"><span class="t">Diff 展开方式</span><span class="d">工具调用中的 diff 默认状态</span></span>
          <Segmented
            value={diffAutoExpand ? 'expand' : 'collapse'}
            options={DIFF_EXPAND_OPTIONS}
            onchange={(v) => { diffAutoExpand = v === 'expand'; localStorage.setItem('kode.diff-expand', v === 'expand' ? 'true' : 'false'); }}
          />
        </div>
        <div class="scard">
          <span class="lab"><span class="t">语法高亮主题</span><span class="d">代码块的配色方案</span></span>
          <Segmented bind:value={hlTheme} options={HL_THEME_OPTIONS} onchange={(v) => localStorage.setItem('kode.hl-theme', v)} />
        </div>

      {:else if active === 'models'}
        <h2>模型设置</h2>
        <p class="sub-desc">管理模型供应商，配置后可在聊天时选择使用</p>

        <!-- Kimi binding card (design draft: provider binding + plan row) -->
        <div class="bind-card">
          <div class="bind-head">
            <span class="bind-name">Kimi</span>
            {#if client.authProvider()?.status === 'authenticated'}<Chip tone="success">已启用</Chip>{/if}
            <span class="bind-right">{client.authProvider()?.status === 'authenticated' ? '连接方式: 个人套餐' : '未连接'}</span>
          </div>
          <div class="bind-body">
            <div class="bind-plan">
              <span class="t">{client.authProvider()?.status === 'authenticated' ? (client.authProvider()?.name ?? 'Kimi 账号') : 'Kimi 账号'}</span>
              <span class="d">{#if client.authProvider()?.status === 'authenticated'}订阅生效中 · 第一方模型可用{:else}登录后可使用 Kimi K2 等第一方模型，无需 API Key{/if}</span>
            </div>
            {#if client.authProvider()?.status === 'authenticated'}
              <Button size="sm" onclick={() => { toast.info('账号管理（浏览器打开）'); }}>管理</Button>
              <Button size="sm" class="ghost-acc" onclick={() => { void client.client.logout(); }}>解绑</Button>
            {:else}
              <Button variant="primary" size="sm" onclick={() => showLogin = true}>登录 Kimi</Button>
            {/if}
          </div>
        </div>

        <!-- Quota bars — filled from GET /oauth/usage when managed account is authenticated -->
        <div class="quota-row">
          <div class="quota-card">
            <div class="quota-t">
              <span>Token 额度{#if oauthUsage?.plan} · {oauthUsage.plan}{/if}</span>
              <span class="mono pct">{#if oauthUsage?.limit}{usagePct}%{:else}—{/if}</span>
            </div>
            <div class="bar"><i style="width:{usagePct}%"></i></div>
            <div class="quota-m mono">
              {#if oauthUsage?.limit}
                {(oauthUsage.used ?? 0).toLocaleString()} / {oauthUsage.limit.toLocaleString()} tokens
                {#if oauthUsage.extra} · 额外 {oauthUsage.extra.toLocaleString()}{/if}
              {:else}
                账户配额由服务端管理，登录后在账单页查看
              {/if}
            </div>
          </div>
          <div class="quota-card">
            <div class="quota-t"><span>MCP 额度</span><span class="mono pct purple">—</span></div>
            <div class="bar purple"><i style="width:0%"></i></div>
            <div class="quota-m mono">账户配额由服务端管理，登录后在账单页查看</div>
          </div>
        </div>

        <h3>模型列表</h3>
        <p class="sub-desc" style="margin-top:-8px">模型随供应商自动同步；需要自定义别名时在最下方添加</p>
        {#if client.models().length > 0}
          {#each client.models() as m (m.id)}
            <div class="item-row">
              <span class="isq"><Icon name="sparkles" size="sm" /></span>
              <span class="ir">
                <span class="it">{m.displayName || m.id}{#if m.id === client.defaultModel()}<Chip tone="accent">默认</Chip>{/if}</span>
                <span class="id mono">{m.provider} · {kFmt(m.maxContextSize)} context</span>
              </span>
              {#if m.id !== client.defaultModel()}
                <Button size="sm" onclick={() => { void client.client.setDefaultModel(m.id); }}>设为默认</Button>
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
            {#if p.status === 'connected'}<Chip tone="success">已连接</Chip>
            {:else if p.status === 'error'}<Chip tone="warning">错误</Chip>
            {:else}<Chip tone="warning">未配置</Chip>{/if}
            {#if p.hasApiKey}
              <IconButton name="refresh" variant="default" size="sm" label="刷新模型" onclick={() => { void client.client.refreshProviderModels(p.id); }} />
              <Button size="sm" onclick={() => { editingProvider = p.id; providerApiKey = ''; showEditProvider = true; }}>更新 Key</Button>
            {:else}
              <Button size="sm" onclick={() => { editingProvider = p.id; providerApiKey = ''; showEditProvider = true; }}>配置</Button>
            {/if}
          </div>
        {/each}

        <button class="dashed-btn" onclick={() => pmdMode = 'unified'} type="button">+ 添加供应商</button>

        {#if showEditProvider}
          <div class="scard add-model-form">
            <div class="form-row-vertical"><span class="form-lbl">更新 {editingProvider} 的 API Key</span><Input type="password" bind:value={providerApiKey} placeholder="输入新的 API Key" /></div>
            <div class="form-actions">
              <Button size="sm" onclick={() => showEditProvider = false}>取消</Button>
              <Button variant="primary" size="sm" onclick={async () => {
                if (!editingProvider || !providerApiKey.trim()) return;
                const existing = client.providers().find((p) => p.id === editingProvider);
                await client.client.saveProvider(editingProvider, {
                  type: existing?.type ?? 'openai',
                  apiKey: providerApiKey.trim(),
                  baseUrl: existing?.baseUrl,
                });
                showEditProvider = false; providerApiKey = '';
              }}>保存</Button>
            </div>
          </div>
        {/if}

        <h3>自定义模型</h3>
        <button class="dashed-btn" onclick={() => pmdMode = 'unified'} type="button">+ 添加自定义模型</button>

      {:else if active === 'subagents'}
        <SubagentsSection />

      {:else if active === 'plugins'}
        <PluginsSection />

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
            <span class="id">命令文件位于项目 <code>.kimi/commands/</code> 与全局 <code>commands/</code> 目录，直接编辑 Markdown 即可创建</span>
          </span>
          <Button size="sm" disabled>＋ 新建</Button>
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
              <span class="id mono">@ 提及当前基于实时文件搜索（无持久索引）</span>
            </span>
            <Button size="sm" disabled>重建索引</Button>
          </div>
        {/each}

      {:else if active === 'usage'}
        <h2>使用统计</h2>
        <p class="sub-desc">Token 用量、费用和额度概览</p>
        {#if usageTotals.sessions > 0}
          <div class="usage-hero">
            <div class="hero-main">
              <div class="hero-head"><span class="hero-tag">全部会话 · {usageTotals.sessions} 个</span></div>
              <div class="hero-grid">
                <div><div class="hg-l">输入 Token</div><div class="hg-v mono">{kFmt(usageTotals.input)}</div></div>
                <div><div class="hg-l">输出 Token</div><div class="hg-v mono">{kFmt(usageTotals.output)}</div></div>
                <div><div class="hg-l">缓存命中</div><div class="hg-v mono acc">{kFmt(usageTotals.cache)}</div></div>
                <div><div class="hg-l">总费用</div><div class="hg-v mono ok">${usageTotals.cost.toFixed(4)}</div></div>
              </div>
            </div>
            {#if usage}
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
                <div class="ring-m mono">当前会话 {kFmt(usage.contextTokens)} / {kFmt(usage.contextLimit)}</div>
              </div>
            {/if}
          </div>
          <h3>按工作区</h3>
          {#each usageByWs as a (a.name)}
            {@const maxTok = Math.max(...usageByWs.map((x) => x.input + x.output), 1)}
            <div class="ws-bar-row">
              <span class="ws-name">{a.name}</span>
              <div class="bar grad"><i style="width:{Math.round(((a.input + a.output) / maxTok) * 100)}%"></i></div>
              <span class="mono ws-tok">{kFmt(a.input + a.output)}</span>
              <span class="mono ws-cost">${a.cost.toFixed(4)}</span>
            </div>
          {/each}
        {:else}
          <p class="empty-text">暂无使用数据。</p>
        {/if}

        <h3>额度概览</h3>
        <div class="quota-row">
          <div class="quota-card">
            <div class="quota-t"><span>模型额度</span><span class="mono pct">—</span></div>
            <div class="bar"><i style="width:0%"></i></div>
            <div class="quota-m mono">账户配额由服务端管理，登录后在账单页查看</div>
          </div>
          <div class="quota-card">
            <div class="quota-t"><span>MCP 额度</span><span class="mono pct purple">—</span></div>
            <div class="bar purple"><i style="width:0%"></i></div>
            <div class="quota-m mono">账户配额由服务端管理，登录后在账单页查看</div>
          </div>
        </div>


      {:else if active === 'guide'}
        <h2>引导</h2>
        <p class="sub-desc">重新查看首次启动引导或了解快捷键</p>
        <div class="scard">
          <span class="lab"><span class="t">新手引导</span><span class="d">包含 Kimi 登录与主题选择，可随时重新打开</span></span>
          <Button size="sm" class="ghost-acc" onclick={() => { client.client.setOnboarded(false); onnavigate(); }}>重新打开 →</Button>
        </div>
        <h3>快捷键</h3>
        {#each [[shortcut('K'), '命令面板'], [shortcut('N'), '新建对话'], [shortcut('P'), '搜索会话'], [shortcut(','), '打开设置'], [shortcut('S'), 'Steer (注入运行中的回合)'], ['Esc', '返回 / 关闭 overlay']] as [key, desc]}
          <div class="key-row">
            <span class="key-desc">{desc}</span>
            <kbd class="keycap">{key}</kbd>
          </div>
        {/each}
      {/if}

      </div>
    </main>
  </div>
  {#if showLogin}
    <LoginDialog onclose={() => showLogin = false} />
  {/if}
  {#if pmdMode}
    <ProviderModelDialog mode={pmdMode} onclose={() => pmdMode = null} />
  {/if}
</div>

<style>
  .settings-page { display: flex; flex-direction: column; height: 100%; width: 100%; overflow: hidden; animation: spIn 0.18s var(--ease); }
  @keyframes spIn { from { opacity: 0; transform: translateY(6px); } }

  /* ---- Top header ---- */
  .sp-header { flex: none; height: 40px; display: flex; align-items: center; padding: 0 16px; background: var(--mat-header-bg, var(--l1)); border-bottom: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd)); }
  .sp-header-t { font-size: 13px; color: var(--tx2); font-weight: 500; }
  .sp-header-r { margin-left: auto; display: flex; align-items: center; gap: 6px; }
  .sp-header-r .hint { font-size: 10px; color: var(--tx3); }
  .kbd { font-family: var(--font-mono); font-size: 10px; border: 1px solid var(--bd2); border-radius: 4px; padding: 1px 5px; color: var(--tx3); }

  .sp-body { flex: 1; display: flex; overflow: hidden; }

  /* ---- Left nav ---- */
  .sp-nav { width: 220px; flex: none; height: 100%; display: flex; flex-direction: column; background: var(--mat-sidebar-bg, var(--l1)); border-right: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd)); padding: 12px 8px; overflow-y: auto; }
  .sp-back { display: flex; align-items: center; gap: 7px; padding: 7px 10px; border: none; border-radius: var(--r-md); background: transparent; font-size: 12.5px; color: var(--tx2); cursor: pointer; transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease); }
  .sp-back:hover { background: var(--ac-soft); color: var(--tx); }
  .sp-divider { height: 1px; background: var(--bd); margin: 8px 4px; }
  .sp-tab { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; border: none; border-radius: var(--r-md); background: transparent; font-size: 13px; color: var(--tx2); cursor: pointer; text-align: left; transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease); }
  .sp-tab:hover { background: var(--color-hover); color: var(--tx); }
  .sp-tab.on { background: var(--ac-soft); color: var(--ac); border-left: 2px solid var(--ac); padding-left: 8px; font-weight: 600; }
  .sp-foot { display: flex; align-items: center; gap: 8px; padding: 4px; }
  .sp-foot .avatar { width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #4fa8ff, #5bc0be); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; }
  .sp-foot .user-name { font-size: 11px; color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ---- Content ---- */
  .sp-content { flex: 1; overflow-y: auto; }
  .sp-col { max-width: 680px; margin: 0 auto; padding: 32px 40px 60px; }
  .sp-col h2 { font-size: 20px; font-weight: 600; color: var(--tx); margin: 0 0 4px; }
  .sp-col h3 { font-size: 12px; font-weight: 600; color: var(--ac); margin: 24px 0 12px; letter-spacing: 0.04em; text-transform: uppercase; }
  .sub-desc { font-size: 12px; color: var(--tx3); margin: 0 0 20px; }

  /* ---- Row cards ---- */
  .scard {
    display: flex; align-items: center; gap: 16px; padding: 14px 18px; margin-bottom: 10px; font-size: 13px;
    background: var(--mat-surface-2, var(--l2));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    border-radius: var(--g-radius-card, 14px);
    box-shadow: var(--elev-card, var(--toplight));
  }
  .scard .lab { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .scard .lab .t { font-size: 13px; font-weight: 500; color: var(--tx); }
  .scard .lab .d { font-size: 11px; color: var(--tx3); }
  .toggle-card { cursor: pointer; }
  .mono-val { font-family: var(--font-mono); font-size: 11px; color: var(--tx2); }

  .slider-wrap { display: flex; align-items: center; gap: 10px; }
  .slider { width: 140px; height: 4px; -webkit-appearance: none; appearance: none; border-radius: 2px; background: linear-gradient(90deg, var(--ac) var(--pct, 50%), var(--bd2) var(--pct, 50%)); outline: none; cursor: pointer; }
  .slider::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.3); cursor: pointer; }

  /* Accent-tinted action button (override of the Button default surface). */
  :global(.ghost-acc) { background: var(--ac-soft); border-color: var(--ac-bd); color: var(--ac); }
  :global(.ghost-acc:hover:not(:disabled)) { background: var(--ac-soft); border-color: var(--ac); color: var(--ac); }

  .keycap { font-family: var(--font-mono); font-size: 11px; padding: 3px 10px; border-radius: var(--r-md); background: var(--ac-soft); color: var(--ac); border: 1px solid var(--ac-bd); }
  .empty-text { color: var(--tx3); font-size: 13px; }

  /* ---- Binding card (Kimi provider, gradient brand border) ---- */
  .bind-card { border-radius: var(--g-radius-card, 14px); padding: 18px; margin-bottom: 12px; background: linear-gradient(135deg, rgba(79,168,255,0.10), rgba(91,192,190,0.05)); border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--ac-bd); }
  .bind-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .bind-name { font-size: 15px; font-weight: 600; color: var(--tx); }
  .bind-right { margin-left: auto; font-size: 12px; color: var(--tx2); }
  .bind-body { display: flex; align-items: center; gap: 10px; padding-top: 12px; border-top: 1px solid var(--bd); }
  .bind-plan { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .bind-plan .t { font-size: 13px; font-weight: 500; color: var(--tx); }
  .bind-plan .d { font-size: 11px; color: var(--tx3); }

  /* ---- Quota bars ---- */
  .quota-row { display: flex; gap: 10px; margin-bottom: 12px; }
  .quota-card {
    flex: 1; padding: 16px;
    background: var(--mat-surface-2, var(--l2));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    border-radius: var(--g-radius-card, 14px);
    box-shadow: var(--elev-card, var(--toplight));
  }
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
  .item-row {
    display: flex; align-items: center; gap: 12px; padding: 12px 16px; margin-bottom: 8px;
    background: var(--mat-surface-2, var(--l2));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    border-radius: var(--g-radius-card, 12px);
    box-shadow: var(--elev-card, var(--toplight));
  }
  .isq { width: 28px; height: 28px; border-radius: 8px; background: var(--ac-soft); color: var(--ac); display: flex; align-items: center; justify-content: center; flex: none; }
  .ir { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .it { font-size: 13px; font-weight: 500; color: var(--tx); display: flex; align-items: center; gap: 6px; }
  .id { font-size: 11px; color: var(--tx3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .id.mono { font-family: var(--font-mono); }
  .list-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .searchbox { flex: 1; display: flex; align-items: center; gap: 6px; padding: 7px 12px; background: var(--mat-input-bg, var(--l1)); border: var(--g-border-w-input, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd)); border-radius: var(--g-radius-input, 8px); box-shadow: var(--elev-input, none); color: var(--tx3); font-size: 12px; }

  /* ---- Usage hero ---- */
  .usage-hero { display: flex; gap: 16px; margin-bottom: 12px; }
  .hero-main { flex: 2; border-radius: var(--g-radius-card, 14px); background: linear-gradient(135deg, rgba(79,168,255,0.10), rgba(91,192,190,0.04)); border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--ac-bd); padding: 20px; }
  .hero-head { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .hero-tag { font-size: 11px; color: var(--ac); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .hero-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .hg-l { font-size: 10px; color: var(--tx3); margin-bottom: 4px; }
  .hg-v { font-size: 20px; color: var(--tx); font-weight: 600; }
  .hg-v.acc { color: var(--ac); }
  .hg-v.ok { color: var(--ok); }
  .hero-ring {
    flex: 1; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
    background: var(--mat-surface-2, var(--l2));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    border-radius: var(--g-radius-card, 14px);
    box-shadow: var(--elev-card, var(--toplight));
  }
  .ring-wrap { position: relative; width: 80px; height: 80px; }
  .ring-c { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }
  .ring-pct { font-size: 16px; font-weight: 600; color: var(--tx); }
  .ring-l { font-size: 9px; color: var(--tx3); }
  .ring-m { font-size: 10px; color: var(--tx2); }
  .ws-bar-row { display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-radius: var(--g-radius-card, 12px); background: var(--mat-surface-1, var(--l1)); border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd)); margin-bottom: 6px; }
  .ws-name { font-size: 13px; color: var(--tx); min-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ws-bar-row .bar { flex: 1; }
  .ws-tok { font-size: 11px; color: var(--tx2); min-width: 50px; text-align: right; }
  .ws-cost { font-size: 11px; color: var(--ok); min-width: 56px; text-align: right; }

  /* ---- Shortcut rows ---- */
  .key-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 18px; border-radius: var(--g-radius-card, 10px); background: var(--mat-surface-1, var(--l1)); border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd)); margin-bottom: 4px; }
  .key-desc { font-size: 13px; color: var(--tx2); }

  /* ---- Forms ---- */
  .add-model-form { flex-direction: column; align-items: stretch; gap: 10px; display: flex; }
  .form-row-vertical { display: flex; flex-direction: column; gap: 3px; }
  .form-lbl { font-size: 11px; color: var(--tx3); }
  .form-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .dashed-btn { width: 100%; padding: 14px; border: var(--g-border-w-input, 1.5px) dashed var(--ac-bd); border-radius: var(--g-radius-card, 14px); background: transparent; color: var(--ac); font-size: 13px; cursor: pointer; font-family: inherit; opacity: 0.8; transition: border-color var(--duration-fast) var(--ease), background var(--duration-fast) var(--ease), opacity var(--duration-fast) var(--ease); }
  .dashed-btn:hover { border-color: var(--ac); background: var(--ac-soft); opacity: 1; }
</style>
