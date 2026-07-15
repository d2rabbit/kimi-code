<!-- Resizer.svelte — drag-to-resize splitter between layout columns. -->
<script lang="ts">
  let {
    orientation = 'vertical' as 'vertical' | 'horizontal',
    onResize,
  }: {
    orientation?: 'vertical' | 'horizontal';
    onResize: (deltaPx: number) => void;
  } = $props();

  let dragging = $state(false);
  let lastPos = 0;

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    lastPos = orientation === 'vertical' ? e.clientX : e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const pos = orientation === 'vertical' ? e.clientX : e.clientY;
    onResize(pos - lastPos);
    lastPos = pos;
  }

  function onPointerUp() {
    dragging = false;
  }
</script>

<div
  class="resizer {orientation}"
  class:dragging
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  role="separator"
  aria-orientation={orientation}
></div>

<style>
  .resizer.vertical {
    width: 4px;
    cursor: col-resize;
    height: 100%;
    flex: none;
  }
  .resizer.horizontal {
    height: 4px;
    cursor: row-resize;
    width: 100%;
    flex: none;
  }
  .resizer {
    background: transparent;
    transition: background 120ms;
    z-index: 10;
    touch-action: none;
  }
  .resizer:hover,
  .resizer.dragging {
    background: var(--color-line-strong, rgba(84, 84, 88, 0.4));
  }
</style>
