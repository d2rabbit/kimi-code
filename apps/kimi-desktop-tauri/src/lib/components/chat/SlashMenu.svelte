<!-- SlashMenu.svelte — slash command menu overlay.
     Shows filtered builtin commands + skills. Keyboard navigable. -->
<script lang="ts">
  import { SLASH_COMMANDS } from '../../lib/slashCommands';
  import type { AppSkill } from '../../api/types';

  let {
    query,
    skills = [] as AppSkill[],
    activeIndex = 0,
    onselect,
  }: {
    query: string;
    skills?: AppSkill[];
    activeIndex?: number;
    onselect: (cmd: string) => void;
  } = $props();

  type MenuItem = { name: string; desc: string; isSkill: boolean; acceptsInput: boolean };

  // Build the full command list: builtin commands + skills.
  const allItems = $derived.by(() => {
    const builtin: MenuItem[] = SLASH_COMMANDS.map((c) => ({
      name: `/${c.name}`,
      desc: c.desc,
      isSkill: false,
      acceptsInput: c.acceptsInput ?? false,
    }));
    const skillItems: MenuItem[] = skills
      .filter((s) => !builtin.some((b) => b.name === `/${s.name}`))
      .map((s) => ({
        name: `/${s.name}`,
        desc: s.description,
        isSkill: true,
        acceptsInput: true,
      }));
    return [...builtin, ...skillItems];
  });

  // Filter by query (without leading /).
  const filtered = $derived.by(() => {
    const q = query.toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q),
    );
  });

  function handleClick(item: MenuItem) {
    onselect(item.name);
  }
</script>

{#if filtered.length > 0}
  <div class="slash-menu" role="listbox">
    {#each filtered as item, i (item.name)}
      <button
        class="slash-item"
        class:active={i === activeIndex}
        role="option"
        aria-selected={i === activeIndex}
        onmousedown={() => handleClick(item)}
      >
        <span class="slash-name">{item.name}</span>
        <span class="slash-desc">{item.desc}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .slash-menu {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    right: 0;
    max-height: 240px;
    overflow-y: auto;
    background: var(--color-surface, rgba(28,28,30,0.72));
    border: 1px solid var(--color-line, rgba(84,84,88,0.65));
    border-radius: var(--radius-md, 8px);
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.3));
    z-index: var(--z-dropdown, 200);
  }

  .slash-item {
    display: grid;
    grid-template-columns: minmax(90px, 32%) minmax(0, 1fr);
    gap: 8px;
    width: 100%;
    padding: 7px 12px;
    border: none;
    background: transparent;
    color: var(--color-text, rgba(255,255,255,0.92));
    font-size: var(--text-sm, 13px);
    cursor: pointer;
    text-align: left;
    transition: background var(--duration-fast, 120ms);
  }
  .slash-item:hover {
    background: var(--color-hover, rgba(255,255,255,0.04));
  }
  .slash-item.active {
    background: var(--color-accent-soft, rgba(124,140,255,0.1));
  }

  .slash-name {
    color: var(--color-accent, #2dd4bf);
    font-weight: var(--weight-medium, 500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .slash-desc {
    color: var(--color-text-muted, rgba(235,235,245,0.6));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
