<!-- ListRow.svelte — 列表行原语（主题契约驱动）。
     具名插槽：leading / 默认（主内容）/ trailing。 -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    active = false,
    disabled = false,
    class: cls = '',
    onclick,
    leading,
    trailing,
    children,
  }: {
    active?: boolean;
    disabled?: boolean;
    class?: string;
    onclick?: (e: MouseEvent) => void;
    leading?: Snippet;
    trailing?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<div
  class="ui-row {active ? 'active' : ''} {disabled ? 'disabled' : ''} {cls}"
  role={onclick ? 'button' : undefined}
  tabindex={onclick ? 0 : undefined}
  {onclick}
  onkeydown={onclick
    ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.currentTarget.click();
        }
      }
    : undefined}
>
  {#if leading}
    <span class="ui-row-leading">{@render leading()}</span>
  {/if}
  <span class="ui-row-body">{@render children?.()}</span>
  {#if trailing}
    <span class="ui-row-trailing">{@render trailing()}</span>
  {/if}
</div>

<style>
  .ui-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    padding: 8px 12px;
    border-radius: var(--g-radius-control, 4px);
    color: var(--color-text, inherit);
    cursor: default;
    transition:
      background var(--duration-fast, 120ms) var(--ease, ease),
      color var(--duration-fast, 120ms) var(--ease, ease);
  }
  .ui-row[role='button'] {
    cursor: pointer;
  }
  .ui-row[role='button']:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.06));
  }
  .ui-row.active {
    background: var(--color-selected, var(--color-accent-soft));
  }
  .ui-row.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
  /* 左侧 accent 竖条（hover/active 展开） */
  .ui-row::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    width: calc(var(--g-border-w, 1px) * 2);
    height: 0;
    background: var(--color-accent, currentColor);
    border-radius: 0 2px 2px 0;
    transform: translateY(-50%);
    transition: height var(--duration-base, 160ms) var(--ease, ease);
  }
  .ui-row:hover::before {
    height: 40%;
  }
  .ui-row.active::before {
    height: 60%;
  }
  .ui-row-leading {
    display: inline-flex;
    flex: none;
    color: var(--color-text-muted, inherit);
  }
  .ui-row-body {
    flex: 1;
    min-width: 0;
  }
  .ui-row-trailing {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2, 8px);
    flex: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .ui-row,
    .ui-row::before {
      transition: none;
    }
  }
</style>
