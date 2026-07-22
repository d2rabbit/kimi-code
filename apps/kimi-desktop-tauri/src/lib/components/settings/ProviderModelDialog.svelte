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
  import Icon from '../ui/Icon.svelte';
  import * as client from '../../stores/client.svelte';
  import { toast } from '../../stores/toast.svelte';

  let {
    onclose = () => {},
  }: {
    /** Kept for backward compatibility — the dialog is now always unified. */
    mode?: 'unified' | 'provider' | 'model';
    onclose?: () => void;
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
  let useExisting = $state(false);
  let selectedProvider = $state('');

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

  async function submit() {
    if (saving) return;
    saving = true;
    try {
      // 1) Save provider (either existing or new).
      let providerId = '';
      if (useExisting) {
        providerId = selectedProvider;
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
      <button class="pmd-x" onclick={onclose} aria-label="关闭" type="button"><Icon name="close" size="sm" /></button>
    </div>

    <div class="pmd-body">
      <!-- ===== Section 1: Provider ===== -->
      <section class="pmd-section">
        <header class="pmd-sec-head">
          <span class="pmd-sec-title">① 供应商</span>
          {#if existingProviders.length > 0}
            <label class="pmd-toggle-inline">
              <input type="checkbox" bind:checked={useExisting} />
              <span>使用已有</span>
            </label>
          {/if}
        </header>

        {#if useExisting}
          <label class="fld">
            <span class="lbl">选择供应商</span>
            <select class="inp" bind:value={selectedProvider}>
              {#each existingProviders as p (p.id)}
                <option value={p.id}>{p.id}</option>
              {/each}
            </select>
          </label>
        {:else}
          <label class="fld">
            <span class="lbl">服务类型</span>
            <select class="inp" bind:value={pType} onchange={onTypeChange}>
              {#each Object.entries(PRESETS) as [val, preset] (val)}
                <option value={val}>{preset.label}{preset.hint ? ` · ${preset.hint}` : ''}</option>
              {/each}
            </select>
          </label>
          <label class="fld">
            <span class="lbl">供应商 ID<span class="hint">用于引用，默认与类型同名</span></span>
            <input class="inp" bind:value={pId} placeholder={pType} />
          </label>
          <label class="fld">
            <span class="lbl">API Key</span>
            <input class="inp" type="password" bind:value={pKey} placeholder="sk-..." />
          </label>
          <label class="fld">
            <span class="lbl">Base URL<span class="hint">可选，留空用默认端点</span></span>
            <input class="inp" bind:value={pUrl} placeholder={PRESETS[pType]?.baseUrl ?? 'https://…'} />
          </label>
        {/if}
      </section>

      <!-- ===== Section 2: Model (optional) ===== -->
      <section class="pmd-section">
        <header class="pmd-sec-head">
          <span class="pmd-sec-title">② 模型<span class="pmd-sec-optional">（可选）</span></span>
          <label class="pmd-toggle-inline">
            <input type="checkbox" bind:checked={addModel} />
            <span>添加模型别名</span>
          </label>
        </header>

        {#if addModel}
          <label class="fld">
            <span class="lbl">模型名<span class="hint">与供应商上的名称一致</span></span>
            <input class="inp" bind:value={mName} placeholder="gpt-4o" oninput={() => { if (!mAlias) mAlias = mName; }} />
          </label>
          <label class="fld">
            <span class="lbl">别名<span class="hint">聊天中显示/选择用，默认同模型名</span></span>
            <input class="inp" bind:value={mAlias} placeholder={mName || 'my-model'} />
          </label>
          <div class="fld-row">
            <label class="fld">
              <span class="lbl">Context</span>
              <input class="inp" type="number" bind:value={mContext} placeholder="128000" />
            </label>
            <label class="fld">
              <span class="lbl">显示名<span class="hint">可选</span></span>
              <input class="inp" bind:value={mDisplay} placeholder={mName || 'GPT-4o'} />
            </label>
          </div>
        {/if}
      </section>

      <!-- ===== Section 3: Thinking (mirrors config.toml) ===== -->
      <section class="pmd-section">
        <header class="pmd-sec-head">
          <span class="pmd-sec-title">③ 思考（thinking）</span>
          <label class="pmd-toggle-inline">
            <input type="checkbox" bind:checked={thinkingEnabled} />
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
      <button class="btn" onclick={onclose} type="button">取消</button>
      <button class="btn pri" disabled={saving || (!useExisting && !pId.trim())} onclick={submit} type="button">
        {saving ? '保存中…' : '保存配置'}
      </button>
    </div>
  </div>
</div>

<style>
  .pmd-backdrop { position: fixed; inset: 0; z-index: var(--z-modal, 400); display: flex; align-items: center; justify-content: center; background: var(--overlay); padding: 16px; }
  .pmd-dialog {
    width: min(540px, 92vw); max-height: 90vh; overflow-y: auto;
    background: var(--l3); border: 1px solid var(--bd2); border-radius: var(--r-xl);
    box-shadow: var(--sh-lg);
  }
  .pmd-head { display: flex; align-items: baseline; gap: 8px; padding: 16px 18px 8px; position: sticky; top: 0; background: var(--l3); border-bottom: 1px solid var(--bd); z-index: 1; }
  .pmd-title { font-size: 15px; font-weight: 700; color: var(--tx); letter-spacing: -0.01em; }
  .pmd-sub { font-size: 11px; color: var(--tx3); }
  .pmd-x { margin-left: auto; width: 26px; height: 26px; border: none; border-radius: var(--r-sm); background: transparent; color: var(--tx3); cursor: pointer; display: flex; align-items: center; justify-content: center; flex: none; }
  .pmd-x:hover { background: var(--ac-soft); color: var(--tx); }

  .pmd-body { display: flex; flex-direction: column; gap: 14px; padding: 14px 18px 4px; }

  .pmd-section {
    display: flex; flex-direction: column; gap: 10px;
    padding: 12px; border: 1px solid var(--bd); border-radius: var(--r-lg);
    background: var(--l1);
  }
  .pmd-sec-head {
    display: flex; align-items: center; justify-content: space-between;
    margin: -2px 0;
  }
  .pmd-sec-title { font-size: 12.5px; font-weight: 700; color: var(--tx); }
  .pmd-sec-optional { font-size: 10px; color: var(--tx3); font-weight: 400; margin-left: 4px; }

  .pmd-toggle-inline {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 11px; color: var(--tx2); cursor: pointer;
  }
  .pmd-toggle-inline input { margin: 0; }

  .fld { display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .fld-row { display: flex; gap: 10px; }
  .lbl { font-size: 11.5px; font-weight: 500; color: var(--tx); display: flex; align-items: baseline; gap: 6px; }
  .hint { font-size: 10px; color: var(--tx3); font-weight: 400; }
  .inp {
    padding: 8px 10px; border-radius: var(--r-md); background: var(--l2);
    border: 1px solid var(--bd); color: var(--tx); font-size: 12.5px;
    outline: none; font-family: inherit; width: 100%;
    transition: border-color var(--duration-fast) var(--ease);
  }
  .inp:focus { border-color: var(--ac); }

  .effort-grid {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
  }
  .effort-pill {
    display: flex; flex-direction: column; gap: 2px;
    padding: 9px 12px; border-radius: var(--r-md);
    border: 1.5px solid var(--bd2); background: var(--l2);
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
    background: var(--l3); border-top: 1px solid var(--bd);
  }
  .btn {
    display: inline-flex; align-items: center; gap: 5px; height: 30px;
    padding: 0 16px; border-radius: var(--r-md);
    font-size: 12.5px; font-weight: 600;
    border: 1px solid var(--bd2); color: var(--tx2); background: transparent;
    cursor: pointer; transition: all var(--duration-fast) var(--ease);
  }
  .btn:hover:not(:disabled) { color: var(--tx); border-color: var(--tx3); }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn.pri { background: var(--ac); border-color: transparent; color: var(--color-text-on-accent, #fff); }
  .btn.pri:hover:not(:disabled) { background: var(--ac-h); }
</style>
