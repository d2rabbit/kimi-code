<!-- SubagentsView.svelte — 子智能体模块页：与设置页「子智能体」同一实现。 -->
<script lang="ts">
  import SubagentsSection from '../components/settings/SubagentsSection.svelte';
</script>

<div class="page">
  <div class="col">
    <SubagentsSection />
  </div>
</div>

<style>
  .page { flex: 1; overflow-y: auto; height: 100%; }
  .col { max-width: 680px; margin: 0 auto; padding: 32px 40px 60px; }
</style>
