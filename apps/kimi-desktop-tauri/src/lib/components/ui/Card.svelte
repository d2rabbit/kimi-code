<!-- Card.svelte — 表面原语。材质差异全部来自主题契约 token；
     ::before = sheen 槽（玻璃/凝胶高光），::after = texture 槽（条纹等），
     主题用 none 关闭不需要的槽。 -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant = 'raised' as 'raised' | 'sunken' | 'interactive',
    padding = 'md' as 'none' | 'sm' | 'md' | 'lg',
    class: cls = '',
    children,
  }: {
    variant?: 'raised' | 'sunken' | 'interactive';
    padding?: 'none' | 'sm' | 'md' | 'lg';
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<div class="card card-{variant} card-pad-{padding} {cls}">
  {@render children?.()}
</div>

<style>
  .card {
    position: relative;
    border-radius: var(--g-radius-card, 4px);
    border: var(--g-border-w, 1px) var(--g-border-style, solid)
      var(--g-border-color, var(--color-line, rgba(255, 255, 255, 0.1)));
    box-shadow: var(--elev-card, var(--shadow-md, none));
    overflow: hidden;
  }
  .card::before,
  .card::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
  }
  .card::before {
    background: var(--mat-sheen, none);
  }
  .card::after {
    background: var(--mat-texture, none);
  }

  .card-raised {
    background: var(--mat-surface-2, var(--color-surface-raised));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
  }
  .card-sunken {
    background: var(--mat-surface-1, var(--color-surface));
    box-shadow: var(--elev-input, none);
  }

  .card-interactive {
    background: var(--mat-surface-2, var(--color-surface-raised));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    cursor: pointer;
    transition:
      transform var(--duration-base, 160ms) var(--ease-out, ease),
      box-shadow var(--duration-base, 160ms) var(--ease-out, ease),
      border-color var(--duration-fast, 120ms) var(--ease, ease);
  }
  @media (hover: hover) and (pointer: fine) {
    .card-interactive:hover {
      transform: var(--motion-hover-lift-card, none);
      box-shadow: var(--elev-card-hover, var(--elev-card, none));
      border-color: var(--color-line-strong, var(--g-border-color, transparent));
    }
  }
  .card-interactive:active {
    transform: var(--motion-press, none);
    box-shadow: var(--motion-press-shadow, var(--elev-card, none));
  }

  .card-pad-none {
    padding: 0;
  }
  .card-pad-sm {
    padding: var(--space-2, 8px) var(--space-3, 12px);
  }
  .card-pad-md {
    padding: var(--space-4, 16px);
  }
  .card-pad-lg {
    padding: var(--space-5, 20px) var(--space-6, 24px);
  }

  @media (prefers-reduced-motion: reduce) {
    .card-interactive {
      transition: none;
    }
    .card-interactive:hover,
    .card-interactive:active {
      transform: none;
    }
  }
</style>
