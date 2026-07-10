<!-- Sidebar.svelte — workspace groups + session list. -->
<script lang="ts">
  import * as client from '../../stores/client.svelte';
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';

  function handleSelect(e: Event, sessionId: string) {
    e.preventDefault();
    client.client.selectSession(sessionId);
  }

  function handleNew() {
    client.client.clearActiveSession();
  }

  async function handleAddWorkspace() {
    const path = prompt('输入工作区路径:');
    if (path) {
      await client.client.addWorkspaceByPath(path);
    }
  }
</script>

<div class="sidebar">
  <!-- Header -->
  <header class="sidebar-header">
    <div class="brand">
      <span class="brand-logo">◧</span>
      <span class="brand-name">Kimi Code</span>
    </div>
    <IconButton name="settings" label="设置" size="sm" />
  </header>

  <!-- New session button -->
  <div class="new-session-row">
    <button class="new-session-btn" onclick={handleNew}>
      <Icon name="chat-new" size="sm" />
      <span>新对话</span>
    </button>
  </div>

  <!-- Workspaces + sessions -->
  <div class="sidebar-body">
    {#if client.workspaces.length > 0}
      {#each client.workspaces as ws (ws.id)}
        <div class="workspace-group">
          <div class="workspace-header">
            <Icon name="folder" size="sm" />
            <span class="workspace-name" title={ws.name}>{ws.name}</span>
          </div>
          {#each client.sessions.filter((s) => s.workspaceId === ws.id) as session (session.id)}
            <button
              class="session-row"
              class:active={session.id === client.activeSessionId}
              onclick={(e) => handleSelect(e, session.id)}
            >
              <span class="session-title">{session.title || '新对话'}</span>
            </button>
          {/each}
        </div>
      {/each}
    {:else}
      <!-- No workspaces: show all sessions -->
      {#each client.sessions as session (session.id)}
        <button
          class="session-row"
          class:active={session.id === client.activeSessionId}
          onclick={(e) => handleSelect(e, session.id)}
        >
          <span class="session-title">{session.title || '新对话'}</span>
        </button>
      {/each}
    {/if}

    {#if client.sessions.length === 0}
      <div class="empty-state">
        <Icon name="chat-new" size="lg" />
        <p>还没有对话</p>
      </div>
    {/if}
  </div>

  <!-- Footer -->
  <footer class="sidebar-footer">
    <button class="add-workspace-btn" onclick={handleAddWorkspace}>
      <Icon name="folder-plus" size="sm" />
      <span>添加工作区</span>
    </button>
  </footer>
</div>

<style>
  .sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    flex: none;
    -webkit-app-region: drag;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .brand-logo {
    font-size: 18px;
    color: var(--color-accent, #7c8cff);
  }
  .brand-name {
    font-weight: var(--weight-medium, 500);
    font-size: var(--text-base, 14px);
  }

  .new-session-row {
    padding: 0 10px 8px;
    flex: none;
  }
  .new-session-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--color-line, #2a2a2e);
    background: var(--color-surface-raised, transparent);
    color: var(--color-text, #e7e7ea);
    font-size: var(--text-base, 14px);
    cursor: pointer;
    transition: background var(--duration-fast, 120ms);
  }
  .new-session-btn:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.06));
  }

  .sidebar-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0 6px;
  }

  .workspace-group {
    margin-bottom: 4px;
  }
  .workspace-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    color: var(--color-text-faint, #6a6a72);
    font-size: var(--text-xs, 12px);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: var(--weight-medium, 500);
  }
  .workspace-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-row {
    display: block;
    width: 100%;
    text-align: left;
    padding: 7px 10px;
    border-radius: var(--radius-sm, 6px);
    border: none;
    background: transparent;
    color: var(--color-text-muted, #9a9aa2);
    font-size: var(--text-sm, 13px);
    cursor: pointer;
    transition:
      background var(--duration-fast, 120ms),
      color var(--duration-fast, 120ms);
  }
  .session-row:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.04));
    color: var(--color-text, #e7e7ea);
  }
  .session-row.active {
    background: var(--color-selected, rgba(124, 140, 255, 0.12));
    color: var(--color-text, #e7e7ea);
  }
  .session-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px 20px;
    color: var(--color-text-faint, #6a6a72);
  }
  .empty-state p {
    font-size: var(--text-sm, 13px);
  }

  .sidebar-footer {
    flex: none;
    padding: 8px 10px;
    border-top: 1px solid var(--color-line, #2a2a2e);
  }
  .add-workspace-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: var(--radius-sm, 6px);
    border: none;
    background: transparent;
    color: var(--color-text-muted, #9a9aa2);
    font-size: var(--text-sm, 13px);
    cursor: pointer;
    transition: background var(--duration-fast, 120ms);
  }
  .add-workspace-btn:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.06));
    color: var(--color-text, #e7e7ea);
  }
</style>
