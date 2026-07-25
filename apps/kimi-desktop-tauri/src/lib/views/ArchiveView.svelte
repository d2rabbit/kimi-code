<!-- ArchiveView.svelte — 归档历史：按工作区分组，恢复 / 删除。归档不删除数据。 -->
<script lang="ts">
  import * as client from '../stores/client.svelte';
  import Icon from '../components/ui/Icon.svelte';
  import Empty from '../components/ui/Empty.svelte';
  import Button from '../components/ui/Button.svelte';
  let query = $state('');

  $effect(() => { void client.client.loadArchivedSessions(); });

  function wsName(s: { workspaceId?: string; cwd?: string }): string {
    if (s.workspaceId) {
      const ws = client.workspaces().find((w) => w.id === s.workspaceId);
      if (ws) return ws.name;
    }
    if (s.cwd) return s.cwd.split('/').filter(Boolean).pop() ?? s.cwd;
    return '未分组';
  }

  const grouped = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = client.client.archivedSessions.filter(
      (s) => !q || (s.title ?? '').toLowerCase().includes(q) || (s.cwd ?? '').toLowerCase().includes(q),
    );
    const map = new Map<string, typeof list>();
    for (const s of list) {
      const key = wsName(s);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.entries()];
  });

  async function restore(id: string) { await client.client.restoreSession(id); }
</script>

<div class="page">
  <div class="page-head">
    <h2>归档历史</h2>
    <span class="sub">归档不删除数据，仅从侧栏移除</span>
    <div class="right"><span class="cnt-note">{client.client.archivedSessions.length} 个已归档会话</span></div>
  </div>
  <div class="page-body">
    <div class="search"><Icon name="search" size="sm" /><input placeholder="搜索已归档会话…" bind:value={query} /></div>

    {#if client.client.archivedLoading}
      <p class="note">加载中…</p>
    {:else if grouped.length === 0}
      <Empty icon="▤" title={query ? '无匹配的归档会话' : '没有已归档的会话'} desc={query ? '' : '归档的会话会按工作区分组显示在这里'} />
    {:else}
      {#each grouped as [name, list] (name)}
        <div class="arch-g">{name}</div>
        <div class="card rows">
          {#each list as s (s.id)}
            <div class="arch">
              <span class="t" title={s.title || '新对话'}>{s.title || '新对话'}</span>
              <span class="d">{s.messageCount != null ? `${s.messageCount} 条消息` : ''}</span>
              <span class="acts">
                <Button size="sm" onclick={() => restore(s.id)}>恢复</Button>
              </span>
            </div>
          {/each}
        </div>
      {/each}
      <p class="note">恢复后回到侧栏原工作区分组。</p>
    {/if}
  </div>
</div>

<style>
  .page { flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100%; overflow: hidden; }
  .page-head { display: flex; align-items: baseline; gap: 12px; padding: 32px 40px 0; border-bottom: none; max-width: 680px; margin: 0 auto; width: 100%; }
  .page-head h2 { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; color: var(--tx); }
  .page-head .sub { font-size: 12px; color: var(--tx3); }
  .page-head .right { margin-left: auto; }
  .cnt-note { font-size: 11px; color: var(--tx3); font-family: var(--font-mono); }
  .page-body { flex: 1; overflow-y: auto; padding: 20px 40px 60px; display: flex; flex-direction: column; gap: 12px; max-width: 680px; margin: 0 auto; width: 100%; }
  .search { display: flex; align-items: center; gap: 7px; height: 30px; padding: 0 10px; border-radius: var(--g-radius-input, 4px); border: var(--g-border-w-input, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd)); background: var(--mat-input-bg, var(--l1)); box-shadow: var(--elev-input, none); font-size: 12px; color: var(--tx3); width: 260px; }
  .search input { flex: 1; background: none; border: none; outline: none; color: var(--tx); font: inherit; font-size: 12px; }
  .note { font-size: 11px; color: var(--tx3); }


  .arch-g { font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--tx3); font-weight: 600; margin-top: 4px; }
  .card { border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd)); border-radius: var(--g-radius-card, 12px); background: var(--mat-surface-2, var(--l2)); backdrop-filter: var(--mat-blur, none); -webkit-backdrop-filter: var(--mat-blur, none); box-shadow: var(--elev-card, var(--toplight)); }
  .rows { padding: 4px 8px; }
  .arch { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: var(--g-radius-control, 4px); font-size: 12.5px; color: var(--tx2); transition: background var(--duration-fast) var(--ease); }
  .arch:hover { background: var(--ac-soft); }
  .arch .t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .arch .d { font-size: 10.5px; color: var(--tx3); white-space: nowrap; }
  .arch .acts { display: flex; gap: 6px; }
</style>
