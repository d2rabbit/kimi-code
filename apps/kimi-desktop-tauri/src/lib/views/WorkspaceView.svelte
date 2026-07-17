<!-- WorkspaceView.svelte — main workspace: sidebar + chat area + right panel. -->
<script lang="ts">
  import Sidebar from '../components/chat/Sidebar.svelte';
  import ChatArea from '../components/chat/ChatArea.svelte';
  import RightPanel from '../components/shell/RightPanel.svelte';
  import Resizer from '../components/shell/Resizer.svelte';

  let { onnavigate = () => {} }: { onnavigate?: () => void } = $props();

  let sidebarWidth = $state(220);

  function onSidebarResize(delta: number) {
    sidebarWidth = Math.max(160, Math.min(300, sidebarWidth + delta));
  }
</script>

<div class="workspace">
  <div class="sidebar-col" style="--sidebar-width: {sidebarWidth}px">
    <Sidebar {onnavigate} />
  </div>
  <Resizer orientation="vertical" onResize={onSidebarResize} />
  <main class="chat-col">
    <ChatArea />
  </main>
  <RightPanel />
</div>

<style>
  .workspace { display: flex; height: 100%; width: 100%; overflow: hidden; }
  .sidebar-col { flex: none; height: 100%; overflow: hidden; }
  .chat-col { flex: 1; min-width: 0; height: 100%; overflow: hidden; background: transparent; }
</style>
