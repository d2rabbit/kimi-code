<!-- Textarea.svelte — 多行输入原语（主题契约驱动）。 -->
<script lang="ts">
  let {
    value = $bindable(''),
    placeholder = '',
    disabled = false,
    invalid = false,
    rows = 3,
    autofocus = false,
    class: cls = '',
    oninput,
    onkeydown,
  }: {
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    invalid?: boolean;
    rows?: number;
    autofocus?: boolean;
    class?: string;
    oninput?: (e: Event) => void;
    onkeydown?: (e: KeyboardEvent) => void;
  } = $props();
</script>

<!-- svelte-ignore a11y_autofocus -->
<textarea
  class="ui-textarea {invalid ? 'ui-textarea-invalid' : ''} {cls}"
  {placeholder}
  {disabled}
  {rows}
  {autofocus}
  bind:value
  {oninput}
  {onkeydown}
></textarea>

<style>
  .ui-textarea {
    width: 100%;
    min-height: 64px;
    resize: vertical;
    font-family: var(--font-ui, inherit);
    font-size: var(--text-base, 14px);
    line-height: var(--leading-normal, 1.5);
    padding: 8px 12px;
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
  .ui-textarea::placeholder {
    color: var(--color-text-faint, inherit);
  }
  .ui-textarea:focus-visible {
    box-shadow:
      var(--elev-input, none),
      var(--p-focus-ring);
  }
  .ui-textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .ui-textarea-invalid {
    border-color: var(--color-danger);
  }
</style>
