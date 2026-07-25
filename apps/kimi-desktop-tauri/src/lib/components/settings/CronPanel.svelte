<!-- CronPanel.svelte — 会话定时任务管理（/sessions/:id/cron）。
     任务由 daemon 调度触发，触发时以 cron 来源向主 agent 发起一轮对话。 -->
<script lang="ts">
  import { onMount } from 'svelte';
  import * as client from '../../stores/client.svelte';
  import { getKimiWebApi } from '../../api';
  import type { AppCronTask } from '../../api/types';
  import Button from '../ui/Button.svelte';
  import Card from '../ui/Card.svelte';
  import Chip from '../ui/Chip.svelte';
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Input from '../ui/Input.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import Switch from '../ui/Switch.svelte';
  import Textarea from '../ui/Textarea.svelte';
  import { toast } from '../../stores/toast.svelte';

  let tasks = $state<AppCronTask[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let showForm = $state(false);
  let saving = $state(false);

  let formCron = $state('');
  let formPrompt = $state('');
  let formRecurring = $state(true);

  const activeSessionId = $derived(client.activeSessionId());

  function fmtTime(ms?: number): string {
    if (!ms) return '—';
    try {
      return new Date(ms).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '—';
    }
  }

  async function load() {
    const sid = activeSessionId;
    tasks = [];
    error = null;
    if (!sid) {
      loading = false;
      return;
    }
    loading = true;
    try {
      tasks = await getKimiWebApi().listCronTasks(sid);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function create() {
    const sid = activeSessionId;
    const cron = formCron.trim();
    const prompt = formPrompt.trim();
    if (!sid || !cron || !prompt || saving) return;
    saving = true;
    try {
      await getKimiWebApi().createCronTask(sid, { cron, prompt, recurring: formRecurring });
      toast.ok('定时任务已创建');
      showForm = false;
      formCron = '';
      formPrompt = '';
      await load();
    } catch (e) {
      toast.err(`创建失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      saving = false;
    }
  }

  async function remove(task: AppCronTask) {
    const sid = activeSessionId;
    if (!sid) return;
    if (!confirm(`删除定时任务「${task.cron}」？`)) return;
    try {
      await getKimiWebApi().deleteCronTask(sid, task.id);
      tasks = tasks.filter((t) => t.id !== task.id);
      toast.ok('已删除');
    } catch (e) {
      toast.err(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  onMount(load);

  // Reload when the active session changes.
  $effect(() => {
    void activeSessionId;
    void load();
  });
</script>

<div class="cron-panel">
  <div class="cron-header">
    <div>
      <h3>定时任务</h3>
      <p class="cron-desc">按 cron 表达式调度，触发时 daemon 会在当前会话自动发起一轮对话。</p>
    </div>
    <div class="cron-header-actions">
      <Button size="sm" icon="refresh" onclick={load} disabled={loading}>刷新</Button>
      {#if activeSessionId}
        <Button size="sm" variant="primary" icon="plus" onclick={() => showForm = !showForm}>新建</Button>
      {/if}
    </div>
  </div>

  {#if showForm}
    <Card variant="sunken" padding="none">
      <div class="cron-form">
      <div class="form-row">
        <label>cron 表达式
          <Input bind:value={formCron} placeholder="*/5 * * * *（分 时 日 月 周）" size="sm" />
        </label>
      </div>
      <div class="form-row">
        <label>触发时发送的 prompt
          <Textarea bind:value={formPrompt} rows={2} placeholder="例如：检查一下仓库状态，一句话汇报" />
        </label>
      </div>
      <div class="form-row inline">
        <Switch bind:checked={formRecurring} label="循环执行" />
        <span class="hint">关闭则只触发一次</span>
      </div>
      <div class="form-actions">
        <Button size="sm" variant="ghost" onclick={() => showForm = false}>取消</Button>
        <Button size="sm" variant="primary" onclick={create} disabled={saving || !formCron.trim() || !formPrompt.trim()}>
          {saving ? '创建中…' : '创建'}
        </Button>
      </div>
      </div>
    </Card>
  {/if}

  {#if !activeSessionId}
    <div class="cron-empty">
      <Icon name="information" size="md" />
      <p>选择一个会话后管理它的定时任务</p>
    </div>
  {:else if loading}
    <div class="cron-empty"><Spinner size="lg" /><p>加载中…</p></div>
  {:else if error}
    <div class="cron-empty">
      <Icon name="error-warning" size="md" />
      <p>{error}</p>
      <Button size="sm" onclick={load}>重试</Button>
    </div>
  {:else if tasks.length === 0}
    <div class="cron-empty">
      <Icon name="check-list" size="lg" />
      <h4>没有定时任务</h4>
      <p>点击「新建」按 cron 表达式调度自动对话；agent 也可以通过 cron 工具自行创建。</p>
    </div>
  {:else}
    <div class="cron-list">
      {#each tasks as task (task.id)}
        <Card variant="raised" padding="none">
          <div class="cron-item">
            <div class="cron-item-main">
              <div class="cron-item-top">
                <code class="cron-expr">{task.cron}</code>
                {#if task.recurring}<Chip tone="accent" size="sm">循环</Chip>{:else}<Chip tone="neutral" size="sm">单次</Chip>{/if}
              </div>
              <div class="cron-prompt" title={task.prompt}>{task.prompt}</div>
              <div class="cron-meta">
                创建于 {fmtTime(task.createdAt)} · 上次触发 {fmtTime(task.lastFiredAt)}
              </div>
            </div>
            <IconButton name="delete" label="删除" size="sm" onclick={() => remove(task)} />
          </div>
        </Card>
      {/each}
    </div>
  {/if}
</div>

<style>
  .cron-panel { display: flex; flex-direction: column; gap: 16px; }
  .cron-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .cron-header h3 { font-size: var(--text-base, 14px); font-weight: var(--weight-medium, 500); margin: 0 0 4px; }
  .cron-desc { font-size: var(--text-xs, 12px); color: var(--color-text-muted, #999); margin: 0; }
  .cron-header-actions { display: flex; gap: 6px; flex: none; }

  .cron-form { display: flex; flex-direction: column; gap: 10px; padding: 14px; }
  .form-row { display: flex; flex-direction: column; gap: 3px; }
  .form-row label { font-size: 11px; color: var(--color-text-faint); display: flex; flex-direction: column; gap: 4px; }
  .form-row.inline { flex-direction: row; align-items: center; gap: 8px; }
  .form-row .hint { font-size: 11px; color: var(--color-text-faint); }
  .form-actions { display: flex; justify-content: flex-end; gap: 8px; }

  .cron-empty {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    padding: 40px 20px; text-align: center;
    color: var(--color-text-muted, #999); font-size: var(--text-sm, 13px);
  }
  .cron-empty h4 { font-size: var(--text-base, 14px); color: var(--color-text, #ececec); margin: 0; }
  .cron-empty p { margin: 0; max-width: 380px; line-height: 1.6; }

  .cron-list { display: flex; flex-direction: column; gap: 8px; }
  .cron-item { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; }
  .cron-item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .cron-item-top { display: flex; align-items: center; gap: 8px; }
  .cron-expr {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    color: var(--color-accent);
    background: var(--color-accent-soft);
    padding: 2px 8px;
    border-radius: var(--g-radius-chip, 999px);
  }
  .cron-prompt {
    font-size: var(--text-sm, 13px);
    color: var(--color-text, #ececec);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .cron-meta { font-size: 10.5px; color: var(--color-text-faint); font-family: var(--font-mono, monospace); }
</style>
