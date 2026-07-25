<!-- Switch.svelte — 开关原语（主题契约驱动）。 -->
<script lang="ts">
  let {
    checked = $bindable(false),
    disabled = false,
    label = '',
    class: cls = '',
    onchange,
  }: {
    checked?: boolean;
    disabled?: boolean;
    label?: string;
    class?: string;
    onchange?: (checked: boolean) => void;
  } = $props();

  function toggle() {
    if (disabled) return;
    checked = !checked;
    onchange?.(checked);
  }
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label || 'toggle'}
  class="ui-switch {checked ? 'on' : ''} {cls}"
  {disabled}
  onclick={toggle}
>
  <span class="ui-switch-thumb"></span>
</button>

<style>
  .ui-switch {
    position: relative;
    width: 36px;
    height: 20px;
    flex: none;
    border-radius: 999px;
    border: var(--g-border-w-input, 1px) var(--g-border-style, solid)
      var(--g-border-color, var(--color-line));
    background: var(--mat-input-bg, var(--color-surface));
    box-shadow: var(--elev-input, none);
    cursor: pointer;
    transition:
      background var(--duration-fast, 120ms) var(--ease, ease),
      border-color var(--duration-fast, 120ms) var(--ease, ease);
    padding: 0;
  }
  .ui-switch-thumb {
    position: absolute;
    top: 50%;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: var(--color-text-muted, #888);
    transform: translateY(-50%);
    transition:
      left var(--duration-fast, 120ms) var(--ease, ease),
      background var(--duration-fast, 120ms) var(--ease, ease);
  }
  .ui-switch.on {
    background: var(--mat-primary-bg, var(--color-accent));
    border-color: var(--mat-primary-bd, var(--color-accent-bd));
  }
  .ui-switch.on .ui-switch-thumb {
    left: 18px;
    background: var(--color-text-on-accent, #fff);
  }
  .ui-switch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .ui-switch:focus-visible {
    box-shadow:
      var(--elev-input, none),
      var(--p-focus-ring);
  }
  @media (prefers-reduced-motion: reduce) {
    .ui-switch,
    .ui-switch-thumb {
      transition: none;
    }
  }
</style>
