<!-- MenuItem.svelte — 菜单项（配合 Menu.svelte）。 -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from '../../lib/icon-types';

  let {
    icon,
    danger = false,
    disabled = false,
    class: cls = '',
    onclick,
    children,
  }: {
    icon?: IconName;
    danger?: boolean;
    disabled?: boolean;
    class?: string;
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
  } = $props();
</script>

<button
  type="button"
  role="menuitem"
  class="ui-menu-item {danger ? 'danger' : ''} {cls}"
  {disabled}
  {onclick}
>
  {#if icon}
    <Icon name={icon} size="sm" />
  {/if}
  <span class="ui-menu-item-label">{@render children?.()}</span>
</button>

<style>
  .ui-menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    width: 100%;
    padding: 7px 10px;
    background: transparent;
    border: none;
    border-radius: calc(var(--g-radius-control, 4px) - 2px);
    color: var(--color-text, inherit);
    font-family: var(--font-ui, inherit);
    font-size: var(--text-sm, 13px);
    font-weight: var(--type-control-weight, 500);
    text-align: left;
    cursor: pointer;
    transition:
      background var(--duration-fast, 120ms) var(--ease, ease),
      color var(--duration-fast, 120ms) var(--ease, ease);
  }
  .ui-menu-item:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.06));
  }
  .ui-menu-item.danger {
    color: var(--color-danger);
  }
  .ui-menu-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .ui-menu-item-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .ui-menu-item {
      transition: none;
    }
  }
</style>
