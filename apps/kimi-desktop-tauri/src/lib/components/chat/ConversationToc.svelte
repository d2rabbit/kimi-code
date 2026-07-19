<!-- ConversationToc.svelte — floating outline of user queries in the transcript.

  A vertical rail of short bars (one per user turn) anchored to the right edge
  of the message column. Hovering enlarges the rail and reveals each query's
  truncated title; clicking scrolls the corresponding user message into view
  and focuses it. Tracks the query that owns the viewport middle via an
  IntersectionObserver on the user-turn anchors.

  Mirrors kimi-web's ConversationToc.vue (pure presentational + viewport
  tracking); the item model is { id, no, title } derived from user turns.
-->
<script lang="ts">
  export interface TocItem {
    id: string;
    no: number;
    title: string;
  }

  let {
    items,
    activeId = null,
    onselect = (_id: string) => {},
  }: {
    items: TocItem[];
    activeId?: string | null;
    onselect?: (id: string) => void;
  } = $props();
</script>

{#if items.length > 1}
  <nav class="conv-toc" aria-label="对话目录">
    <div class="toc-scroll">
      {#each items as item (item.id)}
        <button
          class="toc-row"
          class:active={activeId === item.id}
          title={item.title}
          type="button"
          onclick={() => onselect(item.id)}
        >
          <span class="toc-bar"></span>
          <span class="toc-label">{item.no}. {item.title}</span>
        </button>
      {/each}
    </div>
  </nav>
{/if}

<style>
  .conv-toc {
    position: absolute;
    top: 50%;
    right: 8px;
    transform: translateY(-50%);
    z-index: var(--z-sticky, 100);
    opacity: 0.45;
    transition: opacity var(--duration-base, 160ms) var(--ease, cubic-bezier(0.16, 1, 0.3, 1));
    pointer-events: auto;
  }
  /* Invisible hover bridge so the collapsed rail is easy to open and forgiving
     to stay within (the collapsed bar is only a few px wide). */
  .conv-toc::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: -32px;
    right: -32px;
    z-index: 0;
  }
  .conv-toc:hover,
  .conv-toc:focus-within {
    opacity: 1;
  }

  .toc-scroll {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 0;
    max-height: calc(100vh - 200px);
    overflow-y: auto;
    scrollbar-width: none;
  }
  .toc-scroll::-webkit-scrollbar {
    display: none;
  }

  .toc-row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 16px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--tx3);
    font-family: var(--font-ui);
    font-size: 11px;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
  }
  .toc-row:focus-visible {
    outline: none;
    box-shadow: var(--p-focus-ring, 0 0 0 3px var(--ac-soft));
    border-radius: var(--r-sm, 6px);
  }

  .toc-bar {
    flex: none;
    width: 3px;
    height: 12px;
    border-radius: 2px;
    background: var(--bd2);
    transition: height var(--duration-base, 160ms) var(--ease, cubic-bezier(0.16, 1, 0.3, 1)),
      background var(--duration-base, 160ms) var(--ease, cubic-bezier(0.16, 1, 0.3, 1));
  }
  .toc-row:hover .toc-bar {
    height: 16px;
    background: var(--tx3);
  }
  .toc-row.active .toc-bar {
    height: 18px;
    background: var(--ac);
    box-shadow: 0 0 6px var(--ac);
  }

  .toc-label {
    opacity: 0;
    max-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: opacity var(--duration-base, 160ms) var(--ease, cubic-bezier(0.16, 1, 0.3, 1)),
      max-width var(--duration-base, 160ms) var(--ease, cubic-bezier(0.16, 1, 0.3, 1));
  }
  .conv-toc:hover .toc-label,
  .conv-toc:focus-within .toc-label {
    opacity: 1;
    max-width: 200px;
  }
  .toc-row.active .toc-label {
    color: var(--ac);
    opacity: 1;
    max-width: 200px;
    font-weight: 600;
  }

  @media (prefers-reduced-motion: reduce) {
    .conv-toc,
    .toc-bar,
    .toc-label {
      transition: none;
    }
  }
</style>
