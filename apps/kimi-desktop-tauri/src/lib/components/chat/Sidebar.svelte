<!-- Sidebar.svelte — glass sidebar: search box + icon nav + workspace sessions + user area. -->
<script lang="ts">
  import * as client from '../../stores/client.svelte';
  import Icon from '../ui/Icon.svelte';

  let { onnavigate = () => {} }: { onnavigate?: () => void } = $props();

  let menuSession = $state<{ id: string; title: string; x: number; y: number } | null>(null);
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');

  function select(e: Event, id: string) {
    if (renamingId === id) return;
    e.preventDefault();
    void client.client.selectSession(id);
  }
  function newChat() { client.client.clearActiveSession(); }

  function openMenu(e: MouseEvent, s: { id: string; title: string }) {
    e.preventDefault(); e.stopPropagation();
    menuSession = { id: s.id, title: s.title || '新对话', x: e.clientX, y: e.clientY };
  }
  function startRename(id: string, title: string) { renamingId = id; renameValue = title; menuSession = null; }
  async function confirmRename(id: string) {
    if (renameValue.trim()) await client.client.renameSession(id, renameValue.trim());
    renamingId = null;
  }
  async function archive(id: string) { menuSession = null; await client.client.archiveSession(id); }
  async function fork(id: string) { menuSession = null; await client.client.forkSession(id); }
  async function addWorkspace() {
    const path = prompt('输入工作区路径:');
    if (path) await client.client.addWorkspaceByPath(path);
  }
  function openSearch() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: !navigator.platform.includes('Mac') }));
  }
  function closeMenus() { menuSession = null; }

  const authName = $derived(client.authProvider()?.name ?? '');
  const authed = $derived(client.authProvider()?.status === 'authenticated');
  const pendingCount = $derived(client.pendingApprovals().length + client.questions().length);
</script>

<svelte:window onclick={closeMenus} />

