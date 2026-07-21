<!-- TerminalDrawer.svelte — bottom collapsible terminal panel.

  Replaces the RightPanel terminal tab. The terminal now lives at the
  bottom of the chat column as a drawer that can be toggled open/closed
  and resized vertically. This frees the right rail for Git/Tasks tools
  and gives the terminal a wider, more natural workspace.
-->
<script lang="ts">
  import TerminalPanel from './TerminalPanel.svelte';
  import Icon from '../ui/Icon.svelte';

  let open = $state(false);
  let height = $state(240);
  let resizing = $state(false);

  function toggle() {
    open = !open;
  }

  function onResizeStart(e: MouseEvent) {
    e.preventDefault();
    resizing = true;
    const startY = e.clientY;
    const startHeight = height;

    function onMove(ev: MouseEvent) {
      if (!resizing) return;
      const delta = startY - ev.clientY;
      height = Math.max(120, Math.min(600, startHeight + delta));
    }
    function onUp() {
      resizing = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
</script>

<!-- Toggle bar (always visible at the bottom of the chat column) -->
<button
  class="term-toggle"
  class:open
  onclick={toggle}
  type="button"
  aria-expanded={open}
  aria-label="终端面板"
>
  <Icon name="terminal" size="sm" />
  <span class="term-toggle-label">终端</span>
  <Icon name={open ? 'chevron-down' : 'arrow-up'} size="sm" class="term-chevron" />
</button>

{#if open}
  <div class="term-drawer" style="--term-height: {height}px">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="term-resize-handle" onmousedown={onResizeStart} aria-label="调整终端高度" tabindex="-1" role="presentation"></div>
    <div class="term-content" style="height: {height}px">
      <TerminalPanel />
    </div>
  </div>
{/if}

<style>
  .term-toggle {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    height: 28px;
    padding: 0 14px;
    border: none;
    border-top: 1px solid var(--bd);
    background: var(--l1);
    color: var(--tx3);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease);
    user-select: none;
  }
  .term-toggle:hover {
    background: var(--l2);
    color: var(--tx);
  }
  .term-toggle.open {
    color: var(--ac);
    background: var(--l2);
  }
  .term-toggle-label { flex: 1; text-align: left; }

  .term-drawer {
    flex: none;
    display: flex;
    flex-direction: column;
    position: relative;
    background: var(--l1);
    border-top: 1px solid var(--bd2);
    overflow: hidden;
  }

  .term-resize-handle {
    height: 4px;
    cursor: ns-resize;
    background: transparent;
    transition: background var(--duration-fast) var(--ease);
    flex: none;
  }
  .term-resize-handle:hover {
    background: var(--ac-soft);
  }

  .term-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
