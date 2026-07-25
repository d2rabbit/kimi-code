<!-- SearchSessions.svelte — macOS Spotlight-style session search overlay. -->
<script lang="ts">
  import * as client from '../../stores/client.svelte';
  import Icon from '../ui/Icon.svelte';

  let {
    open = $bindable(false),
  }: { open?: boolean } = $props();

  let query = $state('');
  let selectedIndex = $state(0);
  let inputEl: HTMLInputElement | null = $state(null);

  // Flatten all sessions with their workspace name for display.
  const results = $derived.by(() => {
    const sessions = client.sessions();
    const workspaces = client.workspaces();
    const q = query.trim().toLowerCase();

    const mapped = sessions.map((s) => {
      const ws = workspaces.find((w) => w.id === s.workspaceId || w.root === s.cwd);
      return {
        id: s.id,
        title: s.title || '新对话',
        workspaceName: ws?.name ?? '',
        modelId: s.model ?? '',
      };
    });

    if (!q) return mapped.slice(0, 20);
    return mapped
      .filter((s) => s.title.toLowerCase().includes(q) || s.workspaceName.toLowerCase().includes(q))
      .slice(0, 20);
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectResult();
    } else if (e.key === 'Escape') {
      close();
    }
  }

  function selectResult() {
    const r = results[selectedIndex];
    if (r) {
      void client.client.selectSession(r.id);
    }
    close();
  }

  function close() {
    open = false;
    query = '';
    selectedIndex = 0;
  }

  // Reset selection when results change.
  $effect(() => {
    void results.length;
    selectedIndex = 0;
  });

  // Focus input when opened.
  $effect(() => {
    if (open && inputEl) {
      setTimeout(() => inputEl?.focus(), 50);
    }
  });
</script>

<svelte:window
  onkeydown={(e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      open = true;
    }
  }}
/>

{#if open}
  <div
    class="search-overlay"
    onclick={close}
    role="presentation"
  >
    <div
      class="search-dialog animate-spring-in"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="搜索会话"
      tabindex="-1"
    >
      <div class="search-input-row">
        <Icon name="search" size="md" />
        <input
          bind:this={inputEl}
          bind:value={query}
          onkeydown={handleKeydown}
          placeholder="搜索会话…"
          class="search-input"
          spellcheck="false"
          autocomplete="off"
        />
        <kbd class="search-kbd">ESC</kbd>
      </div>

      {#if results.length > 0}
        <div class="search-results">
          {#each results as r, i (r.id)}
            <button
              class="search-result"
              class:selected={i === selectedIndex}
              onclick={() => { selectedIndex = i; selectResult(); }}
              onmousemove={() => selectedIndex = i}
            >
              <div class="result-info">
                <span class="result-title">{r.title}</span>
                {#if r.workspaceName}
                  <span class="result-ws">{r.workspaceName}</span>
                {/if}
              </div>
              {#if r.modelId}
                <span class="result-model">{r.modelId}</span>
              {/if}
            </button>
          {/each}
        </div>
      {:else}
        <div class="search-empty">
          {#if query.trim()}
            <p>未找到匹配的会话</p>
          {:else}
            <p>开始输入以搜索会话</p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .search-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 400);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    background: var(--overlay);
    animation: fade-in 0.15s var(--ease);
  }

  .search-dialog {
    width: min(560px, 90vw);
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

  .search-input-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--bd);
    color: var(--color-text-faint, #666);
  }
  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--color-text, #ececec);
    font-size: var(--text-lg, 16px);
    font-family: inherit;
  }
  .search-input::placeholder {
    color: var(--color-text-faint, #555);
  }
  .search-kbd {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    padding: 2px 6px;
    border-radius: var(--g-radius-chip, var(--radius-xs, 4px));
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, rgba(255, 255, 255, 0.1));
    color: var(--color-text-faint, #666);
  }

  .search-results {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
  }

  .search-result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: var(--g-radius-control, var(--radius-sm, 6px));
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background var(--duration-fast, 120ms);
  }
  .search-result.selected {
    background: var(--color-selected, var(--color-hover, rgba(255, 255, 255, 0.08)));
  }
  .result-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }
  .result-title {
    font-size: var(--text-sm, 13px);
    color: var(--color-text, #ececec);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .result-ws {
    font-size: var(--text-xs, 11px);
    color: var(--color-text-faint, #555);
    font-family: var(--font-mono, monospace);
  }
  .result-model {
    font-size: var(--text-xs, 11px);
    color: var(--color-text-faint, #555);
    font-family: var(--font-mono, monospace);
    flex-shrink: 0;
  }

  .search-empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--color-text-faint, #555);
    font-size: var(--text-sm, 13px);
  }
</style>
