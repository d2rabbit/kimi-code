<!-- ProviderModelDialog.svelte — unified provider + model + thinking dialog.

     Replaces the previous split ProviderModelDialog (mode='provider' |
     'model') with a single form covering all three concerns:
       1. Provider: type, id, API key, base URL
       2. Model: provider, model name, alias, context size, display name
       3. Thinking: on/off toggle + effort level (minimal/low/medium/high)

     The thinking controls mirror the kimi-code config.toml schema:
       [thinking]
       enabled = true
       effort = "medium"   # off|minimal|low|medium|high

     Submit saves provider → optional model alias → thinking config in one
     pass. Existing provider/model entries can be edited by passing in
     `initial` (not yet wired in SettingsView; the dialog defaults to
     'create new' for now).
-->
<script lang="ts">
  import Button from '../ui/Button.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Input from '../ui/Input.svelte';
  import Select from '../ui/Select.svelte';
  import Switch from '../ui/Switch.svelte';
  import * as client from '../../stores/client.svelte';
  import { toast } from '../../stores/toast.svelte';

  let {
    onclose = () => {},
    initial = undefined,
  }: {
    /** Kept for backward compatibility — the dialog is now always unified. */
    mode?: 'unified' | 'provider' | 'model';
    onclose?: () => void;
    /** Edit mode: prefill with an existing provider (e.g. 更新 Key / 改端点). */
    initial?: { providerId: string } | undefined;
  } = $props();

  // ---- provider presets (same as before) ----
  const PRESETS: Record<string, { label: string; baseUrl?: string; hint: string }> = {
    openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', hint: 'GPT 系列' },
    anthropic: { label: 'Anthropic', hint: 'Claude 系列（原生协议）' },
    kimi: { label: 'Kimi（Moonshot）', baseUrl: 'https://api.moonshot.cn/v1', hint: 'Kimi K 系列' },
    'google-genai': { label: 'Google GenAI', hint: 'Gemini 系列' },
    openai_responses: { label: 'OpenAI Responses', baseUrl: 'https://api.openai.com/v1', hint: 'OpenAI Responses 兼容服务' },
  };

  // ---- thinking effort levels ----
  // 'off' is the equivalent of `enabled = false`; the other four are the
  // values kimi-code accepts for `effort` per docs/specs.
  // When the current session model declares support_efforts (from the models.dev
  // catalog), the available levels are filtered to what that model supports.
  const DEFAULT_EFFORT_LEVELS: { id: string; label: string; desc: string }[] = [
    { id: 'off',     label: '关闭', desc: '不启用思考' },
    { id: 'minimal', label: '最低', desc: '快速、几乎不消耗 tokens' },
    { id: 'low',     label: '低',   desc: '浅度推理' },
    { id: 'medium',  label: '中',   desc: '推荐：均衡深度与速度' },
    { id: 'high',    label: '高',   desc: '最深度推理（耗时长）' },
  ];

  // Derive the effective effort levels from the current session model's catalog
  // metadata (supportEfforts). Falls back to the full default list when the
  // model is unknown or doesn't declare support_efforts.
  const EFFORT_LEVELS = $derived.by(() => {
    const sessionModelId = client.activeSessionModel();
    const models = client.models();
    const model = models.find((m) => m.id === sessionModelId || m.model === sessionModelId);
    if (model?.supportEfforts && model.supportEfforts.length > 0) {
      // Always include 'off' as the first option; then the model's declared efforts.
      const supported = model.supportEfforts;
      const labelMap: Record<string, string> = {
        off: '关闭', minimal: '最低', low: '低', medium: '中', high: '高',
        xhigh: '超高', max: '最高',
      };
      const descMap: Record<string, string> = {
        off: '不启用思考', minimal: '快速、几乎不消耗 tokens', low: '浅度推理',
        medium: '推荐：均衡深度与速度', high: '最深度推理（耗时长）',
        xhigh: '极深度推理', max: '最大推理深度',
      };
      const levels = [
        { id: 'off', label: '关闭', desc: '不启用思考' },
        ...supported.map((e) => ({ id: e, label: labelMap[e] ?? e, desc: descMap[e] ?? '' })),
      ];
      return levels;
    }
    return DEFAULT_EFFORT_LEVELS;
  });

  // ---- provider form state ----
  let pType = $state('openai');
  let pId = $state('');
  let pKey = $state('');
  let pUrl = $state('');
  // Existing providers — user can pick one instead of creating new.
  const existingProviders = $derived(client.providers());
  const providerOptions = $derived(existingProviders.map((p) => ({ value: p.id, label: p.id })));
  const TYPE_OPTIONS = Object.entries(PRESETS).map(([value, preset]) => ({
    value,
    label: `${preset.label}${preset.hint ? ` · ${preset.hint}` : ''}`,
  }));
  let useExisting = $state(false);
  let selectedProvider = $state('');
  // 已有供应商加模型时默认继承供应商凭据，Key/端点编辑收进高级区——
  // 编辑模式（initial）下自动展开。
  let showProviderEdit = $state(false);

  // Edit mode: prefill from the given provider so the dialog is the single
  // place to add OR edit (更新 Key / 改端点 / 加模型别名).
  $effect(() => {
    if (initial === undefined) return;
    const p = client.providers().find((x) => x.id === initial.providerId);
    if (!p) return;
    useExisting = true;
    selectedProvider = p.id;
    pType = p.type;
    pUrl = p.baseUrl ?? '';
    showProviderEdit = true;
  });

  // ---- model form state ----
  let mName = $state('');
  let mAlias = $state('');
  let mContext = $state('128000');
  let mDisplay = $state('');
  // Model fields are optional — user might only want to register a provider.
  let addModel = $state(true);

  // ---- thinking form state ----
  // Default to current session thinking setting so the dialog reflects
  // the live state when opened.
  let thinkingEnabled = $state(client.thinking() !== 'off');
  // Track the chosen effort separately so toggling enabled on/off doesn't
  // lose the user's pick. Type widened to string — the catalog may declare
  // custom effort levels beyond the original four.
  let effortPick = $state<string>(
    client.thinking() === 'off' || client.thinking() === 'on'
      ? 'medium'
      : client.thinking()
  );

  let saving = $state(false);

  function onTypeChange() {
    if (!pId || pId in PRESETS) pId = pType;
  }

  // Toggle "use existing provider" vs "create new"
  $effect(() => {
    if (useExisting && !selectedProvider && existingProviders.length > 0) {
      selectedProvider = existingProviders[0]!.id;
    }
  });

  // Keep the URL/type fields in sync with the provider chosen in useExisting
  // mode (covers both the initial prefill and manual switches).
  $effect(() => {
    if (!useExisting || !selectedProvider) return;
    const p = existingProviders.find((x) => x.id === selectedProvider);
    if (!p) return;
    pType = p.type;
    pUrl = p.baseUrl ?? '';
  });

  async function submit() {
    if (saving) return;
    saving = true;
    try {
      // 1) Save provider (either existing or new).
      let providerId = '';
      if (useExisting) {
        providerId = selectedProvider;
        // Edit path: only touch the provider when the user actually changed
        // something (key filled, or URL differs from the stored one).
        const existing = existingProviders.find((p) => p.id === providerId);
        const newKey = pKey.trim();
        const newUrl = pUrl.trim();
        if (existing && (newKey || newUrl !== (existing.baseUrl ?? '')) ) {
          await client.client.saveProvider(providerId, {
            type: existing.type,
            apiKey: newKey || undefined,
            baseUrl: newUrl || undefined,
          });
        }
      } else {
        if (!pId.trim()) {
          toast.err('请填写供应商 ID');
          saving = false;
          return;
        }
        providerId = pId.trim();
        await client.client.saveProvider(providerId, {
          type: pType,
          apiKey: pKey.trim() || undefined,
          baseUrl: pUrl.trim() || undefined,
        });
        // Try refreshing models for the new provider (best-effort).
        try {
          await client.client.refreshProviderModels(providerId);
        } catch {
          // Non-fatal — user can manually refresh later.
        }
      }

      // 2) Optionally save a model alias.
      if (addModel && mName.trim()) {
        if (!providerId) {
          toast.err('请先选择或创建供应商');
          saving = false;
          return;
        }
        const alias = (mAlias || mName).trim();
        await client.client.saveModelAlias(alias, {
          provider: providerId,
          model: mName.trim(),
          maxContextSize: parseInt(mContext) || 128000,
          displayName: mDisplay.trim() || undefined,
        });
      }

      // 3) Apply thinking config globally (kimi-code persists per-session,
      //    but the dialog is for default config — apply to the active
      //    session immediately; the next prompt inherits it).
      const newEffort = thinkingEnabled ? effortPick : 'off';
      client.client.setThinking(newEffort);

      toast.ok(useExisting
        ? (addModel && mName.trim() ? `已添加模型并应用思考设置` : '已应用思考设置')
        : `已保存供应商${addModel && mName.trim() ? ' 与模型' : ''}并应用思考设置`);
      onclose();
    } catch (e) {
      toast.err(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      saving = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="pmd-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="pmd-dialog animate-spring-in" role="dialog" aria-modal="true" aria-label="供应商与模型配置" tabindex="-1" onkeydown={(e) => { if (e.key === 'Escape') onclose(); }}>
    <div class="pmd-head">
      <span class="pmd-title">供应商与模型配置</span>
      <span class="pmd-sub">一站式配置供应商、模型与思考等级</span>
      <IconButton name="close" size="sm" label="关闭" onclick={onclose} class="pmd-x" />
    </div>

    <div class="pmd-body">
      <!-- ===== Section 1: Provider ===== -->
      <section class="pmd-section">
        <header class="pmd-sec-head">
          <span class="pmd-sec-title">① 供应商</span>
          {#if existingProviders.length > 0}
            <label class="pmd-toggle-inline">
              <Switch bind:checked={useExisting} />
              <span>使用已有</span>
            </label>
          {/if}
        </header>

        {#if useExisting}
          <label class="fld">
            <span class="lbl">选择供应商</span>
            <Select bind:value={selectedProvider} options={providerOptions} />
          </label>
          <p class="inherit-hint">凭据沿用该供应商现有配置，无需重复输入。</p>
          <button class="adv-toggle" type="button" onclick={() => showProviderEdit = !showProviderEdit}>
            <span class="adv-chev">{showProviderEdit ? '▾' : '▸'}</span> 修改供应商信息（Key / 端点）
          </button>
          {#if showProviderEdit}
            <label class="fld">
              <span class="lbl">API Key<span class="hint">留空则保持不变</span></span>
              <Input type="password" bind:value={pKey} placeholder="输入新 Key 以更新" />
            </label>
            <label class="fld">
              <span class="lbl">Base URL<span class="hint">修改后保存生效</span></span>
              <Input bind:value={pUrl} placeholder="https://…" />
            </label>
          {/if}
        {:else}
          <label class="fld">
            <span class="lbl">服务类型</span>
            <Select bind:value={pType} options={TYPE_OPTIONS} onchange={onTypeChange} />
          </label>
          <label class="fld">
            <span class="lbl">供应商 ID<span class="hint">用于引用，默认与类型同名</span></span>
            <Input bind:value={pId} placeholder={pType} />
          </label>
          <label class="fld">
            <span class="lbl">API Key</span>
            <Input type="password" bind:value={pKey} placeholder="sk-..." />
          </label>
          <label class="fld">
            <span class="lbl">Base URL<span class="hint">可选，留空用默认端点</span></span>
            <Input bind:value={pUrl} placeholder={PRESETS[pType]?.baseUrl ?? 'https://…'} />
          </label>
        {/if}
      </section>

      <!-- ===== Section 2: Model (optional) ===== -->
      <section class="pmd-section">
        <header class="pmd-sec-head">
          <span class="pmd-sec-title">② 模型<span class="pmd-sec-optional">（可选）</span></span>
          <label class="pmd-toggle-inline">
            <Switch bind:checked={addModel} />
            <span>添加模型别名</span>
          </label>
        </header>

        {#if addModel}
          <label class="fld">
            <span class="lbl">模型名<span class="hint">与供应商上的名称一致</span></span>
            <Input bind:value={mName} placeholder="gpt-4o" oninput={() => { if (!mAlias) mAlias = mName; }} />
          </label>
          <label class="fld">
            <span class="lbl">别名<span class="hint">聊天中显示/选择用，默认同模型名</span></span>
            <Input bind:value={mAlias} placeholder={mName || 'my-model'} />
          </label>
          <div class="fld-row">
            <label class="fld">
              <span class="lbl">Context</span>
              <Input type="number" bind:value={mContext} placeholder="128000" />
            </label>
            <label class="fld">
              <span class="lbl">显示名<span class="hint">可选</span></span>
              <Input bind:value={mDisplay} placeholder={mName || 'GPT-4o'} />
            </label>
          </div>
        {/if}
      </section>

      <!-- ===== Section 3: Thinking (mirrors config.toml) ===== -->
      <section class="pmd-section">
        <header class="pmd-sec-head">
          <span class="pmd-sec-title">③ 思考（thinking）</span>
          <label class="pmd-toggle-inline">
            <Switch bind:checked={thinkingEnabled} />
            <span>{thinkingEnabled ? '已启用' : '已关闭'}</span>
          </label>
        </header>

        {#if thinkingEnabled}
          <div class="effort-grid">
            {#each EFFORT_LEVELS.filter((l): l is typeof EFFORT_LEVELS[number] & { id: 'minimal' | 'low' | 'medium' | 'high' } => l.id !== 'off') as lvl (lvl.id)}
              <button
                type="button"
                class="effort-pill"
                class:active={effortPick === lvl.id}
                onclick={() => effortPick = lvl.id}
                title={lvl.desc}
              >
                <span class="effort-label">{lvl.label}</span>
                <span class="effort-desc">{lvl.desc}</span>
              </button>
            {/each}
          </div>
          <p class="pmd-hint-line">
            当前：<b>{EFFORT_LEVELS.find((l) => l.id === (thinkingEnabled ? effortPick : 'off'))?.label}</b>
            · 等同 <code class="inline-code">[thinking] effort = "{thinkingEnabled ? effortPick : 'off'}"</code>
          </p>
        {:else}
          <p class="pmd-hint-line">思考功能关闭。agent 不会输出思考过程，速度最快。</p>
        {/if}
      </section>
    </div>

    <div class="pmd-foot">
      <Button onclick={onclose}>取消</Button>
      <Button variant="primary" disabled={saving || (!useExisting && !pId.trim())} onclick={submit}>
        {saving ? '保存中…' : '保存配置'}
      </Button>
    </div>
  </div>
</div>

<style>
  .pmd-backdrop { position: fixed; inset: 0; z-index: var(--z-modal, 400); display: flex; align-items: center; justify-content: center; background: var(--overlay); padding: 16px; }
  .pmd-dialog {
    width: min(540px, 92vw); max-height: 90vh; overflow-y: auto;
    background: var(--mat-surface-3, var(--l3));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd2));
    border-radius: var(--g-radius-overlay, 16px);
    box-shadow: var(--elev-overlay, var(--sh-lg));
  }
  .pmd-head { display: flex; align-items: baseline; gap: 8px; padding: 16px 18px 8px; position: sticky; top: 0; background: var(--mat-surface-3, var(--l3)); border-bottom: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd)); z-index: 1; }
  .pmd-title { font-size: 15px; font-weight: 700; color: var(--tx); letter-spacing: -0.01em; }
  .pmd-sub { font-size: 11px; color: var(--tx3); }
  :global(.pmd-x) { margin-left: auto; flex: none; }

  .pmd-body { display: flex; flex-direction: column; gap: 14px; padding: 14px 18px 4px; }

  .pmd-section {
    display: flex; flex-direction: column; gap: 10px;
    padding: 12px;
    background: var(--mat-surface-1, var(--l1));
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    border-radius: var(--g-radius-card, 12px);
  }
  .pmd-sec-head {
    display: flex; align-items: center; justify-content: space-between;
    margin: -2px 0;
  }
  .pmd-sec-title { font-size: 12.5px; font-weight: 700; color: var(--tx); }
  .pmd-sec-optional { font-size: 10px; color: var(--tx3); font-weight: 400; margin-left: 4px; }

  .pmd-toggle-inline {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; color: var(--tx2); cursor: pointer;
  }

  .fld { display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .inherit-hint { font-size: 11px; color: var(--tx3); margin: 2px 0 0; }
  .adv-toggle {
    display: inline-flex; align-items: center; gap: 5px;
    border: none; background: transparent; padding: 2px 0;
    color: var(--tx3); font-size: 11px; cursor: pointer;
  }
  .adv-toggle:hover { color: var(--tx); }
  .adv-chev { font-size: 9px; }
  .fld-row { display: flex; gap: 10px; }
  .lbl { font-size: 11.5px; font-weight: 500; color: var(--tx); display: flex; align-items: baseline; gap: 6px; }
  .hint { font-size: 10px; color: var(--tx3); font-weight: 400; }

  .effort-grid {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
  }
  .effort-pill {
    display: flex; flex-direction: column; gap: 2px;
    padding: 9px 12px; border-radius: var(--g-radius-control, 8px);
    border: var(--g-border-w-input, 1.5px) var(--g-border-style, solid) var(--g-border-color, var(--bd2));
    background: var(--mat-surface-2, var(--l2));
    cursor: pointer; text-align: left;
    transition: border-color var(--duration-fast) var(--ease), background var(--duration-fast) var(--ease);
  }
  .effort-pill:hover { border-color: var(--ac); }
  .effort-pill.active {
    border-color: var(--ac); background: var(--ac-soft);
  }
  .effort-label { font-size: 12.5px; font-weight: 700; color: var(--tx); }
  .effort-pill.active .effort-label { color: var(--ac); }
  .effort-desc { font-size: 10.5px; color: var(--tx3); line-height: 1.3; }

  .pmd-hint-line {
    margin: 2px 0 0; font-size: 11px; color: var(--tx3);
    display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
  }
  .pmd-hint-line b { color: var(--tx); font-weight: 600; }
  .inline-code {
    font-family: var(--font-mono, monospace); font-size: 10.5px;
    background: var(--l2); padding: 1px 5px; border-radius: 4px; color: var(--ac);
  }

  .pmd-foot {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 14px 18px 16px; position: sticky; bottom: 0;
    background: var(--mat-surface-3, var(--l3));
    border-top: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
  }
</style>
