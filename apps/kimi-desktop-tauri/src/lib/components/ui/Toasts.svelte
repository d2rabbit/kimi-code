<!-- Toasts.svelte — global toast renderer. Mount once in App. -->
<script lang="ts">
  import { toasts } from '../../stores/toast.svelte';
</script>

<div class="toast-root" aria-live="polite">
  {#each toasts() as t (t.id)}
    <div class="toast" class:err={t.kind === 'err'} class:info={t.kind === 'info'}>{t.text}</div>
  {/each}
</div>

<style>
  .toast-root {
    position: fixed;
    bottom: 26px;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-toast, 600);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  }
  .toast {
    padding: 9px 16px;
    border-radius: 999px;
    background: var(--l3);
    border: 1px solid var(--bd2);
    color: var(--ok);
    font-size: 12px;
    font-weight: 500;
    box-shadow: var(--sh-lg);
    animation: toast-in 0.2s var(--ease);
    max-width: min(480px, 80vw);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toast.err { color: var(--err); }
  .toast.info { color: var(--tx); }
  @keyframes toast-in {
    from { opacity: 0; transform: translateY(8px); }
  }
</style>
