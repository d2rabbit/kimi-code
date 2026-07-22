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
    border-radius: var(--r-sm, 4px);
    border: 1px solid transparent;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition:
      transform var(--duration-fast, 120ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
      background var(--duration-fast, 120ms) var(--ease-out, ease),
      border-color var(--duration-fast, 120ms) var(--ease-out, ease),
      box-shadow var(--duration-fast, 120ms) var(--ease-out, ease),
      opacity var(--duration-fast, 120ms);
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
  }
  /* Aero glass top-light highlight (::before) */
  .btn::before {
    content: '';
    position: absolute;
    left: 0; right: 0; top: 0; height: 50%;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.18), transparent);
    pointer-events: none;
    border-radius: inherit;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn:not(:disabled):active {
    transform: scale(0.97);
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
    background: var(--l2-glass, var(--color-surface-raised, transparent));
    backdrop-filter: blur(16px) saturate(1.4);
    -webkit-backdrop-filter: blur(16px) saturate(1.4);
    border-color: var(--bd-glass, var(--color-line, rgba(255,255,255,0.14)));
    color: var(--color-text, rgba(255,255,255,0.92));
    box-shadow: inset 0 1px 0 var(--shine-overlay, rgba(255,255,255,0.08)), 0 2px 8px rgba(0,0,0,0.15);
  }
  .btn-default:not(:disabled):hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.06));
    border-color: var(--bd2, rgba(255,255,255,0.25));
  }

  .btn-primary {
    background: var(--ac-gradient, var(--color-accent, #4fa8ff));
    color: var(--color-text-on-accent, #fff);
    border-color: var(--ac-bd, rgba(79,168,255,0.50));
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.30), 0 4px 14px var(--ac-soft, rgba(79,168,255,0.30));
  }
  .btn-primary:not(:disabled):hover {
    background: var(--ac-gradient-hover, var(--color-accent-hover, #6fb2ff));
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), 0 6px 20px var(--ac-soft, rgba(79,168,255,0.45));
  }

  /* hover lift 仅在精确指针设备上生效（触屏不在 tap 时错误触发） */
  @media (hover: hover) and (pointer: fine) {
    .btn-default:not(:disabled):hover {
      transform: translateY(-1px);
    }
    .btn-primary:not(:disabled):hover {
      transform: translateY(-1px);
    }
  }

  .btn-ghost {
    background: transparent;
    color: var(--color-text-muted, rgba(235,235,245,0.6));
  }
  .btn-ghost:not(:disabled):hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.06));
    color: var(--color-text, rgba(255,255,255,0.92));
  }
  /* Ghost has no glass highlight */
  .btn-ghost::before { display: none; }

  .btn-danger {
    background: var(--danger-gradient, linear-gradient(135deg, #ff6b60, #e5484d));
    color: #fff;
    border-color: rgba(255, 107, 96, 0.50);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 14px rgba(255,107,96,0.30);
  }
  .btn-danger:not(:disabled):hover {
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.30), 0 6px 20px rgba(255,107,96,0.40);
  }
  @media (hover: hover) and (pointer: fine) {
    .btn-danger:not(:disabled):hover {
      transform: translateY(-1px);
    }
  }
</style>
