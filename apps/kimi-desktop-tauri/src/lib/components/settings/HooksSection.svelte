<!-- HooksSection.svelte — Hooks 管理 section（模块页与设置页共用）。

  对齐官方 hooks 模型（docs/zh/customization/hooks.md）：每条规则为
  { event, matcher?, command, timeout? }，持久化到 config.toml 的 [[hooks]]
  数组（经 daemon /config REST 读写）。触发时事件详情以 JSON 经 stdin 传给
  脚本；退出码 0 放行、2 阻断（stderr 为原因）、其他/超时 fail-open。
-->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import Button from '../ui/Button.svelte';
  import Card from '../ui/Card.svelte';
  import Input from '../ui/Input.svelte';
  import Chip from '../ui/Chip.svelte';
  import Spinner from '../ui/Spinner.svelte';
  import { client } from '../../stores/client.svelte';
  import { getKimiWebApi } from '../../api';
  import { toast } from '../../stores/toast.svelte';
  import { HOOK_EVENTS, HOOK_EVENT_MAP, parseHooks, type HookDef } from '../../lib/hookEvents';

  let loading = $state(true);
  let saving = $state(false);
  let hooks = $state<HookDef[]>([]);
  // null = 关闭；{} = 新增；{ index } = 编辑第 index 条
  let editing = $state<{ index?: number } | null>(null);
  let showGuide = $state(false);
  let showEventTable = $state(false);

  // ---- 编辑表单状态 ----
  let formEvent = $state('PreToolUse');
  let formMatcher = $state('');
  let formCommand = $state('');
  let formTimeout = $state('');

  const formEventMeta = $derived(HOOK_EVENT_MAP.get(formEvent));

  async function loadHooks() {
    loading = true;
    try {
      const cfg = await getKimiWebApi().getConfig();
      hooks = parseHooks(cfg.hooks);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    } finally {
      loading = false;
    }
  }

  async function persist(next: HookDef[], okMsg: string) {
    saving = true;
    try {
      // [[hooks]] 只允许 event/matcher/command/timeout 四个字段，省略空值。
      const wire = next.map((h) => ({
        event: h.event,
        command: h.command,
        matcher: h.matcher ? h.matcher : undefined,
        timeout: h.timeout ?? undefined,
      }));
      await client.updateConfig({ hooks: wire });
      hooks = next;
      toast.ok(okMsg);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    } finally {
      saving = false;
    }
  }

  function openCreate() {
    formEvent = 'PreToolUse';
    formMatcher = '';
    formCommand = '';
    formTimeout = '';
    editing = {};
  }

  function openEdit(index: number) {
    const h = hooks[index]!;
    formEvent = HOOK_EVENT_MAP.has(h.event) ? h.event : 'PreToolUse';
    formMatcher = h.matcher ?? '';
    formCommand = h.command;
    formTimeout = h.timeout !== undefined ? String(h.timeout) : '';
    editing = { index };
  }

  async function saveForm() {
    const command = formCommand.trim();
    if (!command) {
      toast.err('command 不能为空');
      return;
    }
    let timeout: number | undefined;
    if (formTimeout.trim() !== '') {
      const t = Number(formTimeout.trim());
      if (!Number.isInteger(t) || t < 1 || t > 600) {
        toast.err('timeout 须为 1–600 的整数（秒）');
        return;
      }
      timeout = t;
    }
    if (formMatcher.trim() !== '') {
      try {
        new RegExp(formMatcher.trim());
      } catch {
        toast.err('matcher 不是合法的正则表达式');
        return;
      }
    }
    const def: HookDef = {
      event: formEvent,
      command,
      matcher: formMatcher.trim() || undefined,
      timeout,
    };
    const next = [...hooks];
    if (editing?.index !== undefined) next[editing.index] = def;
    else next.push(def);
    await persist(next, editing?.index !== undefined ? 'hook 已更新' : 'hook 已添加');
    editing = null;
  }

  async function removeHook(index: number) {
    await persist(hooks.filter((_, i) => i !== index), 'hook 已删除');
  }

  loadHooks();
</script>

<h2>Hooks <span class="beta-badge">官方机制</span></h2>
<p class="sub-desc">每当发生 X，自动运行你的脚本 —— 对齐 Kimi Code 官方 [[hooks]] 行为</p>

