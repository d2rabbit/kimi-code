<!-- Button.svelte — design-system button primitive（主题契约驱动）。 -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from '../../lib/icon-types';

  let {
    variant = 'default' as 'default' | 'primary' | 'ghost' | 'danger' | 'cta',
    size = 'md' as 'sm' | 'md',
    icon,
    disabled = false,
    class: cls = '',
    onclick,
    children,
  }: {
    variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'cta';
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
    font-weight: var(--type-control-weight, 500);
    text-transform: var(--type-control-transform, none);
    letter-spacing: var(--type-control-tracking, normal);
    border-radius: var(--g-radius-control, 4px);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) transparent;
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
  /* sheen 槽：主题用 --mat-sheen 打开顶部高光，none 关闭 */
  .btn::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--mat-sheen, none);
    pointer-events: none;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn:not(:disabled):active {
    transform: var(--motion-press, scale(0.97));
    box-shadow: var(--motion-press-shadow, none);
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
    background: var(--mat-control-bg, var(--color-surface-raised, transparent));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border-color: var(--g-border-color, var(--color-line, rgba(255, 255, 255, 0.14)));
    color: var(--color-text, rgba(255, 255, 255, 0.92));
    box-shadow: var(--elev-control, none);
  }
  .btn-default:not(:disabled):hover {
    background: var(--mat-control-bg-hover, var(--color-hover, rgba(255, 255, 255, 0.06)));
    box-shadow: var(--elev-control-hover, var(--elev-control, none));
  }

  .btn-primary,
  .btn-cta {
    background: var(--mat-primary-bg, var(--color-accent, #4fa8ff));
    border-color: var(--mat-primary-bd, var(--color-accent-bd, transparent));
    color: var(--color-text-on-accent, #fff);
    font-weight: var(--type-primary-weight, 600);
    text-transform: var(--type-primary-transform, none);
    letter-spacing: var(--type-primary-tracking, normal);
    text-shadow: var(--type-primary-text-shadow, none);
    box-shadow: var(--elev-control, none);
  }
  .btn-primary:not(:disabled):hover,
  .btn-cta:not(:disabled):hover {
    background: var(--mat-primary-bg-hover, var(--color-accent-hover, #6fb2ff));
    box-shadow: var(--elev-control-hover, var(--elev-control, none));
  }
  .btn-cta:not(:disabled) {
    animation: var(--motion-cta-anim, none);
  }

  /* hover lift 仅在精确指针设备上生效（触屏不在 tap 时错误触发） */
  @media (hover: hover) and (pointer: fine) {
    .btn-default:not(:disabled):hover,
    .btn-primary:not(:disabled):hover,
    .btn-cta:not(:disabled):hover,
    .btn-danger:not(:disabled):hover {
      transform: var(--motion-hover-lift, none);
    }
  }

  .btn-ghost {
    background: transparent;
    color: var(--color-text-muted, rgba(235, 235, 245, 0.6));
    border-color: transparent;
    box-shadow: none;
  }
  .btn-ghost:not(:disabled):hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.06));
    color: var(--color-text, rgba(255, 255, 255, 0.92));
  }
  /* Ghost has no sheen */
  .btn-ghost::before {
    display: none;
  }

  .btn-danger {
    background: var(--mat-danger-bg, var(--color-danger, #e5484d));
    border-color: var(--color-danger-bd, transparent);
    color: #fff;
    text-shadow: var(--type-primary-text-shadow, none);
    box-shadow: var(--elev-control, none);
  }
  .btn-danger:not(:disabled):hover {
    box-shadow: var(--elev-control-hover, var(--elev-control, none));
  }

  @media (prefers-reduced-motion: reduce) {
    .btn,
    .btn::before {
      transition: none;
      animation: none;
    }
    .btn:not(:disabled):active,
    .btn:not(:disabled):hover {
      transform: none;
    }
  }
</style>
