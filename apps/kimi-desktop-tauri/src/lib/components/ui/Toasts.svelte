<!-- Toasts.svelte — global toast renderer. Mount once in App. -->
<script lang="ts">
  import { fly } from 'svelte/transition';
  import { toasts } from '../../stores/toast.svelte';

  const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
</script>

<div class="toast-root" aria-live="polite">
  {#each toasts() as t (t.id)}
    <div
      class="toast"
      class:err={t.kind === 'err'}
      class:info={t.kind === 'info'}
      in:fly={{ y: reduceMotion ? 0 : 8, duration: reduceMotion ? 0 : 180 }}
      out:fly={{ y: reduceMotion ? 0 : 4, duration: reduceMotion ? 0 : 110 }}
    >{t.text}</div>
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
    border-radius: var(--g-radius-chip, 999px);
    background: var(--mat-surface-3, var(--l3));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd2));
    color: var(--ok);
    font-size: 12px;
    font-weight: 500;
    box-shadow: var(--elev-overlay, var(--sh-lg));
    max-width: min(480px, 80vw);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toast.err { color: var(--err); }
  .toast.info { color: var(--tx); }
</style>
