<!-- Select.svelte — 原生 select 包装（主题契约驱动，右侧 chevron）。 -->
<script lang="ts">
  import Icon from './Icon.svelte';

  let {
    value = $bindable(''),
    options = [] as Array<{ value: string; label: string }>,
    disabled = false,
    class: cls = '',
    onchange,
  }: {
    value?: string;
    options?: Array<{ value: string; label: string }>;
    disabled?: boolean;
    class?: string;
    onchange?: (e: Event) => void;
  } = $props();
</script>

<div class="ui-select {cls}">
  <select bind:value {disabled} {onchange}>
    {#each options as opt (opt.value)}
      <option value={opt.value}>{opt.label}</option>
    {/each}
  </select>
  <span class="ui-select-caret"><Icon name="chevron-down" size="sm" /></span>
</div>

<style>
  .ui-select {
    position: relative;
    display: inline-flex;
    width: 100%;
  }
  .ui-select select {
    width: 100%;
    appearance: none;
    -webkit-appearance: none;
    font-family: var(--font-ui, inherit);
    font-size: var(--text-base, 14px);
    color: var(--color-text, inherit);
    background: var(--mat-input-bg, var(--color-surface));
    border: var(--g-border-w-input, 1px) var(--g-border-style, solid)
      var(--g-border-color, var(--color-line));
    border-radius: var(--g-radius-input, 4px);
    box-shadow: var(--elev-input, none);
    padding: 8px 32px 8px 12px;
    outline: none;
    cursor: pointer;
    transition:
      border-color var(--duration-fast, 120ms) var(--ease, ease),
      box-shadow var(--duration-fast, 120ms) var(--ease, ease);
  }
  .ui-select select:focus-visible {
    box-shadow:
      var(--elev-input, none),
      var(--p-focus-ring);
  }
  .ui-select select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .ui-select-caret {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: var(--color-text-muted, inherit);
    display: inline-flex;
  }
</style>
