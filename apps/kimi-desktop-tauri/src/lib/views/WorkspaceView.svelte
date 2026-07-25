<!-- WorkspaceView.svelte — main workspace: sidebar + (chat area + right panel | module view). -->
<script lang="ts">
  import Sidebar from '../components/chat/Sidebar.svelte';
  import ChatArea from '../components/chat/ChatArea.svelte';
  import RightPanel from '../components/shell/RightPanel.svelte';
  import TerminalDrawer from '../components/shell/TerminalDrawer.svelte';
  import Resizer from '../components/shell/Resizer.svelte';
  import PluginsView from './PluginsView.svelte';
  import SubagentsView from './SubagentsView.svelte';
  import ArchiveView from './ArchiveView.svelte';

  let { onnavigate = () => {} }: { onnavigate?: () => void } = $props();

  type ModuleView = 'chat' | 'plugins' | 'subagents' | 'archive';
  let activeView = $state<ModuleView>('chat');

  let sidebarWidth = $state(224);

  function onSidebarResize(delta: number) {
    sidebarWidth = Math.max(180, Math.min(320, sidebarWidth + delta));
  }

  function onmoduleview(view: string) {
    activeView = view as ModuleView;
  }
</script>

<div class="workspace">
  <div class="sidebar-col" style="--sidebar-width: {sidebarWidth}px">
    <Sidebar {onnavigate} {onmoduleview} activeModule={activeView} />
  </div>
  <Resizer orientation="vertical" onResize={onSidebarResize} />
  {#if activeView === 'chat'}
    <main class="chat-col">
      <ChatArea />
      <TerminalDrawer />
    </main>
    <RightPanel />
  {:else if activeView === 'plugins'}
    <PluginsView />
  {:else if activeView === 'subagents'}
    <SubagentsView />
  {:else if activeView === 'archive'}
    <ArchiveView />
  {/if}
</div>

<style>
  .workspace { display: flex; height: 100%; width: 100%; overflow: hidden; }
  .sidebar-col { flex: none; height: 100%; overflow: hidden; }
  .chat-col { flex: 1; min-width: 0; height: 100%; overflow: hidden; background: transparent; }
  .chat-col, .workspace > :global(.page) { animation: view-in 0.18s var(--motion-ease-enter, var(--ease)); }
  @keyframes view-in { from { opacity: 0; transform: translateY(4px); } }
</style>
