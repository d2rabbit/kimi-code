<!-- Dialog.svelte — modal dialog primitive (Svelte 5). -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import IconButton from './IconButton.svelte';

  let {
    open = $bindable(true),
    title = '',
    onClose,
    children,
  }: {
    open?: boolean;
    title?: string;
    onClose?: () => void;
    children?: Snippet;
  } = $props();

  function close() {
    open = false;
    onClose?.();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }
</script>

<svelte:window onkeydown={open ? onKeydown : undefined} />

{#if open}
  <div class="dialog-backdrop" onclick={close} onkeydown={(e) => { if (e.key === "Escape") close(); }} role="presentation" tabindex="-1">
    <div class="dialog" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <header class="dialog-header">
        <h2>{title}</h2>
        <IconButton name="close" label="关闭" size="sm" onclick={close} />
      </header>
      <div class="dialog-body">
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 400);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--overlay);
    animation: dialogFadeIn var(--duration-base, 160ms) var(--ease, ease);
  }
  @keyframes dialogFadeIn {
    from { opacity: 0; }
  }
  .dialog {
    position: relative;
    background: var(--mat-surface-3, var(--l3));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border: var(--g-border-w, 1px) var(--g-border-style, solid)
      var(--g-border-color, rgba(255, 255, 255, 0.08));
    border-radius: var(--g-radius-overlay, 16px);
    width: min(640px, 90vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: var(--elev-overlay, 0 24px 80px rgba(0, 0, 0, 0.4));
    animation: dialogIn var(--duration-slow, 260ms) var(--motion-ease-enter, var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)));
    will-change: transform, opacity;
  }
  /* sheen 槽：玻璃/凝胶主题的顶部高光 */
  .dialog::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--mat-sheen, none);
    pointer-events: none;
  }
  @keyframes dialogIn {
    from { transform: scale(0.96) translateY(8px); opacity: 0; }
    to { transform: scale(1) translateY(0); opacity: 1; }
  }
  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-line, rgba(84,84,88,0.65));
    flex: none;
  }
  .dialog-header h2 {
    font-size: var(--text-lg, 16px);
    font-weight: var(--weight-medium, 500);
    margin: 0;
  }
  .dialog-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }
</style>