<aside class="sidebar">
  <!-- Search box -->
  <div class="search-box" onclick={openSearch} role="button" tabindex="0"
    onkeydown={(e) => { if (e.key === 'Enter') openSearch(); }}>
    <Icon name="search" size="sm" />
    <span class="search-placeholder">搜索…</span>
    <kbd class="kbd-hint">⌘K</kbd>
  </div>

  <!-- Icon nav -->
  <nav class="icon-nav">
    <button class="icon-btn" title="新建对话" onclick={newChat}><Icon name="chat-new" size="md" /></button>
    <button class="icon-btn" title="搜索 (⌘K)" onclick={openSearch}><Icon name="search" size="md" /></button>
    <div class="nav-gap"></div>
    <button class="icon-btn" title="设置" onclick={onnavigate}><Icon name="settings" size="md" /></button>
  </nav>

  <!-- Sessions -->
  <div class="sessions">
    {#if client.workspaces().length > 0}
      {#each client.workspaces() as ws (ws.id)}
        <div class="ws-group">
          <div class="ws-header">
            <span class="ws-name" title={ws.name}>{ws.name}</span>
            <span class="ws-count">{client.sessions().filter(s => s.workspaceId === ws.id || (!s.workspaceId && s.cwd === ws.root)).length}</span>
          </div>
          {#each client.sessions().filter(s => s.workspaceId === ws.id || (!s.workspaceId && s.cwd === ws.root)) as s (s.id)}
            <div class="s-row" class:active={s.id === client.activeSessionId()}>
              {#if renamingId === s.id}
                <input class="rename" type="text" bind:value={renameValue}
                  onkeydown={(e) => { if (e.key==='Enter') confirmRename(s.id); if (e.key==='Escape') renamingId=null; }}
                  onblur={() => confirmRename(s.id)} onclick={(e) => e.stopPropagation()} />
              {:else}
                <button class="s-btn" class:active={s.id === client.activeSessionId()} onclick={(e) => select(e, s.id)} oncontextmenu={(e) => openMenu(e, s)}>
                  {#if s.status === 'running' || s.status === 'awaitingApproval' || s.status === 'awaitingQuestion'}
                    <span class="s-status-dot" data-status={s.status}></span>
                  {/if}
                  <span class="s-title">{s.title || '新对话'}</span>
                </button>
              {/if}
              {#if renamingId !== s.id}
                <button class="s-more" onclick={(e) => openMenu(e, s)}><span>⋯</span></button>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
    {:else if client.sessions().length > 0}
      {#each client.sessions() as s (s.id)}
        <div class="s-row" class:active={s.id === client.activeSessionId()}>
          <button class="s-btn" class:active={s.id === client.activeSessionId()} onclick={(e) => select(e, s.id)} oncontextmenu={(e) => openMenu(e, s)}>
            <span class="s-title">{s.title || '新对话'}</span>
          </button>
          <button class="s-more" onclick={(e) => openMenu(e, s)}><span>⋯</span></button>
        </div>
      {/each}
    {/if}
    {#if client.sessions().length === 0 && client.workspaces().length === 0}
      <div class="empty"><p>暂无会话</p></div>
    {/if}
  </div>

  <!-- Footer -->
  <footer class="footer">
    {#if pendingCount > 0}
      <div class="attention-badge">{pendingCount}</div>
    {/if}
    <button class="add-ws" onclick={addWorkspace}><Icon name="folder-plus" size="sm" /> 添加工作区</button>
    <div class="user">
      <div class="avatar">{(authName || 'U')[0].toUpperCase()}</div>
      <span class="user-name">{authName || '未登录'}</span>
      {#if authed}<span class="badge-pro">Pro</span>{/if}
    </div>
  </footer>
</aside>

{#if menuSession}
  <div class="glass-menu animate-spring-in" style="position: fixed; left: {Math.min(menuSession.x, innerWidth - 170)}px; top: {Math.min(menuSession.y, innerHeight - 160)}px; z-index: 300;" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="menu" tabindex="-1">
    <button class="glass-menu-item" onclick={() => startRename(menuSession!.id, menuSession!.title)}><Icon name="pencil" size="sm" /> 重命名</button>
    <button class="glass-menu-item" onclick={() => fork(menuSession!.id)}><Icon name="git-branch" size="sm" /> Fork</button>
    <div class="glass-menu-divider"></div>
    <button class="glass-menu-item danger" onclick={() => archive(menuSession!.id)}><Icon name="delete" size="sm" /> 归档</button>
  </div>
{/if}

<style>
  .sidebar { width: var(--sidebar-width, 240px); flex: none; height: 100%; display: flex; flex-direction: column; background: linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 30%), rgba(18, 18, 22, 0.60); backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.6)); -webkit-backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.6)); border-right: 1px solid var(--glass-divider, rgba(255,255,255,0.06)); overflow: hidden; box-shadow: inset -1px 0 0 rgba(255,255,255,0.03); }

  .search-box {
    display: flex; align-items: center; gap: 6px; margin: 10px 10px 4px;
    padding: 6px 10px; border-radius: var(--radius-md, 8px);
    background: rgba(0, 0, 0, 0.25); cursor: pointer;
    color: var(--color-text-faint, rgba(235,235,245,0.3)); font-size: 12px;
    transition: background 120ms;
  }
  .search-box:hover { background: rgba(0, 0, 0, 0.35); }
  .search-placeholder { flex: 1; }
  .kbd-hint { font-size: 10px; padding: 1px 5px; border-radius: 4px; background: rgba(255,255,255,0.08); color: var(--color-text-faint); font-family: var(--font-mono, monospace); }

  .icon-nav { display: flex; align-items: center; gap: 2px; padding: 4px 10px 6px; flex: none; }
  .icon-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: none; border-radius: 6px; background: transparent; color: var(--color-text-faint, rgba(235,235,245,0.3)); cursor: pointer; transition: all 0.1s; }
  .icon-btn:hover { background: var(--color-hover, rgba(255,255,255,0.06)); color: var(--color-text-muted, rgba(235,235,245,0.6)); }
  .nav-gap { flex: 1; }

  .sessions { flex: 1; overflow-y: auto; padding: 0 6px; }
  .ws-group { margin-bottom: 0; }
  .ws-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 2px; }
  .ws-name { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-faint, rgba(235,235,245,0.3)); font-family: var(--font-mono, monospace); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ws-count { font-size: 10px; color: var(--color-text-faint); font-family: monospace; }

  .s-row { position: relative; display: flex; align-items: center; border-radius: 5px; }
  .s-row:hover { background: var(--color-hover, rgba(255,255,255,0.06)); }
  .s-row.active { background: var(--color-selected, rgba(255,255,255,0.1)); }
  .s-btn { flex: 1; display: flex; align-items: center; gap: 6px; text-align: left; padding: 4px 22px 4px 10px; border: none; border-radius: 5px; background: transparent; color: var(--color-text-muted, rgba(235,235,245,0.6)); font-size: 12px; cursor: pointer; overflow: hidden; box-shadow: inset -1px 0 0 rgba(255,255,255,0.03); }
  .s-btn:hover { color: var(--color-text, rgba(255,255,255,0.92)); }
  .s-btn.active { color: var(--color-text, rgba(255,255,255,0.92)); font-weight: 500; }
  .s-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .s-status-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
  .s-status-dot[data-status="running"] { background: var(--color-success, #30d158); animation: pulse 1.5s infinite; }
  .s-status-dot[data-status="awaitingApproval"] { background: var(--color-warning, #ffd60a); }
  .s-status-dot[data-status="awaitingQuestion"] { background: var(--color-accent, #0a84ff); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  .s-more { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; border: none; border-radius: 4px; background: transparent; color: var(--color-text-faint); cursor: pointer; opacity: 0; transition: opacity 0.1s; }
  .s-row:hover .s-more { opacity: 1; }
  .s-more:hover { background: var(--color-hover); color: var(--color-text-muted); }
  .s-more span { font-size: 12px; }
  .rename { flex: 1; padding: 3px 6px; border: 1px solid var(--color-line-strong); border-radius: 4px; background: rgba(0,0,0,0.3); color: #fff; font-size: 12px; outline: none; margin: 0 4px; }

  .empty { padding: 30px; text-align: center; color: var(--color-text-faint); font-size: 12px; }

  .footer { flex: none; padding: 6px 8px; border-top: 1px solid var(--glass-divider, rgba(255,255,255,0.06)); position: relative; }
  .attention-badge { position: absolute; top: -8px; right: 8px; background: var(--color-danger, #ff453a); color: #fff; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: var(--radius-full, 999px); }
  .add-ws { width: 100%; display: flex; align-items: center; gap: 6px; padding: 5px 8px; border: none; border-radius: 5px; background: transparent; color: var(--color-text-faint); font-size: 12px; cursor: pointer; }
  .add-ws:hover { background: var(--color-hover); color: var(--color-text-muted); }
  .user { display: flex; align-items: center; gap: 6px; margin-top: 6px; padding: 4px 4px; }
  .avatar { width: 22px; height: 22px; border-radius: 50%; background: var(--color-surface-raised, rgba(44,44,46,0.8)); color: var(--color-text-muted); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; flex-shrink: 0; }
  .user-name { font-size: 11px; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge-pro { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 999px; background: var(--color-success-soft, rgba(48,209,88,0.16)); color: var(--color-success, #30d158); }
</style>
