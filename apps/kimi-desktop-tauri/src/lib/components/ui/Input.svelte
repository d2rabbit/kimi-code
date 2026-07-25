<!-- Input.svelte — 输入原语（主题契约驱动）。 -->
<script lang="ts">
  let {
    value = $bindable(''),
    type = 'text',
    placeholder = '',
    disabled = false,
    invalid = false,
    size = 'md' as 'sm' | 'md',
    class: cls = '',
    oninput,
    onkeydown,
  }: {
    value?: string;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
    invalid?: boolean;
    size?: 'sm' | 'md';
    class?: string;
    oninput?: (e: Event) => void;
    onkeydown?: (e: KeyboardEvent) => void;
  } = $props();
</script>

<input
  class="ui-input ui-input-{size} {invalid ? 'ui-input-invalid' : ''} {cls}"
  {type}
  {placeholder}
  {disabled}
  bind:value
  {oninput}
  {onkeydown}
/>

<style>
  .ui-input {
    width: 100%;
    font-family: var(--font-ui, inherit);
    color: var(--color-text, inherit);
    background: var(--mat-input-bg, var(--color-surface));
    border: var(--g-border-w-input, 1px) var(--g-border-style, solid)
      var(--g-border-color, var(--color-line));
    border-radius: var(--g-radius-input, 4px);
    box-shadow: var(--elev-input, none);
    outline: none;
    transition:
      border-color var(--duration-fast, 120ms) var(--ease, ease),
      box-shadow var(--duration-fast, 120ms) var(--ease, ease);
  }
  .ui-input::placeholder {
    color: var(--color-text-faint, inherit);
  }
  .ui-input:focus-visible {
    box-shadow:
      var(--elev-input, none),
      var(--p-focus-ring);
  }
  .ui-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .ui-input-invalid {
    border-color: var(--color-danger);
  }
  .ui-input-md {
    padding: 8px 12px;
    font-size: var(--text-base, 14px);
  }
  .ui-input-sm {
    padding: 5px 10px;
    font-size: var(--text-sm, 13px);
  }
</style>
