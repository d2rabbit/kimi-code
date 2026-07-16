<!-- CommandPalette.svelte — ⌘K global command palette overlay. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../../lib/icon-types';
  import * as client from '../../stores/client.svelte';

  let {
    open = $bindable(false),
    onnavigate = () => {},
  }: {
    open?: boolean;
    onnavigate?: () => void;
  } = $props();

  let query = $state('');
  let selectedIndex = $state(0);
  let inputEl: HTMLInputElement | $state(null) = null;

  type CommandCategory = 'action' | 'session';
  interface CommandItem {
    id: string;
    title: string;
    category: CommandCategory;
    icon: IconName;
    shortcut?: string;
    action: () => void;
    keywords?: string;
  }

  // Build command list reactively
  const commands = $derived<CommandItem[]>([
    { id: 'new', title: '新建对话', category: 'action', icon: 'chat-new', shortcut: '⌘N', action: () => client.client.clearActiveSession() },
    { id: 'search', title: '搜索会话', category: 'action', icon: 'search', keywords: 'sessions find', action: () => {} },
    { id: 'settings', title: '设置', category: 'action', icon: 'settings', action: () => onnavigate() },
    { id: 'fork', title: 'Fork 当前会话', category: 'action', icon: 'git-branch', action: () => client.client.forkSession() },
    { id: 'compact', title: '压缩对话', category: 'action', icon: 'contract', action: () => client.client.compact() },
    ...client.sessions().slice(0, 20).map((s) => ({
      id: `session-${s.id}`,
      title: s.title || '新对话',
      category: 'session' as CommandCategory,
      icon: 'message' as IconName,
      keywords: s.lastPrompt,
      action: () => client.client.selectSession(s.id),
    })),
  ]);

  const filtered = $derived(
    query.trim() === ''
      ? commands
      : commands.filter((c) =>
          c.title.toLowerCase().includes(query.toLowerCase()) ||
          (c.keywords ?? '').toLowerCase().includes(query.toLowerCase())
        )
  );

  $effect(() => {
    void filtered.length;
    selectedIndex = 0;
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(filtered.length - 1, selectedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(0, selectedIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[selectedIndex];
      if (cmd) {
        cmd.action();
        open = false;
        query = '';
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      open = false;
      query = '';
    }
  }

  // Reset on open
  $effect(() => {
    if (open) {
      query = '';
      selectedIndex = 0;
      // Focus input after DOM update
      requestAnimationFrame(() => inputEl?.focus());
    }
  });
</script>

<svelte:window
  onkeydown={(e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      open = !open;
    }
  }}
/>

{#if open}
  <div
    class="palette-backdrop"
    onclick={() => { open = false; query = ''; }}
  >
    <div class="palette-modal glass-panel animate-spring-in" onclick={(e) => e.stopPropagation()} role="dialog">
      <!-- Search input -->
      <div class="palette-search">
        <Icon name="search" size="md" />
        <input
          bind:this={inputEl}
          bind:value={query}
          onkeydown={handleKeydown}
          placeholder="搜索操作或会话…"
          spellcheck="false"
          autocomplete="off"
        />
        <kbd class="kbd-esc">ESC</kbd>
      </div>

      <!-- Results -->
      <div class="palette-results">
        {#each filtered as cmd, i (cmd.id)}
          <button
            class="result-item"
            class:selected={i === selectedIndex}
            onclick={() => { cmd.action(); open = false; query = ''; }}
            onpointerenter={() => (selectedIndex = i)}
            type="button"
          >
            <span class="result-icon"><Icon name={cmd.icon} size="sm" /></span>
            <span class="result-title">{cmd.title}</span>
            {#if cmd.shortcut}
              <kbd class="kbd-shortcut">{cmd.shortcut}</kbd>
            {/if}
            {#if cmd.category === 'session'}
              <span class="result-tag">会话</span>
            {/if}
          </button>
        {:else}
          <div class="palette-empty">
            <p>未找到匹配项</p>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .palette-backdrop {
    position: fixed;
    inset: 0;
    z-index: 400;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .palette-modal {
    width: 560px;
    max-width: 90vw;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .palette-search {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--glass-divider, rgba(255, 255, 255, 0.06));
    color: var(--color-text-faint);
  }
  .palette-search input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--color-text, rgba(255, 255, 255, 0.92));
    font-size: 15px;
    outline: none;
  }
  .palette-search input::placeholder {
    color: var(--color-text-faint, rgba(235, 235, 245, 0.3));
  }

  .kbd-esc, .kbd-shortcut {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--color-hover, rgba(255, 255, 255, 0.06));
    color: var(--color-text-faint);
    font-family: var(--font-mono, monospace);
    white-space: nowrap;
  }

  .palette-results {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    border-radius: var(--radius-md, 8px);
    background: transparent;
    color: var(--color-text-muted, rgba(235, 235, 245, 0.6));
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: background 80ms;
    position: relative;
  }
  .result-item.selected {
    background: var(--color-selected, rgba(255, 255, 255, 0.1));
    color: var(--color-text, rgba(255, 255, 255, 0.92));
  }
  .result-item.selected::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 60%;
    background: var(--color-accent, #0a84ff);
    border-radius: 1px;
  }
  .result-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-faint);
    flex-shrink: 0;
  }
  .result-item.selected .result-icon {
    color: var(--color-accent, #0a84ff);
  }
  .result-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .result-tag {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-full, 999px);
    background: var(--color-accent-soft, rgba(10, 132, 255, 0.16));
    color: var(--color-accent, #0a84ff);
  }

  .palette-empty {
    text-align: center;
    padding: 40px;
    color: var(--color-text-faint);
    font-size: 13px;
  }
</style>
