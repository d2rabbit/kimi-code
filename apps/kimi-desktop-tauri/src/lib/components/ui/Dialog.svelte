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

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div class="dialog-backdrop" onclick={close} role="presentation">
    <div class="dialog" role="dialog" aria-modal="true" aria-label={title} onclick={(e) => e.stopPropagation()}>
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
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    animation: fadeIn 0.15s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
  }
  .dialog {
    background: var(--color-surface, #121214);
    border: 1px solid var(--color-line, #2a2a2e);
    border-radius: var(--radius-xl, 16px);
    width: min(640px, 90vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-lg, 0 20px 60px rgba(0, 0, 0, 0.4));
    animation: slideUp 0.2s var(--ease-out, cubic-bezier(0.2, 0, 0, 1));
  }
  @keyframes slideUp {
    from { transform: translateY(16px); opacity: 0; }
  }
  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-line, #2a2a2e);
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
  @media (prefers-reduced-motion: reduce) {
    .dialog-backdrop, .dialog { animation: none; }
  }
</style>
