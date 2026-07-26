<!-- ThinkCard.svelte — 思考链卡片（参考原型第 2 卡：琥珀/brain/折叠/耗时）。 -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';

  let {
    thinking,
    streaming = false,
    durationMs,
  }: {
    thinking: string;
    streaming?: boolean;
    durationMs?: number;
  } = $props();

  let open = $state(false);

  // 流式时默认展开看实时思考；结束后默认收起。
  $effect(() => {
    if (streaming) open = true;
  });

  const durText = $derived.by(() => {
    if (!durationMs) return null;
    const s = durationMs / 1000;
    return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
  });
</script>

<div class="think-card">
  <div class="tc-avatar"><Icon name="sparkles" size="sm" /></div>
  <div class="tc-card">
    <button class="tc-head" onclick={() => open = !open} type="button">
      <span class="tc-brain">🧠</span>
      <span class="tc-title">{streaming ? '思考链分析中…' : '思考过程'}</span>
      <span class="tc-meta">
        {#if durText}<span class="tc-dur">耗时 {durText}</span>{/if}
        {#if streaming}<span class="tc-live">●</span>{/if}
        <span class="tc-chevron">{open ? '▾' : '▸'}</span>
      </span>
    </button>
    {#if open}
      <div class="tc-body">{thinking}</div>
    {/if}
  </div>
</div>

<style>
  .think-card {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin: 6px 0;
  }
  .tc-avatar {
    width: 30px; height: 30px;
    flex: none;
    display: flex; align-items: center; justify-content: center;
    border-radius: var(--g-radius-control, 8px);
    background: var(--warn-soft);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) color-mix(in srgb, var(--warn) 35%, transparent);
    color: var(--warn);
  }
  .tc-card {
    flex: 1;
    min-width: 0;
    max-width: 640px;
    border-radius: var(--g-radius-card, 4px);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) color-mix(in srgb, var(--warn) 30%, transparent);
    background: var(--mat-surface-2, var(--l2));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    box-shadow: var(--elev-card, none);
    overflow: hidden;
  }
  .tc-head {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--warn);
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
  }
  .tc-head:hover { background: var(--color-hover); }
  .tc-brain { font-size: 11px; }
  .tc-title { flex: 1; min-width: 0; }
  .tc-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
    color: var(--tx3);
    font-size: 10.5px;
  }
  .tc-live { color: var(--warn); font-size: 8px; animation: think-live 1.2s ease-in-out infinite; }
  @keyframes think-live { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  @media (prefers-reduced-motion: reduce) { .tc-live { animation: none; } }
  .tc-body {
    padding: 8px 12px 10px;
    border-top: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    color: var(--tx3);
    font-size: 11px;
    line-height: 1.65;
    font-style: italic;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 260px;
    overflow-y: auto;
  }
</style>
