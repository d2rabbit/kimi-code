<!-- SettingsView.svelte — full settings page with glass nav + card-stack content. -->
<script lang="ts">
  import Icon from '../components/ui/Icon.svelte';
  import type { IconName } from '../lib/icon-types';
  import SkillsPanel from '../components/settings/SkillsPanel.svelte';
  import McpPanel from '../components/settings/McpPanel.svelte';
  import MemoryPanel from '../components/settings/MemoryPanel.svelte';
  import PluginPanel from '../components/settings/PluginPanel.svelte';
  import * as client from '../stores/client.svelte';

  let { onnavigate = () => {} }: { onnavigate?: () => void } = $props();

  type Section = 'general' | 'preview' | 'models' | 'skills' | 'subagents' | 'mcp' | 'plugins' | 'usage' | 'guide' | 'archived' | 'advanced';
  let active = $state<Section>('general');

  const navItems: { id: Section; label: string; icon: IconName }[] = [
    { id: 'general', label: '常规', icon: 'settings' },
    { id: 'preview', label: '代码预览', icon: 'file-text' },
    { id: 'models', label: '模型设置', icon: 'sparkles' },
    { id: 'skills', label: '技能', icon: 'bolt' },
    { id: 'subagents', label: '子智能体', icon: 'git-branch' },
    { id: 'mcp', label: 'MCP 服务器', icon: 'server' },
    { id: 'plugins', label: '插件管理', icon: 'plugin' },
    { id: 'usage', label: '使用统计', icon: 'check-list' },
    { id: 'guide', label: '引导', icon: 'help-circle' },
    { id: 'archived', label: '归档会话', icon: 'archive' },
    { id: 'advanced', label: '高级', icon: 'tools' },
  ];

  let saving = $state(false);
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
</script>

