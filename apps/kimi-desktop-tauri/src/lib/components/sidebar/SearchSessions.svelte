<!-- SearchSessions.svelte — macOS Spotlight-style session search overlay. -->
<script lang="ts">
  import { tick } from 'svelte';
  import type { AppMessageSearchHit } from '../../api/types';
  import * as client from '../../stores/client.svelte';
  import Icon from '../ui/Icon.svelte';

  let {
    open = $bindable(false),
  }: { open?: boolean } = $props();

  let query = $state('');
  let selectedIndex = $state(0);
  let inputEl: HTMLInputElement | null = $state(null);
  let exact = $state(false);
  let messageResults = $state<AppMessageSearchHit[]>([]);
  let searchLoading = $state(false);
  let searchError = $state('');
  let searchSource = $state<'live' | 'index' | null>(null);
  let requestSequence = 0;

  type SearchResult =
    | {
        kind: 'session';
        id: string;
        title: string;
        workspaceName: string;
        modelId: string;
      }
    | {
        kind: 'message';
        hit: AppMessageSearchHit;
      };

  // Flatten all sessions with their workspace name for display.
  const sessionResults = $derived.by(() => {
    const sessions = client.sessions();
    const workspaces = client.workspaces();
    const q = query.trim().toLowerCase();

    const mapped = sessions.map((s) => {
      const ws = workspaces.find((w) => w.id === s.workspaceId || w.root === s.cwd);
      return {
        kind: 'session' as const,
        id: s.id,
        title: s.title || '新对话',
        workspaceName: ws?.name ?? '',
        modelId: s.model ?? '',
      };
    });

    if (!q) return mapped.slice(0, 12);
    return mapped
      .filter((s) => s.title.toLowerCase().includes(q) || s.workspaceName.toLowerCase().includes(q))
      .slice(0, 8);
  });

  const results = $derived<SearchResult[]>([
    ...sessionResults,
    ...messageResults.map((hit) => ({ kind: 'message' as const, hit })),
  ]);

  $effect(() => {
    const searchQuery = query.trim();
    const searchMode = exact ? 'literal' : 'terms';
    const sequence = ++requestSequence;
    searchError = '';
    searchSource = null;

    if (!open || searchQuery.length < 2) {
      messageResults = [];
      searchLoading = false;
      return;
    }

    searchLoading = true;
    const timer = setTimeout(() => {
      void client.client.searchMessages({
        query: searchQuery,
        mode: searchMode,
        agentId: 'main',
        sort: searchMode === 'literal' ? undefined : 'score',
        pageSize: 20,
      }).then((page) => {
        if (sequence !== requestSequence) return;
        messageResults = page.items;
        searchSource = page.source;
        searchLoading = false;
      }).catch((error) => {
        if (sequence !== requestSequence) return;
        messageResults = [];
        searchError = error instanceof Error ? error.message : String(error);
        searchLoading = false;
      });
    }, 220);

    return () => clearTimeout(timer);
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
      void client.client.selectSession(r.kind === 'session' ? r.id : r.hit.sessionId);
    }
    close();
  }

  function close() {
    open = false;
    query = '';
    selectedIndex = 0;
    exact = false;
    messageResults = [];
    searchError = '';
    searchSource = null;
  }

  // Reset selection when results change.
  $effect(() => {
    void results.length;
    selectedIndex = 0;
  });

  // Focus input when opened.
  $effect(() => {
    if (!open) return;
    void tick().then(() => {
      if (open) inputEl?.focus();
    });
  });
</script>

{#if open}
  <div
    class="search-overlay"
    onclick={close}
    role="presentation"
  >
    <div
      class="search-dialog"
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
          placeholder="搜索会话标题或消息内容…"
          class="search-input"
          spellcheck="false"
          autocomplete="off"
        />
        <kbd class="search-kbd">ESC</kbd>
      </div>

      <div class="search-options">
        <label class="exact-toggle">
          <input type="checkbox" bind:checked={exact} />
          <span>精确包含</span>
        </label>
        <span class="search-meta">
          {#if searchLoading}正在搜索消息…{:else if searchSource}{searchSource === 'live' ? '实时会话' : '本地索引'}{:else}输入至少 2 个字符搜索消息{/if}
        </span>
      </div>

      {#if results.length > 0}
        <div class="search-results">
          {#each results as r, i (`${r.kind}:${r.kind === 'session' ? r.id : `${r.hit.sessionId}:${r.hit.stepId ?? r.hit.turn ?? i}`}`)}
            <button
              class="search-result"
              class:selected={i === selectedIndex}
              onclick={() => { selectedIndex = i; selectResult(); }}
              onpointerenter={() => selectedIndex = i}
            >
              {#if r.kind === 'session'}
                <div class="result-info">
                  <span class="result-title">{r.title}</span>
                  {#if r.workspaceName}
                    <span class="result-ws">{r.workspaceName}</span>
                  {/if}
                </div>
                {#if r.modelId}
                  <span class="result-model">{r.modelId}</span>
                {/if}
              {:else}
                <div class="result-info message-info">
                  <span class="result-title">{r.hit.sessionTitle || '新对话'}</span>
                  <span class="result-snippet">{r.hit.snippet}</span>
                </div>
                <span class="result-role">{r.hit.role === 'user' ? '用户' : r.hit.role === 'assistant' ? '助手' : '标题'}</span>
              {/if}
            </button>
          {/each}
        </div>
      {:else}
        <div class="search-empty">
          {#if searchError}
            <p>消息搜索失败：{searchError}</p>
          {:else if query.trim()}
            <p>{searchLoading ? '正在搜索…' : '未找到匹配的会话或消息'}</p>
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

  .search-options {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 18px;
    border-bottom: 1px solid var(--bd);
    color: var(--color-text-faint, #666);
    font-size: var(--text-xs, 11px);
  }
  .exact-toggle { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  .exact-toggle input { accent-color: var(--ac); }
  .search-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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
    position: relative;
  }
  .search-result.selected {
    background: var(--ac-soft);
    color: var(--tx);
  }
  .search-result.selected::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    width: 2px;
    height: 60%;
    border-radius: 1px;
    background: var(--ac);
    transform: translateY(-50%);
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
  .message-info { gap: 4px; }
  .result-snippet {
    color: var(--color-text-muted, #999);
    font-size: var(--text-xs, 11px);
    line-height: 1.4;
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
  .result-role {
    flex-shrink: 0;
    padding: 2px 6px;
    border-radius: var(--g-radius-chip, 4px);
    background: var(--ac-soft);
    color: var(--ac);
    font-size: 10px;
  }

  .search-empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--color-text-faint, #555);
    font-size: var(--text-sm, 13px);
  }
</style>
