<!-- HooksView.svelte — Hooks 模块页：与设置页「Hooks」同一实现（单一事实源）。 -->
<script lang="ts">
  import HooksSection from '../components/settings/HooksSection.svelte';
</script>

<div class="page">
  <div class="col">
    <HooksSection />
  </div>
</div>

<style>
  .page { flex: 1; overflow-y: auto; height: 100%; }
  .col { max-width: 680px; margin: 0 auto; padding: 32px 40px 60px; }
</style>
