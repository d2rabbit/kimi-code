<!-- RightPanel.svelte — collapsible right tool panel with tab container. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import FilePreview from '../chat/FilePreview.svelte';
  import * as client from '../../stores/client.svelte';
  import type { IconName } from '../../lib/icon-types';

  type Tab = 'git' | 'tasks' | 'files' | 'thinking';

  let activeTab = $state<Tab>('files');
  let collapsed = $state(false);

  function toggle() {
    collapsed = !collapsed;
  }

  const tabs: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'git', label: 'Git', icon: 'git-pull-request' },
    { id: 'tasks', label: '任务', icon: 'check-list' },
    { id: 'files', label: '文件', icon: 'file-text' },
    { id: 'thinking', label: '思考', icon: 'sparkles' },
  ];
</script>

{#if !collapsed}
  <aside class="right-panel">
    <div class="panel-tabs">
      {#each tabs as tab (tab.id)}
        <button
          class="tab-btn"
          class:active={activeTab === tab.id}
          onclick={() => (activeTab = tab.id)}
          type="button"
        >
          <Icon name={tab.icon} size="sm" />
          <span>{tab.label}</span>
        </button>
      {/each}
      <button class="collapse-btn" onclick={toggle} aria-label="折叠右栏" type="button">
        <Icon name="panel-collapse" size="sm" />
      </button>
    </div>
    <div class="panel-content">
      {#if activeTab === 'files' && client.previewOpen()}
        <FilePreview />
      {:else if activeTab === 'files'}
        <div class="placeholder">
          <p>暂无预览文件</p>
        </div>
      {:else}
        <div class="placeholder">
          <p>{tabs.find((t) => t.id === activeTab)?.label}面板</p>
          <p class="hint">即将推出</p>
        </div>
      {/if}
    </div>
  </aside>
{:else}
  <button class="expand-tab" onclick={toggle} aria-label="展开右栏" type="button">
    <Icon name="panel-expand" size="sm" />
  </button>
{/if}

<style>
  .right-panel {
    flex: none;
    width: 320px;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: rgba(20, 20, 22, 0.6);
    backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.6));
    -webkit-backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.6));
    border-left: 1px solid var(--glass-divider, rgba(255, 255, 255, 0.06));
  }
  :global(html[data-color-scheme="light"]) .right-panel {
    background: rgba(248, 248, 250, 0.7);
    border-left-color: rgba(0, 0, 0, 0.04);
  }
  .panel-tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 8px 8px 0;
    flex: none;
  }
  .tab-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--color-text-muted, rgba(235, 235, 245, 0.6));
    font-size: 12px;
    cursor: pointer;
    transition: background 120ms, color 120ms;
  }
  .tab-btn:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.06));
  }
  .tab-btn.active {
    background: var(--color-selected, rgba(255, 255, 255, 0.1));
    color: var(--color-text, rgba(255, 255, 255, 0.92));
  }
  .collapse-btn {
    margin-left: auto;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--color-text-faint, rgba(235, 235, 245, 0.3));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 120ms, color 120ms;
  }
  .collapse-btn:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.06));
    color: var(--color-text-muted, rgba(235, 235, 245, 0.6));
  }
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }
  .placeholder {
    text-align: center;
    padding: 40px 20px;
    color: var(--color-text-faint, rgba(235, 235, 245, 0.3));
    font-size: 13px;
  }
  .placeholder .hint {
    font-size: 12px;
    margin-top: 4px;
    opacity: 0.7;
  }
  .expand-tab {
    flex: none;
    width: 28px;
    height: 100%;
    border: none;
    border-left: 1px solid var(--color-line, rgba(84, 84, 88, 0.65));
    background: var(--color-surface-sunken, rgba(20, 20, 22, 0.6));
    color: var(--color-text-faint, rgba(235, 235, 245, 0.3));
    cursor: pointer;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12px;
    transition: color 120ms;
  }
  .expand-tab:hover {
    color: var(--color-text-muted, rgba(235, 235, 245, 0.6));
  }
</style>