<div class="hooks-panel">
  <div class="hooks-header">
    <div class="header-actions">
      <Button size="sm" variant="ghost" onclick={() => { showGuide = !showGuide; }}>
        {showGuide ? '收起原理' : '工作原理'}
      </Button>
      <Button size="sm" variant="ghost" onclick={() => { showEventTable = !showEventTable; }}>
        {showEventTable ? '收起事件表' : '事件一览'}
      </Button>
      <Button size="sm" variant="primary" icon="plus" onclick={openCreate}>添加 hook</Button>
    </div>
  </div>

  {#if showGuide}
    <Card variant="raised" padding="md">
      <div class="guide">
        <h4>Hooks 是怎么工作的（官方行为）</h4>
        <ol>
          <li>每条规则指定三件事：<b>事件</b>（什么时候触发）、<b>matcher</b>（正则过滤目标，不填匹配全部）、<b>command</b>（运行的 Shell 脚本）。</li>
          <li>触发时，daemon 把事件详情（<code>hook_event_name</code>、<code>session_id</code>、<code>session_title</code>、<code>client_type</code>、<code>cwd</code> 及事件特定字段）打包成 JSON，经 <b>stdin</b> 传给脚本。</li>
          <li>脚本退出码决定结果：<code>0</code> 放行（stdout 可附加说明）、<code>2</code> 阻断（stderr 为原因）、其他/超时 <b>fail-open</b> 默认放行。也可经 stdout 返回 <code>{"{"}hookSpecificOutput.permissionDecision:"deny"{"}"}</code> JSON 阻断。</li>
          <li>只有 <b>可阻断事件</b>（PreToolUse / Stop / UserPromptSubmit）的返回值影响主流程；其余为观察型事件，即发即忘。</li>
          <li>同一事件命中多条规则时并行运行；command 完全相同的只运行一次。timeout 默认 30 秒（1–600）。配置写在 <code>~/.kimi-code/config.toml</code> 的 <code>[[hooks]]</code>，保存后重开会话生效。</li>
        </ol>
      </div>
    </Card>
  {/if}

  {#if showEventTable}
    <Card variant="raised" padding="md">
      <div class="event-table">
        <h4>事件一览（官方定义）</h4>
        {#each HOOK_EVENTS as ev (ev.event)}
          <div class="event-row">
            <div class="event-name">
              <code>{ev.event}</code>
              {#if ev.canBlock}<Chip tone="danger" size="sm">可阻断</Chip>{/if}
            </div>
            <div class="event-matcher">matcher：{ev.matcher}</div>
            <div class="event-desc">{ev.desc}</div>
          </div>
        {/each}
      </div>
    </Card>
  {/if}

  {#if editing}
    <Card variant="raised" padding="md">
      <div class="hook-form">
        <h4>{editing.index !== undefined ? '编辑 hook' : '添加 hook'}</h4>
        <label class="form-field">
          <span>事件（什么时候触发）</span>
          <select class="form-select" bind:value={formEvent}>
            {#each HOOK_EVENTS as ev (ev.event)}
              <option value={ev.event}>{ev.event}{ev.canBlock ? '（可阻断）' : ''}</option>
            {/each}
          </select>
        </label>
        {#if formEventMeta}
          <div class="event-hint">
            <Icon name="information" size="sm" />
            <span>{formEventMeta.desc}</span>
          </div>
        {/if}
        <label class="form-field">
          <span>matcher（正则，匹配：{formEventMeta?.matcher ?? '目标'}；留空匹配全部）</span>
          <Input bind:value={formMatcher} placeholder={formEventMeta?.matcherPlaceholder ?? '正则表达式'} size="sm" />
        </label>
        <label class="form-field">
          <span>command（触发时运行的 Shell 命令；事件 JSON 经 stdin 传入）</span>
          <Input bind:value={formCommand} placeholder="如：node ~/.kimi-code/hooks/block-dangerous-bash.mjs" size="sm" />
        </label>
        <label class="form-field">
          <span>timeout（秒，1–600，默认 30）</span>
          <Input bind:value={formTimeout} placeholder="30" size="sm" />
        </label>
        <div class="form-actions">
          <Button size="sm" variant="ghost" onclick={() => { editing = null; }}>取消</Button>
          <Button size="sm" variant="primary" onclick={saveForm} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>
    </Card>
  {/if}

  {#if loading}
    <div class="hooks-loading"><Spinner size="lg" /><p>读取 hooks 配置…</p></div>
  {:else if hooks.length === 0}
    <div class="hooks-empty">
      <Icon name="bolt" size="lg" />
      <h4>尚未配置任何 hook</h4>
      <p>点击「添加 hook」创建第一条规则，例如：Agent 执行 Bash 前拦截危险命令</p>
    </div>
  {:else}
    <div class="hook-list">
      {#each hooks as hook, i (i)}
        {@const meta = HOOK_EVENT_MAP.get(hook.event)}
        <Card variant="raised" padding="none">
          <div class="hook-card">
            <div class="hook-card-top">
              <div class="hook-meta">
                <div class="hook-name-row">
                  <code class="hook-event">{hook.event}</code>
                  {#if meta?.canBlock}<Chip tone="danger" size="sm">可阻断</Chip>{/if}
                  {#if !meta}<Chip tone="neutral" size="sm">未知事件</Chip>{/if}
                </div>
                <div class="hook-sub">
                  <span class="hook-matcher" title="matcher（正则过滤目标）">
                    匹配：{hook.matcher || '全部'}
                  </span>
                  <span class="hook-timeout" title="超时秒数">⏱ {hook.timeout ?? 30}s</span>
                </div>
              </div>
              <div class="hook-actions">
                <Button size="sm" variant="ghost" onclick={() => openEdit(i)}>编辑</Button>
                <Button size="sm" variant="danger" onclick={() => removeHook(i)} disabled={saving}>删除</Button>
              </div>
            </div>
            <code class="hook-command" title={hook.command}>{hook.command}</code>
            {#if meta}<p class="hook-desc">{meta.desc}</p>{/if}
          </div>
        </Card>
      {/each}
    </div>
  {/if}

  <div class="hooks-help">
    <Icon name="information" size="sm" />
    <span>保存写入 <code>config.toml</code> 的 <code>[[hooks]]</code> 数组，重开会话后生效；hook 在 daemon 所在主机执行，出错/超时默认放行（fail-open）。</span>
  </div>
</div>

<style>
  h2 { font-size: 20px; font-weight: 600; color: var(--tx); margin: 0 0 4px; letter-spacing: -0.02em; }
  .sub-desc { font-size: 12px; color: var(--tx3); margin: 0 0 20px; }
  .beta-badge { font-size: 10px; padding: 2px 8px; border-radius: var(--g-radius-chip, 99px); background: var(--ac-soft); color: var(--ac); vertical-align: middle; font-weight: 600; }

  .hooks-panel { display: flex; flex-direction: column; gap: 16px; }
  .hooks-header { display: flex; align-items: center; justify-content: flex-end; }
  .header-actions { display: flex; gap: 8px; }

  .guide h4, .event-table h4, .hook-form h4 { margin: 0 0 10px; font-size: 13px; font-weight: 600; color: var(--tx); }
  .guide ol { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--tx2); line-height: 1.6; }
  .guide code, .event-row code, .hook-event, .hook-command, .hooks-help code {
    font-family: var(--font-mono, ui-monospace, monospace);
  }

  .event-table { display: flex; flex-direction: column; }
  .event-row { display: flex; flex-direction: column; gap: 2px; padding: 8px 0; border-bottom: 1px solid var(--bd); }
  .event-row:last-child { border-bottom: none; }
  .event-name { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--tx); }
  .event-matcher { font-size: 11px; color: var(--tx3); }
  .event-desc { font-size: 11.5px; color: var(--tx2); line-height: 1.5; }

  .hook-form { display: flex; flex-direction: column; gap: 12px; }
  .form-field { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--tx3); }
  .form-select {
    height: 30px; padding: 0 8px; font-size: 12px; color: var(--tx);
    background: var(--mat-input-bg, var(--l1));
    border: var(--g-border-w-input, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    border-radius: var(--g-radius-input, 4px);
  }
  .event-hint { display: flex; gap: 6px; align-items: flex-start; font-size: 11.5px; color: var(--ac); line-height: 1.5; }
  .form-actions { display: flex; justify-content: flex-end; gap: 8px; }

  .hooks-loading { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px 0; color: var(--tx3); font-size: 12px; }
  .hooks-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 20px; color: var(--tx3); text-align: center; }
  .hooks-empty h4 { margin: 0; font-size: 14px; color: var(--tx2); }
  .hooks-empty p { margin: 0; font-size: 12px; }

  .hook-list { display: flex; flex-direction: column; gap: 10px; }
  .hook-card { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; }
  .hook-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .hook-meta { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .hook-name-row { display: flex; align-items: center; gap: 8px; }
  .hook-event { font-size: 13px; font-weight: 600; color: var(--ac); }
  .hook-sub { display: flex; align-items: center; gap: 12px; font-size: 11px; color: var(--tx3); }
  .hook-actions { display: flex; gap: 6px; flex: none; }
  .hook-command {
    display: block; padding: 6px 10px; font-size: 11.5px; color: var(--tx2);
    background: var(--mat-input-bg, var(--l2)); border-radius: var(--g-radius-input, 4px);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .hook-desc { margin: 0; font-size: 11.5px; color: var(--tx3); line-height: 1.5; }

  .hooks-help { display: flex; gap: 6px; align-items: flex-start; font-size: 11px; color: var(--tx3); line-height: 1.5; }
</style>
