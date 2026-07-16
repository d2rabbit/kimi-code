<!-- RightPanel.svelte — collapsible right tool panel with tab container.
     Git / Tasks / Files / Thinking tabs. Falls back to mock data when no session. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import FilePreview from '../chat/FilePreview.svelte';
  import * as client from '../../stores/client.svelte';
  import type { IconName } from '../../lib/icon-types';

  type Tab = 'git' | 'tasks' | 'files' | 'thinking';

  let activeTab = $state<Tab>('tasks');
  let collapsed = $state(false);

  function toggle() { collapsed = !collapsed; }

  // Use real tasks from the store when available, fall back to mock for visual preview
  const realTasks = $derived(client.tasks());
  const hasActiveSession = $derived(!!client.activeSessionId());

  const tabs: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'git', label: 'Git', icon: 'git-pull-request' },
    { id: 'tasks', label: '任务', icon: 'check-list' },
    { id: 'files', label: '文件', icon: 'file-text' },
    { id: 'thinking', label: '思考', icon: 'sparkles' },
  ];

  // Mock data for visual preview
  const gitChanges = [
    { path: 'src/components/chat/Composer.svelte', status: 'M' as const, add: 210, del: 29 },
    { path: 'src/lib/views/SettingsView.svelte', status: 'M' as const, add: 259, del: 10 },
    { path: 'src/lib/styles/global.css', status: 'M' as const, add: 446, del: 62 },
    { path: 'src/lib/components/ui/Icon.svelte', status: 'M' as const, add: 60, del: 12 },
    { path: 'src/lib/components/shell/TitleBar.svelte', status: 'A' as const, add: 95, del: 0 },
    { path: 'src/lib/components/shell/RightPanel.svelte', status: 'A' as const, add: 130, del: 0 },
    { path: 'src/lib/components/shell/Resizer.svelte', status: 'A' as const, add: 45, del: 0 },
    { path: 'src/lib/components/shell/CommandPalette.svelte', status: 'A' as const, add: 180, del: 0 },
    { path: 'src/lib/lib/icons.ts', status: 'D' as const, add: 0, del: 197 },
  ];
  const totalAdd = gitChanges.reduce((s, f) => s + f.add, 0);
  const totalDel = gitChanges.reduce((s, f) => s + f.del, 0);

  const taskItems = [
    { title: 'macOS 玻璃细节打磨', done: true },
    { title: 'Design Token 系统', done: true },
    { title: 'lucide-svelte 图标迁移', done: true },
    { title: '三栏布局壳', done: true },
    { title: 'Composer 底部工具栏', done: true },
    { title: '侧栏搜索框 + 注意力标记', done: true },
    { title: '命令面板 ⌘K', done: true },
    { title: '设置页 11 项导航', done: true },
    { title: 'ChatDock 玻璃化', done: true },
    { title: '差异化品牌调整 (teal)', done: true },
  ];
  const doneCount = taskItems.filter((t) => t.done).length;

  const statusColor: Record<string, string> = {
    M: 'var(--color-warning, #ffd60a)',
    A: 'var(--color-success, #30d158)',
    D: 'var(--color-danger, #ff453a)',
  };
</script>

