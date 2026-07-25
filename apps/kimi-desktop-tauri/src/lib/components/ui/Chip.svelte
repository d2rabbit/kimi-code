<!-- Chip.svelte — 徽章/药丸原语（主题契约驱动，非交互）。 -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    tone = 'neutral' as 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info',
    size = 'sm' as 'sm' | 'md',
    class: cls = '',
    children,
  }: {
    tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
    size?: 'sm' | 'md';
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<span class="ui-chip ui-chip-{tone} ui-chip-{size} {cls}">
  {@render children?.()}
</span>

<style>
  .ui-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-radius: var(--g-radius-chip, 999px);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) transparent;
    font-family: var(--font-ui, inherit);
    font-weight: 500;
    line-height: 1.4;
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
  }
  .ui-chip-sm {
    padding: 2px 8px;
    font-size: var(--text-xs, 12px);
  }
  .ui-chip-md {
    padding: 4px 10px;
    font-size: var(--text-sm, 13px);
  }

  .ui-chip-neutral {
    background: var(--mat-chip-bg, var(--color-surface-raised));
    border-color: var(--g-border-color, var(--color-line));
    color: var(--color-text-muted, inherit);
    box-shadow: var(--elev-chip, none);
  }
  .ui-chip-accent {
    background: var(--color-accent-soft);
    border-color: var(--color-accent-bd);
    color: var(--color-accent);
  }
  .ui-chip-success {
    background: var(--color-success-soft);
    border-color: var(--color-success-bd);
    color: var(--color-success);
  }
  .ui-chip-warning {
    background: var(--color-warning-soft);
    border-color: var(--color-warning-bd);
    color: var(--color-warning);
  }
  .ui-chip-danger {
    background: var(--color-danger-soft);
    border-color: var(--color-danger-bd);
    color: var(--color-danger);
  }
  .ui-chip-info {
    background: var(--color-accent-soft);
    border-color: var(--color-accent-bd);
    color: var(--color-info, var(--color-accent));
  }
</style>
