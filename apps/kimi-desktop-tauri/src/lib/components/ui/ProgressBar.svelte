<!-- ProgressBar.svelte — 进度条原语（主题契约驱动）。 -->
<script lang="ts">
  let {
    value = 0,
    class: cls = '',
  }: {
    value?: number;
    class?: string;
  } = $props();

  const clamped = $derived(Math.min(100, Math.max(0, value)));
</script>

<div
  class="ui-progress {cls}"
  role="progressbar"
  aria-valuenow={clamped}
  aria-valuemin={0}
  aria-valuemax={100}
>
  <div class="ui-progress-fill" style:width="{clamped}%"></div>
</div>

<style>
  .ui-progress {
    height: 8px;
    border-radius: var(--g-radius-chip, 999px);
    background: var(--mat-input-bg, var(--color-surface));
    border: var(--g-border-w-input, 1px) var(--g-border-style, solid)
      var(--g-border-color, var(--color-line));
    box-shadow: var(--elev-input, none);
    overflow: hidden;
  }
  .ui-progress-fill {
    height: 100%;
    background: var(--mat-primary-bg, var(--color-accent));
    transition: width var(--duration-slow, 260ms) var(--ease, ease);
  }
  @media (prefers-reduced-motion: reduce) {
    .ui-progress-fill {
      transition: none;
    }
  }
</style>
