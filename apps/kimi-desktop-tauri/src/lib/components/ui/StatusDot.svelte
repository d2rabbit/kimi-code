<!-- StatusDot.svelte — colored status indicator dot. -->
<script lang="ts">
  let {
    status = 'ok' as 'ok' | 'running' | 'error',
    size = 'sm' as 'sm' | 'md',
  }: {
    status?: 'ok' | 'running' | 'error';
    size?: 'sm' | 'md';
  } = $props();
</script>

<span
  class="status-dot status-{status}"
  class:sm={size === 'sm'}
  class:md={size === 'md'}
  role="img"
  aria-label={status}
></span>

<style>
  .status-dot {
    display: inline-block;
    border-radius: 50%;
    flex: none;
  }
  .sm { width: 7px; height: 7px; }
  .md { width: 10px; height: 10px; }

  .status-ok {
    background: var(--color-success, #30d158);
  }
  .status-running {
    background: var(--color-accent, #2dd4bf);
    animation: pulse 1.2s ease-in-out infinite;
  }
  .status-error {
    background: var(--color-danger, #ff453a);
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  @media (prefers-reduced-motion: reduce) {
    .status-running { animation: none; }
  }
</style>
