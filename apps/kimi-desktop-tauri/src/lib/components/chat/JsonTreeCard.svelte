<!-- JsonTreeCard.svelte — JSON 可视化卡片（参考原型第 7 卡）。
     头部：文件图标 + 标签 + 键数徽章 + 树状/Raw 切换 + 复制。
     树状视图：虚线层级引导线 + 可折叠嵌套节点（收起时显示 N items 徽章）。
     着色走每主题的 --syn-* 语法 token（key=f / string=s / number=n / bool=k）。 -->
<script lang="ts">
  import { untrack } from 'svelte';
  import Icon from '../ui/Icon.svelte';
  import { toast } from '../../stores/toast.svelte';

  let {
    data,
    label = 'output.json',
    defaultView = 'tree' as 'tree' | 'raw',
  }: {
    data: unknown;
    label?: string;
    defaultView?: 'tree' | 'raw';
  } = $props();

  let view = $state<'tree' | 'raw'>(untrack(() => defaultView));
  let collapsed = $state<Record<string, boolean>>({});

  const pretty = $derived.by(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  });

  const keyCount = $derived.by(() => {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return Object.keys(data as Record<string, unknown>).length;
    }
    if (Array.isArray(data)) return data.length;
    return 0;
  });

  function copy() {
    void navigator.clipboard.writeText(pretty).then(() => toast.ok('JSON 已复制'));
  }

  function toggleNode(path: string) {
    collapsed[path] = !(collapsed[path] ?? false);
    collapsed = { ...collapsed };
  }

  type Leaf = { kind: 'string' | 'number' | 'boolean' | 'null'; text: string };
  function leaf(v: unknown): Leaf {
    if (v === null) return { kind: 'null', text: 'null' };
    switch (typeof v) {
      case 'string': return { kind: 'string', text: `"${v}"` };
      case 'number': return { kind: 'number', text: String(v) };
      case 'boolean': return { kind: 'boolean', text: String(v) };
      default: return { kind: 'null', text: String(v) };
    }
  }
</script>

