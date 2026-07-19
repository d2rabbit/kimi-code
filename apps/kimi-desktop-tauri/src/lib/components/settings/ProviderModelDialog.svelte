<!-- ProviderModelDialog.svelte — 弹窗式添加供应商 / 自定义模型。
     聚焦式引导表单：类型预设、ID 自动、保存即拉模型；Esc/背点关闭。 -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import * as client from '../../stores/client.svelte';
  import { toast } from '../../stores/toast.svelte';

  let {
    mode,
    onclose = () => {},
  }: {
    mode: 'provider' | 'model';
    onclose?: () => void;
  } = $props();

  // ---- 供应商预设 ----
  const PRESETS: Record<string, { label: string; baseUrl?: string; hint: string }> = {
    openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', hint: 'GPT 系列' },
    anthropic: { label: 'Anthropic', hint: 'Claude 系列（原生协议）' },
    kimi: { label: 'Kimi（Moonshot）', baseUrl: 'https://api.moonshot.cn/v1', hint: 'Kimi K 系列' },
    'google-genai': { label: 'Google GenAI', hint: 'Gemini 系列' },
    openai_responses: { label: 'OpenAI Responses', baseUrl: 'https://api.openai.com/v1', hint: 'OpenAI Responses 兼容服务' },
  };

  // provider form
  let pType = $state('openai');
  let pId = $state('');
  let pKey = $state('');
  let pUrl = $state('');
  let saving = $state(false);

  // model form
  let mProvider = $state('');
  let mName = $state('');
  let mAlias = $state('');
  let mContext = $state('128000');
  let mDisplay = $state('');

  function onTypeChange() {
    if (!pId || pId in PRESETS) pId = pType;
  }

  async function submitProvider() {
    if (!pId.trim() || saving) return;
    saving = true;
    try {
      await client.client.saveProvider(pId.trim(), {
        type: pType,
        apiKey: pKey.trim() || undefined,
        baseUrl: pUrl.trim() || undefined,
      });
      try {
        await client.client.refreshProviderModels(pId.trim());
        toast.ok(`已保存并拉取到 ${client.models().length} 个模型`);
      } catch {
        toast.info('已保存供应商；模型暂不可达，可稍后手动刷新');
      }
      onclose();
    } finally {
      saving = false;
    }
  }

  async function submitModel() {
    const alias = (mAlias || mName).trim();
    const provider = mProvider.trim() || client.providers()[0]?.id || '';
    if (!alias || !provider || !mName.trim() || saving) return;
    saving = true;
    try {
      await client.client.saveModelAlias(alias, {
        provider,
        model: mName.trim(),
        maxContextSize: parseInt(mContext) || 128000,
        displayName: mDisplay.trim() || undefined,
      });
      toast.ok(`已添加模型 ${alias}`);
      onclose();
    } finally {
      saving = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
    if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'SELECT') {
      e.preventDefault();
      if (mode === 'provider') void submitProvider();
      else void submitModel();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="pmd-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }} onkeydown={(e) => { if (e.key === 'Escape') onclose(); }}>
  <div class="pmd-dialog animate-spring-in" role="dialog" aria-modal="true" aria-label={mode === 'provider' ? '添加供应商' : '添加自定义模型'}>
    <div class="pmd-head">
      <span class="pmd-title">{mode === 'provider' ? '添加供应商' : '添加自定义模型'}</span>
      <span class="pmd-sub">{mode === 'provider' ? '保存后自动拉取该服务的模型清单' : '为现有供应商登记一个模型别名'}</span>
      <button class="pmd-x" onclick={onclose} aria-label="关闭"><Icon name="close" size="sm" /></button>
    </div>

    <div class="pmd-body">
      {#if mode === 'provider'}
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
      {:else}
        <label class="fld">
          <span class="lbl">供应商</span>
          <select class="inp" bind:value={mProvider}>
            {#each client.providers() as p (p.id)}
              <option value={p.id}>{p.id}</option>
            {/each}
          </select>
        </label>
        <label class="fld">
          <span class="lbl">模型名<span class="hint">与该供应商上的名称一致</span></span>
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
    </div>

    <div class="pmd-foot">
      <button class="btn" onclick={onclose} type="button">取消</button>
      {#if mode === 'provider'}
        <button class="btn pri" disabled={saving || !pId.trim()} onclick={submitProvider} type="button">{saving ? '正在拉取模型…' : '保存并拉取模型'}</button>
      {:else}
        <button class="btn pri" disabled={saving || !mName.trim()} onclick={submitModel} type="button">{saving ? '添加中…' : '添加'}</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .pmd-backdrop { position: fixed; inset: 0; z-index: var(--z-modal, 400); display: flex; align-items: center; justify-content: center; background: var(--overlay); }
  .pmd-dialog { width: min(420px, 92vw); background: var(--l3); border: 1px solid var(--bd2); border-radius: var(--r-xl); box-shadow: var(--sh-lg); overflow: hidden; }
  .pmd-head { display: flex; align-items: baseline; gap: 8px; padding: 16px 18px 8px; }
  .pmd-title { font-size: 14px; font-weight: 700; color: var(--tx); letter-spacing: -0.01em; }
  .pmd-sub { font-size: 11px; color: var(--tx3); }
  .pmd-x { margin-left: auto; width: 24px; height: 24px; border: none; border-radius: var(--r-sm); background: transparent; color: var(--tx3); cursor: pointer; display: flex; align-items: center; justify-content: center; flex: none; }
  .pmd-x:hover { background: var(--ac-soft); color: var(--tx); }

  .pmd-body { display: flex; flex-direction: column; gap: 12px; padding: 8px 18px 4px; }
  .fld { display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .fld-row { display: flex; gap: 10px; }
  .lbl { font-size: 11.5px; font-weight: 500; color: var(--tx); display: flex; align-items: baseline; gap: 6px; }
  .hint { font-size: 10px; color: var(--tx3); font-weight: 400; }
  .inp { padding: 7px 10px; border-radius: var(--r-md); background: var(--l1); border: 1px solid var(--bd); color: var(--tx); font-size: 12.5px; outline: none; font-family: inherit; width: 100%; transition: border-color var(--duration-fast) var(--ease); }
  .inp:focus { border-color: var(--ac); }

  .pmd-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 18px 16px; }
  .btn { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 14px; border-radius: var(--r-md); font-size: 12px; font-weight: 600; border: 1px solid var(--bd2); color: var(--tx2); background: transparent; cursor: pointer; transition: all var(--duration-fast) var(--ease); }
  .btn:hover:not(:disabled) { color: var(--tx); border-color: var(--tx3); }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn.pri { background: var(--ac); border-color: transparent; color: #fff; }
  .btn.pri:hover:not(:disabled) { background: var(--ac-h); color: #fff; }
</style>
