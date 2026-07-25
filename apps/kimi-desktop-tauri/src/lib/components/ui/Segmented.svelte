<!-- Segmented.svelte — 分段控件（主题选择器等）。主题契约驱动。 -->
<script lang="ts">
  import Icon from './Icon.svelte';
  import type { IconName } from '../../lib/icon-types';

  let {
    value = $bindable(''),
    options = [] as Array<{ value: string; label: string; icon?: IconName }>,
    size = 'md' as 'sm' | 'md',
    class: cls = '',
    onchange,
  }: {
    value?: string;
    options?: Array<{ value: string; label: string; icon?: IconName }>;
    size?: 'sm' | 'md';
    class?: string;
    onchange?: (value: string) => void;
  } = $props();
</script>

<div class="ui-seg ui-seg-{size} {cls}" role="tablist">
  {#each options as opt (opt.value)}
    <button
      type="button"
      role="tab"
      aria-selected={value === opt.value}
      class="ui-seg-btn {value === opt.value ? 'on' : ''}"
      onclick={() => {
        value = opt.value;
        onchange?.(opt.value);
      }}
    >
      {#if opt.icon}<Icon name={opt.icon} size="sm" />{/if}
      {opt.label}
    </button>
  {/each}
</div>

<style>
  .ui-seg {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--g-radius-control, 4px);
    border: var(--g-border-w, 1px) var(--g-border-style, solid)
      var(--g-border-color, var(--color-line));
    background: var(--mat-surface-1, var(--color-surface));
    box-shadow: var(--elev-input, none);
  }
  .ui-seg-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: var(--g-border-w, 1px) solid transparent;
    border-radius: calc(var(--g-radius-control, 4px) - 2px);
    background: transparent;
    color: var(--color-text-muted, inherit);
    font-family: var(--font-ui, inherit);
    font-weight: var(--type-control-weight, 500);
    text-transform: var(--type-control-transform, none);
    letter-spacing: var(--type-control-tracking, normal);
    cursor: pointer;
    transition:
      transform var(--duration-fast, 120ms) var(--ease-out, ease),
      background var(--duration-fast, 120ms) var(--ease, ease),
      box-shadow var(--duration-fast, 120ms) var(--ease, ease);
  }
  .ui-seg-md .ui-seg-btn {
    padding: 6px 12px;
    font-size: var(--text-sm, 13px);
  }
  .ui-seg-sm .ui-seg-btn {
    padding: 4px 8px;
    font-size: var(--text-xs, 12px);
  }
  .ui-seg-btn:hover {
    color: var(--color-text, inherit);
  }
  .ui-seg-btn.on {
    background: var(--mat-primary-bg, var(--color-accent));
    border-color: var(--mat-primary-bd, var(--color-accent-bd));
    color: var(--color-text-on-accent, #fff);
    text-shadow: var(--type-primary-text-shadow, none);
    box-shadow: var(--elev-control, none);
  }
  .ui-seg-btn:active {
    transform: var(--motion-press, none);
  }
  .ui-seg-btn:focus-visible {
    box-shadow: var(--p-focus-ring);
  }
  @media (prefers-reduced-motion: reduce) {
    .ui-seg-btn {
      transition: none;
    }
    .ui-seg-btn:active {
      transform: none;
    }
  }
</style>
