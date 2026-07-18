<!-- Skeleton.svelte — loading placeholder bars (replaces spinners for lists). -->
<script lang="ts">
  let { rows = 4, height = 28 }: { rows?: number; height?: number } = $props();
</script>

<div class="skl" aria-hidden="true">
  {#each Array(rows) as _, i (i)}
    <div class="skl-row" style="height: {height}px; opacity: {1 - i * 0.16}"></div>
  {/each}
</div>

<style>
  .skl { display: flex; flex-direction: column; gap: 6px; padding: 4px 12px; }
  .skl-row {
    border-radius: var(--r-sm);
    background: linear-gradient(90deg, var(--l2) 25%, var(--l3) 50%, var(--l2) 75%);
    background-size: 200% 100%;
    animation: skl-shimmer 1.4s linear infinite;
  }
  @keyframes skl-shimmer {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
  }
</style>