{#if !collapsed}
  <aside class="right-panel">
    <div class="panel-tabs">
      {#each tabs as tab (tab.id)}
        <button class="tab-btn" class:active={activeTab === tab.id} onclick={() => (activeTab = tab.id)} type="button">
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
        <div class="placeholder"><p>暂无预览文件</p></div>
      {:else if activeTab === 'git'}
        <!-- Git Panel -->
        <div class="git-summary">
          <div class="git-branch"><Icon name="git-branch" size="sm" /><span class="mono">feat/kimi-desktop-tauri</span></div>
          <div class="git-stats">
            <span class="stat-add">+{totalAdd}</span>
            <span class="stat-del">-{totalDel}</span>
          </div>
        </div>
        <div class="git-files">
          {#each gitChanges as f (f.path)}
            <div class="git-file">
              <span class="file-status" style="color: {statusColor[f.status]};">{f.status}</span>
              <span class="file-path" title={f.path}>{f.path.replace('src/', '')}</span>
              <span class="file-diff">
                {#if f.add}<span class="add">+{f.add}</span>{/if}
                {#if f.del}<span class="del">-{f.del}</span>{/if}
              </span>
            </div>
          {/each}
        </div>
      {:else if activeTab === 'tasks'}
        <!-- Task Panel — real data when available -->
        {#if hasActiveSession && realTasks.length > 0}
          {#each realTasks as task (task.id)}
            <div class="task-card">
              <div class="task-header">
                <span class="task-title">{task.description}</span>
                <span class="task-badge task-status-{task.status}">{task.status}</span>
              </div>
              <div class="task-meta">
                {#if task.kind === 'subagent'}<span class="mono">🤖 subagent</span>{/if}
                {#if task.kind === 'bash'}<span class="mono">$ bash</span>{/if}
              </div>
            </div>
          {/each}
        {:else}
          <!-- Mock preview when no session -->
          <div class="task-card">
            <div class="task-header">
              <span class="task-title">UI 美化与玻璃效果优化</span>
              <span class="task-badge">{doneCount}/{taskItems.length}</span>
            </div>
            <div class="task-progress">
              <div class="task-progress-bar" style="width: {(doneCount / taskItems.length) * 100}%;"></div>
            </div>
            <div class="task-list">
              {#each taskItems as t (t.title)}
                <div class="task-item" class:done={t.done}>
                  {#if t.done}
                    <span class="task-check done"><Icon name="check" size="sm" /></span>
                  {:else}
                    <span class="task-check"></span>
                  {/if}
                  <span class="task-text">{t.title}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {:else if activeTab === 'thinking'}
        <!-- Thinking Panel -->
        <div class="thinking-content">
          <div class="think-line">分析当前 UI 组件结构…</div>
          <div class="think-line">确定三栏布局方案：侧栏 + 聊天 + 右栏抽屉</div>
          <div class="think-line">选择 macOS 玻璃材质作为设计语言基础</div>
          <div class="think-line">定义 teal 强调色 #2dd4bf 作为品牌色</div>
          <div class="think-line">引入 @lucide/svelte 替换手动 SVG 图标</div>
          <div class="think-line dim">规划 Composer 底部工具栏控件布局…</div>
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
    flex: none; width: 320px; height: 100%;
    display: flex; flex-direction: column; overflow: hidden;
    background: rgba(18, 18, 22, 0.40);
    backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.6));
    -webkit-backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.6));
    border-left: 1px solid var(--glass-divider, rgba(255,255,255,0.06));
  }
  :global(html[data-color-scheme="light"]) .right-panel {
    background: rgba(248, 248, 250, 0.7);
    border-left-color: rgba(0, 0, 0, 0.04);
  }
  .panel-tabs { display: flex; align-items: center; gap: 2px; padding: 8px 8px 0; flex: none; }
  .tab-btn {
    display: flex; align-items: center; gap: 4px; padding: 5px 10px;
    border: none; border-radius: var(--radius-sm, 8px); background: transparent;
    color: var(--color-text-muted, rgba(235,235,245,0.6)); font-size: 12px; cursor: pointer;
    transition: background 120ms, color 120ms;
  }
  .tab-btn:hover { background: var(--color-hover, rgba(255,255,255,0.06)); }
  .tab-btn.active { background: var(--color-selected, rgba(45,212,191,0.12)); color: var(--color-accent, #2dd4bf); }
  .collapse-btn {
    margin-left: auto; width: 26px; height: 26px; border: none;
    border-radius: var(--radius-sm, 8px); background: transparent; color: var(--color-text-faint);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
  }
  .collapse-btn:hover { background: var(--color-hover); color: var(--color-text-muted); }
  .panel-content { flex: 1; overflow-y: auto; padding: 8px; }
  .placeholder { text-align: center; padding: 40px 20px; color: var(--color-text-faint); font-size: 13px; }

  /* Git Panel */
  .git-summary {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px; margin-bottom: 8px;
    border-radius: var(--radius-md, 10px);
    background: rgba(44,44,46,0.5); border: 1px solid var(--color-line);
  }
  .git-branch { display: flex; align-items: center; gap: 4px; color: var(--color-text-muted); }
  .mono { font-family: var(--font-mono, monospace); font-size: 11px; }
  .git-stats { display: flex; gap: 8px; font-family: var(--font-mono, monospace); font-size: 11px; }
  .stat-add { color: var(--color-success, #30d158); }
  .stat-del { color: var(--color-danger, #ff453a); }
  .git-files { display: flex; flex-direction: column; gap: 2px; }
  .git-file {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 10px; border-radius: var(--radius-sm, 8px);
    font-size: 11px; transition: background 120ms;
  }
  .git-file:hover { background: var(--color-hover); }
  .file-status { font-weight: 600; width: 14px; text-align: center; flex-shrink: 0; font-family: var(--font-mono, monospace); }
  .file-path { flex: 1; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono, monospace); }
  .file-diff { display: flex; gap: 4px; font-family: var(--font-mono, monospace); flex-shrink: 0; }
  .file-diff .add { color: var(--color-success); }
  .file-diff .del { color: var(--color-danger); }

  /* Task Panel */
  .task-card {
    border-radius: var(--radius-lg, 14px);
    background: rgba(44,44,46,0.8); border: 1px solid var(--color-line);
    padding: 14px; margin-bottom: 8px;
  }
  .task-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .task-title { font-size: 13px; font-weight: 500; color: var(--color-text); }
  .task-badge { font-size: 11px; color: var(--color-accent); font-family: var(--font-mono, monospace); }
  .task-status-completed { color: var(--color-success); }
  .task-status-running { color: var(--color-accent); }
  .task-status-failed { color: var(--color-danger); }
  .task-status-cancelled { color: var(--color-text-faint); }
  .task-meta { font-size: 11px; color: var(--color-text-faint); margin-top: 4px; }
  .task-progress { height: 4px; border-radius: 2px; background: rgba(45,212,191,0.15); overflow: hidden; margin-bottom: 12px; }
  .task-progress-bar { height: 100%; background: var(--color-accent, #2dd4bf); border-radius: 2px; transition: width 300ms var(--ease-out, ease-out); }
  .task-list { display: flex; flex-direction: column; gap: 6px; }
  .task-item { display: flex; align-items: center; gap: 8px; }
  .task-check {
    width: 16px; height: 16px; border-radius: 50%;
    border: 1.5px solid var(--color-line-strong);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .task-check.done { background: var(--color-success); border-color: var(--color-success); color: #0a0a0c; }
  .task-text { font-size: 12px; color: var(--color-text-muted); }
  .task-item.done .task-text { color: var(--color-text-faint); text-decoration: line-through; }

  /* Thinking Panel */
  .thinking-content { display: flex; flex-direction: column; gap: 6px; padding: 4px; }
  .think-line { font-size: 12px; color: var(--color-text-muted); line-height: 1.5; font-family: var(--font-mono, monospace); }
  .think-line.dim { color: var(--color-text-faint); }

  .expand-tab {
    flex: none; width: 28px; height: 100%; border: none;
    border-left: 1px solid var(--color-line); background: var(--color-surface-sunken);
    color: var(--color-text-faint); cursor: pointer;
    display: flex; align-items: flex-start; justify-content: center; padding-top: 12px;
    transition: color 120ms;
  }
  .expand-tab:hover { color: var(--color-text-muted); }
</style>
