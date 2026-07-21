<!-- Sidebar.svelte — frosted sidebar: new task + module nav + workspace-grouped sessions + user/settings footer. -->
<script lang="ts">
  import * as client from '../../stores/client.svelte';
  import Icon from '../ui/Icon.svelte';
  import Empty from '../ui/Empty.svelte';
  import { tooltip } from '../../actions/tooltip';
  import FolderPicker from '../shell/FolderPicker.svelte';
  import { shortcut } from '../../lib/desktopFlag';

  let {
    onnavigate = () => {},
    onmoduleview = (_view: string) => {},
    activeModule = 'chat',
  }: {
    onnavigate?: () => void;
    onmoduleview?: (view: string) => void;
    activeModule?: string;
  } = $props();

  let menuSession = $state<{ id: string; title: string; x: number; y: number } | null>(null);
  let showFolderPicker = $state(false);
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  /** Collapsed workspace ids. */
  let collapsed = $state<Set<string>>(new Set());

  function select(e: Event, id: string) {
    if (renamingId === id) return;
    e.preventDefault();
    void client.client.selectSession(id);
    onmoduleview('chat');
  }
  function newChat() {
    // 新建任务 = 先选工作文件夹（“添加工作区”的意义合并进这一步）
    showFolderPicker = true;
  }
  async function selectFolder(path: string) {
    showFolderPicker = false;
    await client.client.addWorkspaceByPath(path);
    client.client.clearActiveSession();
    onmoduleview('chat');
  }

  function toggleWs(id: string) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    collapsed = next;
  }

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
  function closeMenus() { menuSession = null; }

  function wsSessions(wsId: string, root: string) {
    return client.sessions().filter((s) => s.workspaceId === wsId || (!s.workspaceId && s.cwd === root));
  }

  const authName = $derived(client.authProvider()?.name ?? '');
  const authed = $derived(client.authProvider()?.status === 'authenticated');
  const pendingCount = $derived(client.pendingApprovals().length + client.questions().length);
</script>

<svelte:window onclick={closeMenus} />

