<!-- Menu.svelte — 下拉菜单容器（主题契约驱动）。 -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    class: cls = '',
    children,
  }: {
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<div class="ui-menu {cls}" role="menu">
  {@render children?.()}
</div>

<style>
  .ui-menu {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 4px;
    min-width: 160px;
    background: var(--mat-surface-3, var(--color-surface-raised));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border: var(--g-border-w, 1px) var(--g-border-style, solid)
      var(--g-border-color, var(--color-line));
    border-radius: var(--g-radius-overlay, 6px);
    box-shadow: var(--elev-overlay, var(--shadow-xl, none));
    animation: menu-in 0.16s var(--motion-ease-enter, var(--ease-out, ease));
  }
  .ui-menu::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--mat-sheen, none);
    pointer-events: none;
  }
  @keyframes menu-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ui-menu {
      animation: none;
    }
  }
</style>
