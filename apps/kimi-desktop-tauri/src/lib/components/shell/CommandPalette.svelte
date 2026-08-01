<!-- CommandPalette.svelte — Cmd/Ctrl+K global command palette overlay. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import Chip from '../ui/Chip.svelte';
  import type { IconName } from '../../lib/icon-types';
  import * as client from '../../stores/client.svelte';
  import { shortcut } from '../../lib/desktopFlag';

  let {
    open = $bindable(false),
    onnavigate = () => {},
    onsearch = () => {},
  }: {
    open?: boolean;
    onnavigate?: () => void;
    onsearch?: () => void;
  } = $props();

  let query = $state('');
  let selectedIndex = $state(0);
  let inputEl: HTMLInputElement | null = $state(null);

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
    // 会话操作
    { id: 'new', title: '新建对话', category: 'action', icon: 'chat-new', shortcut: shortcut('N'), action: () => client.client.clearActiveSession() },
    { id: 'search', title: '搜索会话', category: 'action', icon: 'search', keywords: 'sessions find', action: () => onsearch() },
    { id: 'fork', title: 'Fork 当前会话', category: 'action', icon: 'git-branch', action: () => client.client.forkSession() },
    { id: 'compact', title: '压缩对话', category: 'action', icon: 'contract', keywords: 'compress', action: () => client.client.compact() },
    { id: 'undo', title: '撤销上一轮', category: 'action', icon: 'arrow-left', keywords: 'rollback revert', action: () => client.client.undo() },
    // 配置
    { id: 'settings', title: '设置', category: 'action', icon: 'settings', action: () => onnavigate() },
    { id: 'theme-dark', title: '深色主题', category: 'action', icon: 'star', keywords: 'theme dark', action: () => client.client.setColorScheme('dark') },
    { id: 'theme-light', title: '浅色主题', category: 'action', icon: 'star-outline', keywords: 'theme light', action: () => client.client.setColorScheme('light') },
    { id: 'theme-clay', title: '粘土主题', category: 'action', icon: 'globe', keywords: 'theme clay', action: () => client.client.setColorScheme('clay') },
    { id: 'theme-neon', title: '霓光主题', category: 'action', icon: 'tool', keywords: 'theme neon', action: () => client.client.setColorScheme('neon') },
    { id: 'theme-glass', title: '玻璃主题', category: 'action', icon: 'sparkles', keywords: 'theme glass', action: () => client.client.setColorScheme('glass') },
    { id: 'theme-aqua', title: '水凝主题', category: 'action', icon: 'image', keywords: 'theme aqua', action: () => client.client.setColorScheme('aqua') },
    // 模式切换
    { id: 'mode-plan', title: '切换计划模式', category: 'action', icon: 'list', keywords: 'plan mode', action: () => client.client.togglePlanMode() },
    { id: 'mode-swarm', title: '切换 Swarm 模式', category: 'action', icon: 'bolt', keywords: 'swarm mode', action: () => client.client.toggleSwarmMode() },
    { id: 'mode-goal', title: '切换 Goal 模式', category: 'action', icon: 'target', keywords: 'goal mode', action: () => client.client.toggleGoalMode() },
    // 权限
    { id: 'perm-manual', title: '权限：手动', category: 'action', icon: 'sliders', keywords: 'permission manual', action: () => client.client.setPermission('manual') },
    { id: 'perm-auto', title: '权限：自动', category: 'action', icon: 'sliders', keywords: 'permission auto', action: () => client.client.setPermission('auto') },
    { id: 'perm-yolo', title: '权限：YOLO', category: 'action', icon: 'sliders', keywords: 'permission yolo', action: () => client.client.setPermission('yolo') },
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
    onkeydown={(e) => { if (e.key === 'Escape') { open = false; query = ''; } }}
    role="button"
    tabindex="-1"
  >
    <div class="palette-modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1" aria-modal="true">
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
              <Chip tone="accent" size="sm">会话</Chip>
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
    background: var(--overlay);
  }

  .palette-modal {
    width: 560px;
    max-width: 90vw;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--mat-surface-3, var(--l3));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd2));
    border-radius: var(--g-radius-overlay, var(--r-xl));
    box-shadow: var(--elev-overlay, var(--sh-lg));
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
    border: 1px solid var(--bd2);
    background: transparent;
    color: var(--tx3);
    font-family: var(--font-mono);
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
    height: 36px;
    padding: 0 12px;
    border: none;
    border-radius: var(--g-radius-control, var(--r-md));
    background: transparent;
    color: var(--tx2);
    font-size: 12.5px;
    cursor: pointer;
    text-align: left;
    position: relative;
  }
  .result-item.selected {
    background: var(--ac-soft);
    color: var(--tx);
  }
  .result-item.selected::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 60%;
    background: var(--ac);
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
    color: var(--ac);
  }
  .result-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .palette-empty {
    text-align: center;
    padding: 40px;
    color: var(--color-text-faint);
    font-size: 13px;
  }
</style>