<aside class="sidebar">
  <!-- New task -->
  <button class="newtask" onclick={newChat}>＋ 新建任务 <span>{shortcut('N')}</span></button>

  <!-- Module nav -->
  <nav class="mods">
    <button class="mod" class:on={activeModule === 'plugins'} onclick={() => onmoduleview('plugins')}><span class="ic">⬡</span>插件</button>
    <button class="mod" class:on={activeModule === 'subagents'} onclick={() => onmoduleview('subagents')}><span class="ic">◈</span>子智能体</button>
    <button class="mod" class:on={activeModule === 'archive'} onclick={() => onmoduleview('archive')}><span class="ic">▤</span>归档历史</button>
  </nav>

  <!-- Sessions header -->
  <div class="sess-head">
    <span class="sec-t">会话</span>
    <span class="add" role="button" tabindex="0" title="新建任务" onclick={newChat} onkeydown={(e) => { if (e.key === 'Enter') newChat(); }}>＋</span>
  </div>

  <!-- Sessions grouped by workspace -->
  <div class="sess-list">
    {#if client.workspaces().length > 0}
      {#each client.workspaces() as ws (ws.id)}
        {@const list = wsSessions(ws.id, ws.root)}
        <div class="ws-g" class:closed={collapsed.has(ws.id)} role="button" tabindex="0" onclick={() => toggleWs(ws.id)} onkeydown={(e) => { if (e.key === 'Enter') toggleWs(ws.id); }}>
          <span class="arrow">▾</span>
          <span class="ws-name" title={ws.name}>{ws.name}</span>
          <span class="cnt">{list.length}</span>
        </div>
        {#if !collapsed.has(ws.id)}
          {#each list as s (s.id)}
            <div class="s-row" class:active={s.id === client.activeSessionId() && activeModule === 'chat'}>
              {#if renamingId === s.id}
                <input class="rename" type="text" bind:value={renameValue}
                  onkeydown={(e) => { if (e.key==='Enter') confirmRename(s.id); if (e.key==='Escape') renamingId=null; }}
                  onblur={() => confirmRename(s.id)} onclick={(e) => e.stopPropagation()} />
              {:else}
                <button class="s-btn" class:active={s.id === client.activeSessionId() && activeModule === 'chat'} onclick={(e) => select(e, s.id)} oncontextmenu={(e) => openMenu(e, s)}>
                  {#if s.status === 'running' || s.status === 'awaitingApproval' || s.status === 'awaitingQuestion'}
                    <span class="s-status-dot" data-status={s.status}></span>
                  {/if}
                  <span class="s-title">{s.title || '新对话'}</span>
                </button>
              {/if}
              {#if renamingId !== s.id}
                <button class="s-more" aria-label="更多" onclick={(e) => openMenu(e, s)}><span>⋯</span></button>
              {/if}
            </div>
          {/each}
        {/if}
      {/each}
    {:else if client.sessions().length > 0}
      {#each client.sessions() as s (s.id)}
        <div class="s-row" class:active={s.id === client.activeSessionId() && activeModule === 'chat'}>
          <button class="s-btn" class:active={s.id === client.activeSessionId() && activeModule === 'chat'} onclick={(e) => select(e, s.id)} oncontextmenu={(e) => openMenu(e, s)}>
            {#if s.status === 'running' || s.status === 'awaitingApproval' || s.status === 'awaitingQuestion'}
              <span class="s-status-dot" data-status={s.status}></span>
            {/if}
            <span class="s-title">{s.title || '新对话'}</span>
          </button>
          <button class="s-more" aria-label="更多" onclick={(e) => openMenu(e, s)}><span>⋯</span></button>
        </div>
      {/each}
    {/if}
    {#if client.sessions().length === 0 && client.workspaces().length === 0}
      <Empty icon="❯" title="暂无会话" desc="点击「新建任务」开始你的第一个任务" />
    {/if}
  </div>

  <!-- Footer: account + settings -->
  <footer class="footer">
    {#if pendingCount > 0}
      <div class="attention-badge">{pendingCount}</div>
    {/if}
    <div class="avatar">{(authName || 'U')[0].toUpperCase()}</div>
    <span class="user-name">{authName || '未登录'}</span>
    {#if authed}<span class="badge-pro">Pro</span>{/if}
    <button class="gear" use:tooltip={'设置'} onclick={onnavigate}><Icon name="settings" size="md" /></button>
  </footer>
</aside>

{#if showFolderPicker}
  <FolderPicker onselect={selectFolder} oncancel={() => showFolderPicker = false} />
{/if}

{#if menuSession}
  <div class="glass-menu animate-spring-in" style="position: fixed; left: {Math.min(menuSession.x, innerWidth - 170)}px; top: {Math.min(menuSession.y, innerHeight - 160)}px; z-index: 300;" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="menu" tabindex="-1">
    <button class="glass-menu-item" onclick={() => startRename(menuSession!.id, menuSession!.title)}><Icon name="pencil" size="sm" /> 重命名</button>
    <button class="glass-menu-item" onclick={() => fork(menuSession!.id)}><Icon name="git-branch" size="sm" /> Fork</button>
    <div class="glass-menu-divider"></div>
    <button class="glass-menu-item danger" onclick={() => archive(menuSession!.id)}><Icon name="delete" size="sm" /> 归档</button>
  </div>
{/if}

<style>
  .sidebar { width: var(--sidebar-width, 216px); flex: none; height: 100%; display: flex; flex-direction: column; background: var(--l1); border-right: 1px solid var(--bd); overflow: hidden; }

  /* ---- New task ---- */
  .newtask {
    margin: 12px 12px 8px; display: flex; align-items: center; justify-content: center; gap: 6px;
    height: 32px; border: none; border-radius: var(--r-md); font-size: 12.5px; font-weight: 600;
    background: var(--ac); color: #fff; cursor: pointer;
    box-shadow: 0 1px 6px rgba(79, 168, 255, 0.22);
    transition: background var(--duration-fast) var(--ease), transform var(--duration-fast) var(--ease);
  }
  .newtask:hover { background: var(--ac-h); transform: translateY(-1px); }
  .newtask span { opacity: 0.65; font-weight: 400; font-size: 11px; }

  /* ---- Module nav ---- */
  .mods { display: flex; flex-direction: column; padding: 2px 8px 8px; border-bottom: 1px solid var(--bd); }
  .mod {
    display: flex; align-items: center; gap: 9px; height: 30px; padding: 0 9px; border: none;
    border-radius: var(--r-sm); font-size: 12px; color: var(--tx2); background: transparent;
    cursor: pointer; text-align: left; transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease);
  }
  .mod:hover { background: var(--ac-soft); color: var(--tx); }
  .mod.on { background: var(--ac-soft); color: var(--ac); font-weight: 600; }
  .mod .ic { width: 15px; text-align: center; color: var(--tx3); font-size: 12px; }
  .mod.on .ic { color: var(--ac); }

  /* ---- Sessions header ---- */
  .sess-head { display: flex; align-items: center; padding: 12px 14px 5px; }
  .sec-t { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--tx3); font-weight: 600; }
  .sess-head .add { margin-left: auto; color: var(--tx3); font-size: 13px; cursor: pointer; padding: 0 3px; border-radius: 4px; }
  .sess-head .add:hover { color: var(--tx); background: var(--ac-soft); }

  /* ---- Workspace groups + session rows ---- */
  .sess-list { flex: 1; overflow-y: auto; padding-bottom: 8px; }
  /* Workspace header — bigger and more prominent than the session rows
     underneath, so the workspace → session hierarchy is visually obvious. */
  .ws-g {
    display: flex; align-items: center; gap: 6px;
    height: 30px; padding: 0 14px;
    font-size: 12.5px; font-weight: 700; letter-spacing: 0.01em;
    text-transform: none;
    cursor: pointer; user-select: none; color: var(--tx);
    margin: 8px 0 2px;
    border-top: 1px solid var(--bd);
    background: linear-gradient(180deg, transparent 0%, var(--l2) 100%);
  }
  .ws-g:first-child { border-top: none; margin-top: 0; }
  .ws-g .arrow { font-size: 9px; color: var(--tx3); width: 10px; transition: transform var(--duration-fast) var(--ease); }
  .ws-g.closed .arrow { transform: rotate(-90deg); }
  .ws-g .ws-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .ws-g .cnt {
    margin-left: auto; font-size: 10px; color: var(--tx3); font-weight: 500;
    background: var(--l3); padding: 1px 7px; border-radius: 999px;
    min-width: 18px; text-align: center;
  }

  /* Session row — indented under the workspace header, smaller font,
     lighter weight: clear subordinate in the hierarchy. */
  .s-row {
    position: relative; display: flex; align-items: center;
    border-radius: var(--r-sm); margin: 1px 6px 1px 20px;  /* ← left indent */
  }
  .s-row:hover { background: var(--ac-soft); }
  .s-row.active { background: var(--ac-soft); }
  .s-btn {
    flex: 1; display: flex; align-items: center; gap: 7px; text-align: left;
    height: 28px; padding: 0 22px 0 14px;
    border: none; border-radius: var(--r-sm);
    background: transparent; color: var(--tx2);
    font-size: 11.5px; font-weight: 400; cursor: pointer; overflow: hidden;
  }
  .s-btn:hover { color: var(--tx); }
  .s-btn.active { color: var(--tx); font-weight: 600; }
  .s-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .s-status-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
  .s-status-dot[data-status="running"] { background: var(--ok); box-shadow: 0 0 6px var(--ok); animation: kimi-pulse 1.5s infinite; }
  .s-status-dot[data-status="awaitingApproval"] { background: var(--warn); box-shadow: 0 0 6px var(--warn); }
  .s-status-dot[data-status="awaitingQuestion"] { background: var(--ac); box-shadow: 0 0 6px var(--ac); }
  @media (prefers-reduced-motion: reduce) {
    .s-status-dot[data-status="running"] { animation: none; }
  }
  .s-more { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; border: none; border-radius: 4px; background: transparent; color: var(--tx3); cursor: pointer; opacity: 0; transition: opacity var(--duration-fast); }
  .s-row:hover .s-more { opacity: 1; }
  .s-more:hover { background: var(--color-hover); color: var(--tx2); }
  .s-more span { font-size: 12px; }
  .rename { flex: 1; padding: 3px 6px; border: 1px solid var(--bd2); border-radius: var(--r-sm); background: var(--l2); color: var(--tx); font-size: 12px; outline: none; margin: 0 4px; }
  .rename:focus { border-color: var(--ac); }


  /* ---- Footer ---- */
  .footer { flex: none; display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--bd); position: relative; }
  .attention-badge { position: absolute; top: -8px; right: 8px; background: var(--err); color: #fff; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: var(--radius-full); }
  .avatar { width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #4fa8ff, #5bc0be); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; flex-shrink: 0; }
  .user-name { font-size: 12px; color: var(--tx); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge-pro { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; border: 1px solid var(--amb); color: var(--amb); background: transparent; }
  .gear { margin-left: auto; width: 26px; height: 26px; border: none; border-radius: var(--r-sm); display: flex; align-items: center; justify-content: center; background: transparent; color: var(--tx2); cursor: pointer; transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease); }
  .gear:hover { background: var(--ac-soft); color: var(--tx); }
</style>
