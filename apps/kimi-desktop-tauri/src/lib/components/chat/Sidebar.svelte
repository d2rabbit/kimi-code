<!-- Sidebar.svelte — ZCode-style sidebar: icon nav + workspace groups + user area. -->
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
</script>

<svelte:window onclick={closeMenus} />

<aside class="sidebar">
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
    <button class="add-ws" onclick={addWorkspace}><Icon name="folder-plus" size="sm" /> 添加工作区</button>
    <div class="user">
      <div class="avatar">{(authName || 'U')[0].toUpperCase()}</div>
      <span class="user-name">{authName || '未登录'}</span>
      {#if authed}<span class="badge-pro">Pro</span>{/if}
    </div>
  </footer>
</aside>

{#if menuSession}
  <div class="ctx-menu" style="left:{Math.min(menuSession.x, innerWidth-160)}px;top:{Math.min(menuSession.y, innerHeight-140)}px" onclick={(e) => e.stopPropagation()} role="menu">
    <button class="ctx-item" onclick={() => startRename(menuSession!.id, menuSession!.title)}><Icon name="edit" size="sm" /> 重命名</button>
    <button class="ctx-item" onclick={() => fork(menuSession!.id)}><Icon name="git-branch" size="sm" /> Fork</button>
    <div class="ctx-sep"></div>
    <button class="ctx-item danger" onclick={() => archive(menuSession!.id)}><Icon name="delete" size="sm" /> 归档</button>
  </div>
{/if}

<style>
  .sidebar { width: var(--sidebar-width, 240px); flex: none; height: 100%; display: flex; flex-direction: column; background: rgba(13, 13, 15, 0.72); backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.6)); -webkit-backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.6)); border-right: 1px solid var(--glass-divider, rgba(255,255,255,0.06)); overflow: hidden; }

  .icon-nav { display: flex; align-items: center; gap: 2px; padding: 10px 10px 6px; flex: none; }
  .icon-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: none; border-radius: 6px; background: transparent; color: #666; cursor: pointer; transition: all 0.1s; }
  .icon-btn:hover { background: #1a1a1a; color: #ccc; }
  .nav-gap { flex: 1; }

  .sessions { flex: 1; overflow-y: auto; padding: 0 6px; }
  .ws-group { margin-bottom: 0; }
  .ws-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 2px; }
  .ws-name { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #555; font-family: "JetBrains Mono Variable", monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ws-count { font-size: 10px; color: #444; font-family: monospace; }

  .s-row { position: relative; display: flex; align-items: center; border-radius: 5px; }
  .s-row:hover { background: #161616; }
  .s-row.active { background: #2a2a2a; }
  .s-btn { flex: 1; text-align: left; padding: 5px 24px 5px 10px; border: none; border-radius: 5px; background: transparent; color: #888; font-size: 13px; cursor: pointer; overflow: hidden; }
  .s-btn:hover { color: #ddd; }
  .s-btn.active { color: #fff; font-weight: 500; }
  .s-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .s-more { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; border: none; border-radius: 4px; background: transparent; color: #555; cursor: pointer; opacity: 0; transition: opacity 0.1s; }
  .s-row:hover .s-more { opacity: 1; }
  .s-more:hover { background: rgba(255,255,255,0.1); color: #ddd; }
  .s-more span { font-size: 12px; }
  .rename { flex: 1; padding: 3px 6px; border: 1px solid #333; border-radius: 4px; background: #0a0a0a; color: #fff; font-size: 13px; outline: none; margin: 0 4px; }

  .empty { padding: 30px; text-align: center; color: #444; font-size: 12px; }

  .footer { flex: none; padding: 6px 8px; border-top: 1px solid #1a1a1a; }
  .add-ws { width: 100%; display: flex; align-items: center; gap: 6px; padding: 5px 8px; border: none; border-radius: 5px; background: transparent; color: #555; font-size: 12px; cursor: pointer; }
  .add-ws:hover { background: #161616; color: #999; }
  .user { display: flex; align-items: center; gap: 6px; margin-top: 6px; padding: 4px 4px; }
  .avatar { width: 22px; height: 22px; border-radius: 50%; background: #252525; color: #888; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; flex-shrink: 0; }
  .user-name { font-size: 11px; color: #777; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge-pro { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 999px; background: rgba(16,185,129,0.15); color: #10b981; }

  .ctx-menu { position: fixed; z-index: 300; background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); padding: 4px; min-width: 140px; }
  .ctx-item { display: flex; align-items: center; gap: 6px; width: 100%; padding: 5px 8px; border: none; border-radius: 5px; background: transparent; color: #ccc; font-size: 12px; cursor: pointer; text-align: left; }
  .ctx-item:hover { background: #2a2a2a; }
  .ctx-item.danger { color: #f85149; }
  .ctx-sep { height: 1px; background: #2a2a2a; margin: 3px 4px; }
</style>
