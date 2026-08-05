<!-- SlashMenu.svelte — slash command menu with categorized sections.
     Shows commands / skills / files / plugins. Keyboard navigable. -->
<script lang="ts">
  import { t } from 'svelte-i18n';
  import { SLASH_COMMANDS } from '../../lib/slashCommands';
  import type { AppSkill } from '../../api/types';
  import type { IconName } from '../../lib/icon-types';
  import Icon from '../ui/Icon.svelte';

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

  type MenuItem = {
    name: string;
    desc: string;
    category: 'command' | 'skill' | 'file' | 'plugin';
    icon: IconName;
    acceptsInput: boolean;
  };

  // Build the full categorized command list.
  const allItems = $derived.by(() => {
    const commands: MenuItem[] = SLASH_COMMANDS.map((c) => ({
      name: `/${c.name}`,
      desc: c.desc,
      category: 'command' as const,
      icon: c.name === 'new' || c.name === 'clear' ? 'chat-new' : c.name === 'model' ? 'sparkles' : c.name === 'login' ? 'log-in' : c.name === 'compact' ? 'contract' : c.name === 'fork' ? 'git-branch' : 'bolt',
      acceptsInput: c.acceptsInput ?? false,
    }));
    const skillItems: MenuItem[] = skills
      .filter((s) => !commands.some((b) => b.name === `/${s.name}`))
      .map((s) => ({
        name: `/${s.name}`,
        desc: s.description,
        category: 'skill' as const,
        icon: 'bolt',
        acceptsInput: true,
      }));
    return [...commands, ...skillItems];
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

  // Group filtered items by category for display
  const grouped = $derived.by(() => {
    const groups: { label: string; icon: IconName; items: MenuItem[] }[] = [];
    const cats: Record<string, { label: string; icon: IconName }> = {
      command: { label: '命令', icon: 'settings' },
      skill: { label: '技能', icon: 'bolt' },
      file: { label: '文件', icon: 'file-text' },
      plugin: { label: '插件', icon: 'plugin' },
    };
    for (const [cat, meta] of Object.entries(cats)) {
      const items = filtered.filter((f) => f.category === cat);
      if (items.length > 0) groups.push({ ...meta, items });
    }
    return groups;
  });

  // Flatten for active index tracking
  const flatFiltered = $derived(grouped.flatMap((g) => g.items));

  function handleClick(item: MenuItem) {
    onselect(item.name);
  }
</script>

{#if flatFiltered.length > 0}
  <div class="slash-menu" role="listbox">
    {#each grouped as group (group.label)}
      <div class="slash-group-header">
        <Icon name={group.icon} size="sm" />
        <span>{group.label}</span>
        <span class="slash-group-count">{group.items.length}</span>
      </div>
      {#each group.items as item (item.name)}
        {@const flatIdx = flatFiltered.indexOf(item)}
        <button
          class="slash-item"
          class:active={flatIdx === activeIndex}
          role="option"
          aria-selected={flatIdx === activeIndex}
          onmousedown={() => handleClick(item)}
        >
          <span class="slash-item-icon"><Icon name={item.icon} size="sm" /></span>
          <span class="slash-name">{item.name}</span>
          <span class="slash-desc">{item.category === 'command' ? $t(item.desc) : item.desc}</span>
        </button>
      {/each}
    {/each}
  </div>
{:else if query}
  <div class="slash-menu" role="listbox">
    <div class="slash-empty">无匹配结果</div>
  </div>
{/if}

<style>
  .slash-menu {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    right: 0;
    max-height: 320px;
    overflow-y: auto;
    background: var(--mat-surface-3, var(--l3));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, rgba(84, 84, 88, 0.65));
    border-radius: var(--g-radius-overlay, 12px);
    box-shadow: var(--elev-overlay, 0 12px 40px rgba(0, 0, 0, 0.4));
    z-index: 200;
    padding: 4px;
  }

  .slash-group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-faint, rgba(235, 235, 245, 0.3));
  }
  .slash-group-header :global(svg) {
    color: var(--color-text-faint, rgba(235, 235, 245, 0.3));
  }
  .slash-group-count {
    margin-left: auto;
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    color: var(--color-text-faint, rgba(235, 235, 245, 0.2));
  }

  .slash-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: var(--g-radius-control, 8px);
    background: transparent;
    color: var(--color-text, rgba(255, 255, 255, 0.92));
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: background 120ms;
  }
  .slash-item:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.04));
  }
  .slash-item.active {
    background: var(--color-accent-soft, rgba(45, 212, 191, 0.1));
  }

  .slash-item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--g-radius-control, 8px);
    background: var(--color-hover, rgba(255, 255, 255, 0.04));
    color: var(--color-text-muted, rgba(235, 235, 245, 0.6));
    flex-shrink: 0;
  }
  .slash-item.active .slash-item-icon {
    background: var(--color-accent-soft, rgba(45, 212, 191, 0.12));
    color: var(--color-accent, #2dd4bf);
  }

  .slash-name {
    color: var(--color-accent, #2dd4bf);
    font-weight: 500;
    white-space: nowrap;
    min-width: 80px;
  }
  .slash-desc {
    color: var(--color-text-muted, rgba(235, 235, 245, 0.6));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .slash-empty {
    padding: 16px;
    text-align: center;
    color: var(--color-text-faint, rgba(235, 235, 245, 0.3));
    font-size: 13px;
  }
</style>
