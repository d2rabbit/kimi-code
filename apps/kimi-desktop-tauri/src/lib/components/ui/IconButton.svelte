<!-- IconButton.svelte — icon-only button primitive. -->
<script lang="ts">
  import Icon from './Icon.svelte';
  import type { IconName, IconSize } from '../../lib/icon-types';

  let {
    name,
    size = 'md' as IconSize,
    variant = 'ghost' as 'ghost' | 'default',
    label,
    disabled = false,
    class: cls = '',
    onclick,
  }: {
    name: IconName;
    size?: IconSize;
    variant?: 'ghost' | 'default';
    label: string;
    disabled?: boolean;
    class?: string;
    onclick?: (e: MouseEvent) => void;
  } = $props();
</script>

<button
  class="icon-btn icon-btn-{variant} {cls}"
  {disabled}
  {onclick}
  type="button"
  aria-label={label}
  title={label}
>
  <Icon {name} {size} />
</button>

<style>
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--g-radius-control, 4px);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) transparent;
    cursor: pointer;
    background: transparent;
    color: var(--color-text-muted, rgba(235,235,245,0.6));
    position: relative;
    overflow: hidden;
    transition:
      transform var(--duration-fast, 120ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
      background var(--duration-fast, 120ms) var(--ease-out, ease),
      color var(--duration-fast, 120ms),
      border-color var(--duration-fast, 120ms);
    flex: none;
  }
  .icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .icon-btn:not(:disabled):hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.08));
    color: var(--color-text, rgba(255,255,255,0.92));
  }
  .icon-btn:not(:disabled):active {
    transform: var(--motion-press, scale(0.97));
    box-shadow: var(--motion-press-shadow, none);
  }
  .icon-btn-default {
    background: var(--mat-control-bg, transparent);
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border-color: var(--g-border-color, var(--color-line, transparent));
    box-shadow: var(--elev-control, none);
  }
  .icon-btn-default:not(:disabled):hover {
    background: var(--mat-control-bg-hover, var(--color-hover, rgba(255, 255, 255, 0.08)));
    box-shadow: var(--elev-control-hover, var(--elev-control, none));
  }
  @media (prefers-reduced-motion: reduce) {
    .icon-btn {
      transition: none;
    }
    .icon-btn:not(:disabled):active {
      transform: none;
    }
  }
</style>
