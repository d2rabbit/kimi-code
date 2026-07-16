<!-- Sidebar.svelte — ZCode-inspired compact sidebar with icon nav + workspace tree. -->
<script lang="ts">
  import * as client from '../../stores/client.svelte';
  import Icon from '../ui/Icon.svelte';
  import ConfigDialog from '../settings/ConfigDialog.svelte';

  let {
    sidebarCollapsed = false,
    toggleSidebar = () => {},
  }: {
    sidebarCollapsed?: boolean;
    toggleSidebar?: () => void;
  } = $props();
  void sidebarCollapsed; void toggleSidebar;

  let showSettings = $state(false);
  let menuSession = $state<{ id: string; title: string; x: number; y: number } | null>(null);
  let menuWorkspace = $state<{ id: string; name: string; x: number; y: number } | null>(null);
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');

  function handleSelect(e: Event, sessionId: string) {
    if (renamingId === sessionId) return;
    e.preventDefault();
    void client.client.selectSession(sessionId);
  }

  function handleNew() {
    client.client.clearActiveSession();
  }

  function openSessionMenu(e: MouseEvent, session: { id: string; title: string }) {
    e.preventDefault();
    e.stopPropagation();
    menuSession = { id: session.id, title: session.title || '新对话', x: e.clientX, y: e.clientY };
  }

  function startRename(sessionId: string, currentTitle: string) {
    renamingId = sessionId;
    renameValue = currentTitle;
    menuSession = null;
  }

  async function confirmRename(sessionId: string) {
    if (renameValue.trim()) await client.client.renameSession(sessionId, renameValue.trim());
    renamingId = null;
  }

  async function handleArchive(sessionId: string) {
    menuSession = null;
    await client.client.archiveSession(sessionId);
  }

  async function handleFork(sessionId: string) {
    menuSession = null;
    await client.client.forkSession(sessionId);
  }

  function openWorkspaceMenu(e: MouseEvent, ws: { id: string; name: string }) {
    e.preventDefault();
    e.stopPropagation();
    menuWorkspace = { id: ws.id, name: ws.name, x: e.clientX, y: e.clientY };
  }

  async function handleDeleteWorkspace(wsId: string) {
    menuWorkspace = null;
    await client.client.deleteWorkspace(wsId);
  }

  function closeMenus() { menuSession = null; menuWorkspace = null; }

  async function handleAddWorkspace() {
    const path = prompt('输入工作区路径:');
    if (!path) return;
    await client.client.addWorkspaceByPath(path);
  }

  function openSearch() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: !navigator.platform.includes('Mac') }));
  }

  // User info from auth
  const authStatus = $derived(client.authProvider());
</script>

<svelte:window onclick={closeMenus} />

