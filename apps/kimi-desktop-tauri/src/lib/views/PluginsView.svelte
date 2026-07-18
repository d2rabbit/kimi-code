<!-- PluginsView.svelte — 插件模块页：与设置页「插件管理」同一实现（单一事实源）。 -->
<script lang="ts">
  import PluginsSection from '../components/settings/PluginsSection.svelte';
</script>

<div class="page">
  <div class="col">
    <PluginsSection />
  </div>
</div>

<style>
  .page { flex: 1; overflow-y: auto; height: 100%; }
  .col { max-width: 680px; margin: 0 auto; padding: 32px 40px 60px; }
</style>
