<!-- Button.svelte — design-system button primitive. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from '../../lib/icon-types';

  let {
    variant = 'default' as 'default' | 'primary' | 'ghost' | 'danger',
    size = 'md' as 'sm' | 'md',
    icon,
    disabled = false,
    class: cls = '',
    onclick,
    children,
  }: {
    variant?: 'default' | 'primary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    icon?: IconName;
    disabled?: boolean;
    class?: string;
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
  } = $props();
</script>

<button
  class="btn btn-{variant} btn-{size} {cls}"
  {disabled}
  {onclick}
  type="button"
>
  {#if icon}
    <Icon name={icon} size={size === 'sm' ? 'sm' : 'md'} />
  {/if}
  {@render children?.()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 8px);
    font-family: var(--font-ui, inherit);
    font-weight: var(--weight-medium, 500);
    border-radius: var(--radius-md, 8px);
    border: 1px solid transparent;
    cursor: pointer;
    transition:
      background var(--duration-fast, 120ms) var(--ease-out, ease),
      border-color var(--duration-fast, 120ms) var(--ease-out, ease),
      opacity var(--duration-fast, 120ms);
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn:not(:disabled):active {
    transform: scale(0.98);
  }

  .btn-md {
    padding: 8px 14px;
    font-size: var(--text-base, 14px);
  }
  .btn-sm {
    padding: 5px 10px;
    font-size: var(--text-sm, 13px);
  }

  .btn-default {
    background: var(--color-surface-raised, transparent);
    border-color: var(--color-line, rgba(84,84,88,0.65));
    color: var(--color-text, rgba(255,255,255,0.92));
  }
  .btn-default:not(:disabled):hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.06));
  }

  .btn-primary {
    background: var(--color-accent, #2dd4bf);
    color: var(--color-text-on-accent, #fff);
  }
  .btn-primary:not(:disabled):hover {
    background: var(--color-accent-hover, #6b7df0);
  }

  .btn-ghost {
    background: transparent;
    color: var(--color-text-muted, rgba(235,235,245,0.6));
  }
  .btn-ghost:not(:disabled):hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.06));
    color: var(--color-text, rgba(255,255,255,0.92));
  }

  .btn-danger {
    background: var(--color-danger, #ff453a);
    color: #fff;
  }
  .btn-danger:not(:disabled):hover {
    opacity: 0.9;
  }
</style>