<div class="settings-page">
  <!-- Left nav -->
  <nav class="settings-nav">
    <button class="back-btn" onclick={onnavigate}><Icon name="arrow-left" size="sm" /> 返回工作区</button>
    <div class="nav-divider"></div>
    {#each navItems as item (item.id)}
      <button class="nav-item" class:active={active === item.id} onclick={() => active = item.id}>
        <Icon name={item.icon} size="sm" />
        <span>{item.label}</span>
      </button>
    {/each}
    <div class="nav-divider"></div>
    <div class="user-card">
      <div class="avatar">{(client.authProvider()?.name || 'U')[0].toUpperCase()}</div>
      <span class="user-name">{client.authProvider()?.name || '未登录'}</span>
      {#if client.authProvider()?.status === 'authenticated'}<span class="badge-pro">Pro</span>{/if}
    </div>
  </nav>

  <!-- Content -->
  <main class="settings-content">
    {#if msg}<div class="toast" class:err={msg.type === 'err'}>{msg.text}</div>{/if}

    {#if active === 'general'}
      <div class="panel">
        <h2>常规</h2>
        <div class="card">
          <div class="card-label"><span>界面主题</span><span class="card-hint">外观偏好</span></div>
          <div class="seg">
            <button class="seg-btn" class:active={!client.colorScheme() || client.colorScheme() === 'dark'} onclick={() => client.client.setColorScheme('dark')}>深色</button>
            <button class="seg-btn" class:active={client.colorScheme() === 'light'} onclick={() => client.client.setColorScheme('light')}>浅色</button>
            <button class="seg-btn" class:active={client.colorScheme() === 'system'} onclick={() => client.client.setColorScheme('system')}>跟随系统</button>
          </div>
        </div>
        <div class="card">
          <div class="card-label"><span>字体大小</span><span class="card-hint">UI 字体大小 (px)</span></div>
          <input type="range" min="12" max="18" value={client.uiFontSize()} oninput={(e) => client.client.setUiFontSize(parseInt((e.target as HTMLInputElement).value))} class="slider" />
        </div>
        <label class="card toggle-card">
          <div class="card-label"><span>遥测</span><span class="card-hint">发送匿名使用数据</span></div>
          <button class="toggle" class:on={client.config()?.telemetry} onclick={() => toggleConfig('telemetry', !client.config()?.telemetry)}></button>
        </label>
        <label class="card toggle-card">
          <div class="card-label"><span>合并所有 Skills</span><span class="card-hint">自动合并所有来源的技能</span></div>
          <button class="toggle" class:on={client.config()?.mergeAllAvailableSkills} onclick={() => toggleConfig('mergeAllAvailableSkills', !client.config()?.mergeAllAvailableSkills)}></button>
        </label>
      </div>

    {:else if active === 'models'}
      <div class="panel">
        <h2>模型设置</h2>
        {#if client.models().length > 0}
          <div class="card-list">
            {#each client.models() as m (m.id)}
              <div class="card model-card">
                <div class="model-info">
                  <span class="model-name">{m.displayName || m.id}</span>
                  <span class="model-meta">{m.provider} · {kFmt(m.maxContextSize)} context</span>
                </div>
                {#if m.id === client.defaultModel()}<span class="badge-default">默认</span>{/if}
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty-text">暂无模型配置。请在供应商中添加 API Key。</p>
        {/if}
        <h3>供应商</h3>
        <div class="card-list">
          {#each client.providers() as p (p.id)}
            <div class="card model-card">
              <div class="model-info">
                <span class="model-name">{p.id}</span>
                <span class="model-meta">{p.type}</span>
              </div>
              {#if p.hasApiKey}<span class="badge-ok">已配置</span>{:else}<span class="badge-warn">未配置</span>{/if}
            </div>
          {/each}
        </div>
      </div>

    {:else if active === 'skills'}
      <div class="panel"><SkillsPanel /></div>
    {:else if active === 'mcp'}
      <div class="panel"><McpPanel /></div>
    {:else if active === 'plugins'}
      <div class="panel"><PluginPanel /></div>
    {:else if active === 'subagents'}
      <div class="panel">
        <h2>子智能体</h2>
        <p class="empty-text">子智能体配置即将推出。</p>
      </div>
    {:else if active === 'memory'}
      <div class="panel"><MemoryPanel /></div>
    {:else if active === 'usage'}
      <div class="panel">
        <h2>使用统计</h2>
        {#if client.activeSessionUsage()}
          {@const u = client.activeSessionUsage()!}
          <div class="card">
            <div class="card-label"><span>当前会话 Token</span></div>
            <div class="usage-grid">
              <div><span class="usage-label">输入</span><span class="usage-val">{kFmt(u.inputTokens)}</span></div>
              <div><span class="usage-label">输出</span><span class="usage-val">{kFmt(u.outputTokens)}</span></div>
              <div><span class="usage-label">缓存读取</span><span class="usage-val">{kFmt(u.cacheReadTokens)}</span></div>
              <div><span class="usage-label">费用</span><span class="usage-val">${u.totalCostUsd.toFixed(4)}</span></div>
            </div>
          </div>
        {:else}
          <p class="empty-text">暂无使用数据。</p>
        {/if}
      </div>
    {:else if active === 'guide'}
      <div class="panel">
        <h2>引导</h2>
        <p class="empty-text">重新查看引导流程。</p>
      </div>
    {:else if active === 'archived'}
      <div class="panel">
        <h2>归档会话</h2>
        <p class="empty-text">已归档的会话将在此显示。</p>
      </div>
    {:else if active === 'preview'}
      <div class="panel">
        <h2>代码预览</h2>
        <p class="empty-text">文件预览偏好设置。</p>
      </div>
    {:else if active === 'advanced'}
      <div class="panel">
        <h2>高级</h2>
        <div class="card">
          <div class="card-label"><span>Daemon 版本</span></div>
          <span class="value-mono">{client.serverVersion() || '未知'}</span>
        </div>
        <div class="card">
          <div class="card-label"><span>端点地址</span></div>
          <span class="value-mono">http://127.0.0.1:58627</span>
        </div>
      </div>
    {/if}
  </main>
</div>

<style>
  .settings-page { display: flex; height: 100%; width: 100%; overflow: hidden; }

  .settings-nav {
    width: 220px; flex: none; height: 100%;
    background: rgba(18, 18, 22, 0.50);
    backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.6));
    -webkit-backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.6));
    border-right: 1px solid var(--glass-divider, rgba(255,255,255,0.06));
    padding: 12px 8px; overflow-y: auto;
    display: flex; flex-direction: column;
  }
  .back-btn { display: flex; align-items: center; gap: 6px; width: 100%; padding: 7px 10px; border: none; border-radius: 6px; background: transparent; color: var(--color-text-muted); font-size: 13px; cursor: pointer; }
  .back-btn:hover { background: var(--color-hover); color: var(--color-text); }
  .nav-divider { height: 1px; background: var(--glass-divider, rgba(255,255,255,0.06)); margin: 8px 4px; }
  .nav-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; border: none; border-radius: 6px; background: transparent; color: var(--color-text-muted); font-size: 13px; cursor: pointer; text-align: left; transition: all 0.1s; }
  .nav-item:hover { background: var(--color-hover); color: var(--color-text); }
  .nav-item.active { background: var(--color-selected); color: var(--color-text); }

  .user-card { display: flex; align-items: center; gap: 6px; margin-top: auto; padding: 4px; }
  .avatar { width: 22px; height: 22px; border-radius: 50%; background: var(--color-surface-raised); color: var(--color-text-muted); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; }
  .user-name { font-size: 11px; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge-pro { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 999px; background: var(--color-success-soft); color: var(--color-success); }

  .settings-content { flex: 1; overflow-y: auto; padding: 32px 40px; display: flex; justify-content: center; }
  .panel { max-width: 640px; width: 100%; }
  .panel h2 { font-size: 18px; font-weight: 600; color: var(--color-text); margin: 0 0 20px; }
  .panel h3 { font-size: 13px; font-weight: 600; color: var(--color-text-muted); margin: 24px 0 12px; text-transform: uppercase; letter-spacing: 0.04em; }

  .card {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; margin-bottom: 10px;
    border-radius: var(--radius-lg, 12px);
    background: var(--color-surface-raised, rgba(44,44,46,0.8));
    border: 1px solid var(--color-line, rgba(84,84,88,0.65));
  }
  .toggle-card { cursor: pointer; }
  .card-label { display: flex; flex-direction: column; gap: 2px; }
  .card-label span:first-child { font-size: 13px; color: var(--color-text); }
  .card-hint { font-size: 11px; color: var(--color-text-faint); }

  .seg { display: flex; border-radius: 6px; overflow: hidden; border: 1px solid var(--color-line-strong); }
  .seg-btn { padding: 5px 12px; border: none; background: transparent; color: var(--color-text-muted); font-size: 12px; cursor: pointer; }
  .seg-btn.active { background: var(--color-selected); color: var(--color-text); }

  .slider { width: 120px; accent-color: var(--color-accent, #0a84ff); }

  .toggle { width: 36px; height: 20px; border-radius: 999px; border: none; background: var(--color-line-strong); cursor: pointer; position: relative; transition: background 0.2s; }
  .toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--color-text-muted); transition: all 0.2s; }
  .toggle.on { background: var(--color-accent, #0a84ff); }
  .toggle.on::after { left: 18px; background: #fff; }

  .card-list { display: flex; flex-direction: column; gap: 6px; }
  .model-card { display: flex; align-items: center; justify-content: space-between; }
  .model-info { display: flex; flex-direction: column; gap: 2px; }
  .model-name { font-size: 13px; color: var(--color-text); }
  .model-meta { font-size: 11px; color: var(--color-text-faint); font-family: var(--font-mono, monospace); }
  .badge-default { font-size: 10px; padding: 2px 8px; border-radius: 999px; background: var(--color-accent-soft); color: var(--color-accent); }
  .badge-ok { font-size: 10px; padding: 2px 8px; border-radius: 999px; background: var(--color-success-soft); color: var(--color-success); }
  .badge-warn { font-size: 10px; padding: 2px 8px; border-radius: 999px; background: var(--color-warning-soft); color: var(--color-warning); }
  .empty-text { color: var(--color-text-faint); font-size: 13px; }

  .value-mono { font-family: var(--font-mono, monospace); font-size: 12px; color: var(--color-text-muted); }

  .usage-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .usage-label { font-size: 11px; color: var(--color-text-faint); display: block; }
  .usage-val { font-size: 14px; color: var(--color-text); font-family: var(--font-mono, monospace); }

  .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 8px 16px; border-radius: 8px; background: var(--color-surface-raised); color: var(--color-success); font-size: 12px; z-index: 500; }
  .toast.err { color: var(--color-danger); }
</style>
