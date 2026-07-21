<!-- DiffDrawer.svelte — second-level right drawer for working-directory diffs.

  Slides out from the right edge of the workspace view when the user clicks
  a file in the "工作区改动" section of RightPanel. Shows the full unified
  diff with add/del/meta line coloring, a copy button, and a header with the
  file path. Closes on Esc, mask click, or the ✕ button.

  Only used for working-directory (uncommitted) diffs — commit-history diffs
  stay inline in RightPanel.
-->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import { getKimiWebApi } from '../../api';
  import { activeSessionId } from '../../stores/client.svelte';
  import { toast } from '../../stores/toast.svelte';

  let {
    open = $bindable(false),
    filePath = $bindable(''),
  }: {
    open?: boolean;
    filePath?: string;
  } = $props();

  let diff = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Re-fetch whenever the target file changes (and we're open).
  $effect(() => {
    if (!open || !filePath) {
      diff = '';
      error = null;
      return;
    }
    const path = filePath;
    const sid = activeSessionId();
    if (!sid) return;
    loading = true;
    diff = '';
    error = null;
    getKimiWebApi()
      .getFileDiff(sid, path)
      .then((r) => {
        diff = r.diff;
      })
      .catch((e) => {
        error = e instanceof Error ? e.message : String(e);
      })
      .finally(() => {
        loading = false;
      });
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      open = false;
    }
  }

  type DiffLine = { kind: 'add' | 'del' | 'meta' | 'ctx'; text: string };
  function parseDiff(src: string): DiffLine[] {
    return src.split('\n').map((line) => {
      if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) {
        return { kind: 'meta', text: line };
      }
      if (line.startsWith('+')) return { kind: 'add', text: line };
      if (line.startsWith('-')) return { kind: 'del', text: line };
      return { kind: 'ctx', text: line };
    });
  }

  async function copyDiff() {
    try {
      await navigator.clipboard.writeText(diff);
      toast.ok('diff 已复制');
    } catch {
      toast.err('复制失败');
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if open && filePath}
  <div class="diff-drawer" role="dialog" aria-modal="false" aria-label="工作区改动 diff">
    <header class="dd-head">
      <div class="dd-title-wrap">
        <Icon name="file-text" size="sm" />
        <span class="dd-path" title={filePath}>{filePath}</span>
      </div>
      <div class="dd-actions">
        <button class="dd-btn" type="button" onclick={copyDiff} title="复制 diff" disabled={!diff}>
          <Icon name="copy" size="sm" />
        </button>
        <button class="dd-btn" type="button" onclick={() => { open = false; }} aria-label="关闭">
          <Icon name="close" size="sm" />
        </button>
      </div>
    </header>
    <div class="dd-body">
      {#if loading}
        <div class="dd-loading">加载 diff…</div>
      {:else if error}
        <div class="dd-error">加载失败：{error}</div>
      {:else if !diff}
        <div class="dd-empty">无 diff 内容</div>
      {:else}
        <pre class="dd-pre">{#each parseDiff(diff) as line}<div class="dd-line" data-kind={line.kind}>{line.text || ' '}</div>{/each}</pre>
      {/if}
    </div>
  </div>
{/if}

<style>
  .diff-drawer {
    position: absolute;
    top: 0; right: 0; bottom: 0;
    width: 540px;
    max-width: 60vw;
    background: var(--l1);
    border-left: 1px solid var(--bd2);
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    z-index: 50;
    animation: dd-slide-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes dd-slide-in {
    from { transform: translateX(40px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  .dd-head {
    flex: none;
    display: flex; align-items: center; gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--bd);
    background: var(--l2);
  }
  .dd-title-wrap {
    display: flex; align-items: center; gap: 8px;
    flex: 1; min-width: 0;
    color: var(--tx); font-size: 12.5px; font-weight: 600;
  }
  .dd-path {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-family: var(--font-mono, monospace);
  }
  .dd-actions { display: flex; gap: 4px; }
  .dd-btn {
    border: none; background: transparent; color: var(--tx3);
    padding: 5px 8px; border-radius: 6px; cursor: pointer;
    display: inline-flex; align-items: center;
  }
  .dd-btn:hover:not(:disabled) { background: var(--ac-soft); color: var(--ac); }
  .dd-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .dd-body { flex: 1; overflow: auto; }
  .dd-pre {
    margin: 0; padding: 8px 0;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11.5px; line-height: 1.55;
    color: var(--tx);
    white-space: pre; overflow-x: auto;
  }
  .dd-line { padding: 0 14px; }
  .dd-line[data-kind="add"]  { background: var(--ok-soft); color: var(--ok); }
  .dd-line[data-kind="del"]  { background: var(--err-soft); color: var(--err); }
  .dd-line[data-kind="meta"] { color: var(--ac); font-weight: 600; }

  .dd-loading, .dd-empty, .dd-error {
    padding: 32px 20px;
    color: var(--tx3); font-size: 13px; text-align: center;
  }
  .dd-error { color: var(--err); }
</style>
