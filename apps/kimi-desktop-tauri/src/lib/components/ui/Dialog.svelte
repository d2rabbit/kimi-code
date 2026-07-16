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
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px) saturate(1.2);
    -webkit-backdrop-filter: blur(8px) saturate(1.2);
    animation: fadeIn 0.15s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
  }
  .dialog {
    background: rgba(28, 28, 30, 0.82);
    backdrop-filter: blur(30px) saturate(1.6);
    -webkit-backdrop-filter: blur(30px) saturate(1.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-xl, 16px);
    width: min(640px, 90vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.2);
    animation: springIn 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes springIn {
    from { transform: scale(0.92) translateY(12px); opacity: 0; }
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
  @media (prefers-reduced-motion: reduce) {
    .dialog-backdrop, .dialog { animation: none; }
  }
</style>
