<!-- Spinner.svelte — 加载指示原语。 -->
<script lang="ts">
  let {
    size = 'md' as 'sm' | 'md' | 'lg',
    class: cls = '',
  }: {
    size?: 'sm' | 'md' | 'lg';
    class?: string;
  } = $props();
</script>

<span class="ui-spinner ui-spinner-{size} {cls}" role="progressbar" aria-label="loading"></span>

<style>
  .ui-spinner {
    display: inline-block;
    border: 2px solid var(--color-line, rgba(255, 255, 255, 0.15));
    border-top-color: var(--color-accent, currentColor);
    border-radius: 999px;
    animation: ui-spin 0.7s linear infinite;
    flex: none;
  }
  .ui-spinner-sm {
    width: 14px;
    height: 14px;
  }
  .ui-spinner-md {
    width: 18px;
    height: 18px;
  }
  .ui-spinner-lg {
    width: 24px;
    height: 24px;
  }
  @keyframes ui-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ui-spinner {
      animation: none;
      border-top-color: var(--color-line, rgba(255, 255, 255, 0.15));
    }
  }
</style>