<div class="sidebar">
  <!-- Nav bar -->
  <nav class="nav-bar">
    <button class="nav-btn" title="新建对话" onclick={handleNew}>
      <Icon name="chat-new" size="md" />
    </button>
    <button class="nav-btn" title="搜索 (Ctrl+K)" onclick={openSearch}>
      <Icon name="search" size="md" />
    </button>
    <button class="nav-btn" title="设置" onclick={() => showSettings = true}>
      <Icon name="settings" size="md" />
    </button>
    <div class="nav-spacer"></div>
    <button class="nav-btn collapse-btn" title="折叠侧边栏" onclick={toggleSidebar}>
      <Icon name="panel-collapse" size="md" />
    </button>
  </nav>

  <!-- Session list -->
  <div class="session-list">
    {#if client.workspaces().length > 0}
      {#each client.workspaces() as ws (ws.id)}
        <div class="ws-group">
          <div class="ws-header" oncontextmenu={(e) => openWorkspaceMenu(e, ws)} role="button" tabindex="0">
            <span class="ws-name" title={ws.name}>{ws.name}</span>
            <span class="ws-count">{client.sessions().filter(s => s.workspaceId === ws.id || (!s.workspaceId && s.cwd === ws.root)).length}</span>
          </div>
          {#each client.sessions().filter(s => s.workspaceId === ws.id || (!s.workspaceId && s.cwd === ws.root)) as session (session.id)}
            <div class="session-wrap" class:active={session.id === client.activeSessionId()}>
              {#if renamingId === session.id}
                <input class="rename-input" type="text" bind:value={renameValue}
                  onkeydown={(e) => { if (e.key === 'Enter') confirmRename(session.id); if (e.key === 'Escape') renamingId = null; }}
                  onblur={() => confirmRename(session.id)} onclick={(e) => e.stopPropagation()} />
              {:else}
                <button class="session-btn" class:active={session.id === client.activeSessionId()}
                  onclick={(e) => handleSelect(e, session.id)} oncontextmenu={(e) => openSessionMenu(e, session)}>
                  <span class="session-title">{session.title || '新对话'}</span>
                </button>
              {/if}
              {#if renamingId !== session.id}
                <button class="session-menu" onclick={(e) => openSessionMenu(e, session)} aria-label="更多">
                  <span>⋯</span>
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
      {#each client.sessions().filter(s => !client.workspaces().some(w => w.id === s.workspaceId || w.root === s.cwd)) as session (session.id)}
        <div class="session-wrap" class:active={session.id === client.activeSessionId()}>
          <button class="session-btn" class:active={session.id === client.activeSessionId()}
            onclick={(e) => handleSelect(e, session.id)} oncontextmenu={(e) => openSessionMenu(e, session)}>
            <span class="session-title">{session.title || '新对话'}</span>
          </button>
          <button class="session-menu" onclick={(e) => openSessionMenu(e, session)} aria-label="更多"><span>⋯</span></button>
        </div>
      {/each}
    {:else}
      {#each client.sessions() as session (session.id)}
        <div class="session-wrap" class:active={session.id === client.activeSessionId()}>
          <button class="session-btn" class:active={session.id === client.activeSessionId()}
            onclick={(e) => handleSelect(e, session.id)} oncontextmenu={(e) => openSessionMenu(e, session)}>
            <span class="session-title">{session.title || '新对话'}</span>
          </button>
          <button class="session-menu" onclick={(e) => openSessionMenu(e, session)} aria-label="更多"><span>⋯</span></button>
        </div>
      {/each}
    {/if}
    {#if client.sessions().length === 0}
      <div class="empty"><p>暂无会话</p></div>
    {/if}
  </div>

  <!-- Footer: user + add workspace -->
  <footer class="sidebar-footer">
    <button class="add-ws-btn" onclick={handleAddWorkspace}>
      <Icon name="folder-plus" size="sm" /> 添加工作区
    </button>
    <div class="user-area">
      <div class="user-avatar">{(authStatus?.name ?? 'U')[0].toUpperCase()}</div>
      <div class="user-info">
        <span class="user-name">{authStatus?.name ?? '未登录'}</span>
        {#if authStatus?.status === 'authenticated'}
          <span class="user-badge pro">Pro</span>
        {/if}
      </div>
    </div>
  </footer>
</div>

<!-- Context menus -->
{#if menuSession}
  <div class="glass-menu animate-spring-in" style="position: fixed; left: {Math.min(menuSession.x, innerWidth - 170)}px; top: {Math.min(menuSession.y, innerHeight - 160)}px; z-index: 300;" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="menu" tabindex="-1">
    <button class="glass-menu-item" onclick={() => startRename(menuSession!.id, menuSession!.title)}><Icon name="edit" size="sm" /> 重命名</button>
    <button class="glass-menu-item" onclick={() => handleFork(menuSession!.id)}><Icon name="git-branch" size="sm" /> Fork</button>
    <div class="glass-menu-divider"></div>
    <button class="glass-menu-item danger" onclick={() => handleArchive(menuSession!.id)}><Icon name="delete" size="sm" /> 归档</button>
  </div>
{/if}
{#if menuWorkspace}
  <div class="glass-menu animate-spring-in" style="position: fixed; left: {Math.min(menuWorkspace.x, innerWidth - 170)}px; top: {Math.min(menuWorkspace.y, innerHeight - 80)}px; z-index: 300;" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="menu" tabindex="-1">
    <button class="glass-menu-item danger" onclick={() => handleDeleteWorkspace(menuWorkspace!.id)}><Icon name="delete" size="sm" /> 删除工作区</button>
  </div>
{/if}

<ConfigDialog bind:open={showSettings} />

<style>
  .sidebar { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

  /* Nav bar */
  .nav-bar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 10px 10px 8px;
    flex: none;
  }
  .nav-btn {
    display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px;
    border: none; border-radius: 7px;
    background: transparent;
    color: #777;
    cursor: pointer;
    transition: all 0.12s;
  }
  .nav-btn:hover { background: rgba(255,255,255,0.06); color: #ccc; }
  .nav-spacer { flex: 1; }
  .collapse-btn { opacity: 0.5; }
  .collapse-btn:hover { opacity: 1; }

  /* Session list */
  .session-list { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 0 6px; }

  .ws-group { margin-bottom: 2px; }
  .ws-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 10px 3px;
    cursor: pointer; border-radius: 5px;
  }
  .ws-name {
    font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.05em;
    color: #555;
    font-family: "JetBrains Mono Variable", monospace;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ws-count {
    font-size: 10px; color: #444; font-family: monospace;
    flex-shrink: 0; margin-left: 4px;
  }

  .session-wrap {
    position: relative; display: flex; align-items: center;
    border-radius: 6px; transition: background 0.1s;
  }
  .session-wrap:hover { background: rgba(255,255,255,0.03); }
  .session-wrap.active { background: rgba(255,255,255,0.07); }

  .session-btn {
    flex: 1; display: block; text-align: left;
    padding: 5px 28px 5px 12px;
    border: none; border-radius: 6px;
    background: transparent;
    color: #888; font-size: 13px;
    cursor: pointer; overflow: hidden;
    transition: color 0.1s;
  }
  .session-btn:hover { color: rgba(255,255,255,0.92); }
  .session-btn.active { color: #fff; font-weight: 500; }
  .session-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .session-menu {
    position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
    display: flex; align-items: center; justify-content: center;
    width: 20px; height: 20px;
    border: none; border-radius: 4px;
    background: transparent; color: #555;
    cursor: pointer; opacity: 0;
    transition: opacity 0.12s;
  }
  .session-wrap:hover .session-menu { opacity: 1; }
  .session-menu:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.92); }
  .session-menu span { font-size: 13px; line-height: 1; }

  .rename-input {
    flex: 1; padding: 3px 6px; margin: 0 4px;
    border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;
    background: #0d0d0d; color: #fff; font-size: 13px; outline: none;
  }

  .empty { padding: 30px 20px; text-align: center; color: #555; }

  /* Footer */
  .sidebar-footer {
    flex: none; padding: 8px 8px;
    border-top: 1px solid rgba(255,255,255,0.04);
  }
  .add-ws-btn {
    width: 100%; display: flex; align-items: center; gap: 6px;
    padding: 6px 10px; border-radius: 6px; border: none;
    background: transparent; color: #666; font-size: 12px;
    cursor: pointer; transition: all 0.1s;
  }
  .add-ws-btn:hover { background: rgba(255,255,255,0.04); color: #aaa; }

  .user-area {
    display: flex; align-items: center; gap: 8px;
    margin-top: 8px; padding: 4px 6px;
  }
  .user-avatar {
    width: 26px; height: 26px; border-radius: 50%;
    background: #333; color: #aaa;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 600; flex-shrink: 0;
  }
  .user-info { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .user-name { font-size: 12px; color: #888; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .user-badge {
    font-size: 9px; font-weight: 700; padding: 1px 5px;
    border-radius: 999px; text-transform: uppercase;
  }
  .user-badge.pro { background: rgba(255,200,0,0.12); color: #eab308; }
</style>