<div class="jtc">
  <div class="jtc-head">
    <Icon name="file-text" size="sm" />
    <span class="jtc-label mono">{label}</span>
    <span class="jtc-badge mono">JSON • {keyCount} {Array.isArray(data) ? 'items' : 'keys'}</span>
    <span class="jtc-spacer"></span>
    <div class="jtc-toggle">
      <button class="jtc-mode" class:on={view === 'tree'} onclick={() => view = 'tree'} type="button">树状图</button>
      <button class="jtc-mode" class:on={view === 'raw'} onclick={() => view = 'raw'} type="button">Raw 源码</button>
    </div>
    <button class="jtc-copy" onclick={copy} type="button" title="复制 JSON">
      <Icon name="copy" size="sm" />
    </button>
  </div>

  <div class="jtc-body mono">
    {#if view === 'raw'}
      <pre class="jtc-raw">{pretty}</pre>
    {:else}
      {@render node(data, '', true)}
    {/if}
  </div>
</div>

{#snippet node(value: unknown, path: string, root: boolean)}
  {#if value !== null && typeof value === 'object'}
    {@const isArr = Array.isArray(value)}
    {@const entries = isArr ? (value as unknown[]).map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, unknown>)}
    <div class="jn" class:jn-root={root}>
      {#if root}
        <div class="jn-brace">{isArr ? '[' : '{'}</div>
      {:else}
        <button class="jn-head" onclick={() => toggleNode(path)} type="button">
          <span class="jn-caret">{collapsed[path] ? '▸' : '▾'}</span>
          <span class="jn-brace">{isArr ? '[' : '{'}</span>
          {#if collapsed[path]}
            <span class="jn-count">{entries.length} items</span>
            <span class="jn-brace">{isArr ? ']' : '}'}</span>
          {/if}
        </button>
      {/if}
      {#if root || !collapsed[path]}
        <div class="jn-kids" class:jn-root-kids={root}>
          {#each entries as [k, v] (path ? `${path}.${k}` : k)}
            {@const childPath = path ? `${path}.${k}` : k}
            <div class="jn-row">
              {#if !isArr}<span class="jk">{JSON.stringify(k)}</span><span class="jp">:</span>{/if}
              {#if v !== null && typeof v === 'object'}
                {@render node(v, childPath, false)}
              {:else}
                {@const l = leaf(v)}
                <span class="jv jv-{l.kind}">{l.text}</span>
              {/if}
            </div>
          {/each}
        </div>
        <div class="jn-close" class:jn-root-close={root}>{isArr ? ']' : '}'}</div>
      {/if}
    </div>
  {:else}
    {@const l = leaf(value)}
    <span class="jv jv-{l.kind}">{l.text}</span>
  {/if}
{/snippet}

<style>
  .jtc {
    border-radius: var(--g-radius-card, 4px);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    background: var(--mat-surface-1, var(--l1));
    overflow: hidden;
  }
  .jtc-head {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 12px;
    background: var(--mat-surface-2, var(--l2));
    border-bottom: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    color: var(--tx2);
    font-size: 11px;
  }
  .jtc-label { font-weight: 600; color: var(--tx); }
  .jtc-badge {
    font-size: 9.5px;
    padding: 1px 8px;
    border-radius: var(--g-radius-chip, 999px);
    background: var(--ac-soft);
    color: var(--ac);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--ac-bd);
  }
  .jtc-spacer { flex: 1; }
  .jtc-toggle {
    display: flex;
    padding: 2px;
    border-radius: var(--g-radius-control, 4px);
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    background: var(--mat-surface-1, var(--l1));
  }
  .jtc-mode {
    border: none;
    background: transparent;
    color: var(--tx3);
    font-size: 10px;
    padding: 2px 8px;
    border-radius: calc(var(--g-radius-control, 4px) - 2px);
    cursor: pointer;
  }
  .jtc-mode.on {
    background: var(--mat-primary-bg, var(--ac));
    color: var(--color-text-on-accent, #fff);
  }
  .jtc-copy {
    border: none;
    background: transparent;
    color: var(--tx3);
    cursor: pointer;
    display: inline-flex;
    padding: 2px;
    border-radius: var(--g-radius-control, 4px);
  }
  .jtc-copy:hover { color: var(--tx); background: var(--color-hover); }

  .jtc-body {
    padding: 10px 12px;
    max-height: 320px;
    overflow: auto;
    font-size: 11px;
    line-height: 1.7;
  }
  .jtc-raw {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--tx2);
  }

  /* 树状视图 */
  .jn-kids {
    border-left: 1px dashed color-mix(in srgb, var(--tx3) 25%, transparent);
    margin-left: 8px;
    padding-left: 12px;
  }
  .jn-kids.jn-root-kids {
    border-left: none;
    margin-left: 0;
    padding-left: 0;
  }
  .jn-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
    padding: 1px 4px;
    border-radius: 4px;
    min-width: 0;
  }
  .jn-row:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.04));
  }
  .jn-head {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: none;
    background: transparent;
    color: var(--tx3);
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    padding: 1px 4px;
    border-radius: 4px;
  }
  .jn-head:hover { background: var(--color-hover); color: var(--tx); }
  .jn-caret { font-size: 9px; width: 10px; }
  .jn-brace { color: var(--tx3); }
  .jn-count {
    font-size: 9px;
    padding: 0 6px;
    border-radius: var(--g-radius-chip, 999px);
    background: var(--mat-chip-bg, var(--l2));
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    color: var(--tx3);
  }
  .jn-close { color: var(--tx3); padding-left: 18px; }
  .jn-close.jn-root-close { padding-left: 0; }
  .jk { color: var(--syn-f, var(--ac)); }
  .jp { color: var(--tx3); }
  .jv-string { color: var(--syn-s, var(--ok)); }
  .jv-number { color: var(--syn-n, var(--warn)); }
  .jv-boolean { color: var(--syn-k, var(--amb)); font-weight: 600; }
  .jv-null { color: var(--tx3); font-style: italic; }
  .mono { font-family: var(--font-mono, monospace); }
</style>
