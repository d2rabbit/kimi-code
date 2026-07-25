<!-- Divider.svelte — 分割线原语。 -->
<script lang="ts">
  let {
    vertical = false,
    class: cls = '',
  }: {
    vertical?: boolean;
    class?: string;
  } = $props();
</script>

<div class="ui-divider {vertical ? 'ui-divider-v' : ''} {cls}" role="separator"></div>

<style>
  .ui-divider {
    height: var(--g-border-w, 1px);
    background: var(--color-line, rgba(255, 255, 255, 0.1));
    margin: var(--space-2, 8px) 0;
    flex: none;
  }
  .ui-divider-v {
    width: var(--g-border-w, 1px);
    height: auto;
    align-self: stretch;
    margin: 0 var(--space-2, 8px);
  }
</style>
