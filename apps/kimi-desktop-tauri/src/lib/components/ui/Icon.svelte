<!-- Icon.svelte — renders an icon from the icon registry by name. -->
<script lang="ts">
  import { iconSvg, type IconName, type IconSize } from '../../lib/icons';

  let { name, size = 'md' as IconSize, class: cls = '' }: { name: IconName; size?: IconSize; class?: string } = $props();
</script>

<span class="icon-wrap {cls}">{@html iconSvg(name, size)}</span>

<style>
  .icon-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
  }
  .icon-wrap :global(svg) {
    display: block;
  }
</style>
