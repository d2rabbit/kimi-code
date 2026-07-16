<!-- FilePreview.svelte — right-side file preview / diff panel.
     Shows file content or git diff when the user clicks a file path
     in a tool call result or conversation. -->
<script lang="ts">
  import * as client from '../../stores/client.svelte';
  import MarkdownRenderer from './MarkdownRenderer.svelte';
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';

  // Determine language from file extension for basic syntax hint.
  function detectLang(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
      vue: 'vue', svelte: 'svelte', py: 'python', rs: 'rust',
      go: 'go', java: 'java', c: 'c', cpp: 'cpp', h: 'c',
      json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
      md: 'markdown', html: 'html', css: 'css', scss: 'scss',
      sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash',
      xml: 'xml', svg: 'xml',
    };
    return map[ext] ?? 'text';
  }

  // Render diff content with colored lines.
  function renderDiff(diff: string): { kind: 'add' | 'del' | 'meta' | 'ctx'; text: string }[] {
    return diff.split('\n').map((line) => {
      if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) {
        return { kind: 'meta' as const, text: line };
      }
      if (line.startsWith('+')) return { kind: 'add' as const, text: line };
      if (line.startsWith('-')) return { kind: 'del' as const, text: line };
      return { kind: 'ctx' as const, text: line };
    });
  }

  // Check if file is markdown.
  function isMarkdown(path: string): boolean {
    return path.endsWith('.md') || path.endsWith('.markdown');
  }

  const diffLines = $derived(
    client.previewDiff() ? renderDiff(client.previewDiff() ?? '') : [],
  );
</script>

<div class="file-preview">
  <!-- Header -->
  <header class="fp-header">
    <div class="fp-title-wrap">
      <Icon name="file-text" size="sm" />
      <span class="fp-path" title={client.previewPath() ?? ''}>{client.previewPath() ?? ''}</span>
    </div>
    <div class="fp-actions">
      {#if client.previewMode() === 'file' && client.previewPath()}
        <IconButton
          name="git-pull-request"
          label="查看 diff"
          size="sm"
          onclick={() => client.previewPath() && client.client.openFilePreview(client.previewPath()!, 'diff')}
        />
      {:else if client.previewMode() === 'diff' && client.previewPath()}
        <IconButton
          name="file-text"
          label="查看文件"
          size="sm"
          onclick={() => client.previewPath() && client.client.openFilePreview(client.previewPath()!, 'file')}
        />
      {/if}
      <IconButton name="close" label="关闭" size="sm" onclick={() => client.client.closeFilePreview()} />
    </div>
  </header>

  <!-- Body -->
  <div class="fp-body">
    {#if client.previewLoading()}
      <div class="fp-loading">
        <div class="spinner"></div>
        <p>加载中…</p>
      </div>
    {:else if client.previewError()}
      <div class="fp-error">
        <Icon name="alert-triangle" size="md" />
        <p>{client.previewError()}</p>
      </div>
    {:else if client.previewMode() === 'diff' && diffLines.length > 0}
      <!-- Diff view -->
      <pre class="diff-view">
        {#each diffLines as line, i (i)}
          <div class="diff-line diff-{line.kind}">
            <span class="diff-content">{line.text}</span>
          </div>
        {/each}
      </pre>
    {:else if client.previewContent() !== null && client.previewPath()}
      {#if isMarkdown(client.previewPath() ?? '')}
        <!-- Markdown render -->
        <div class="fp-markdown">
          <MarkdownRenderer text={client.previewContent() ?? ''} />
        </div>
      {:else}
        <!-- Code view -->
        <pre class="code-view" data-lang={detectLang(client.previewPath() ?? "")}><code>{client.previewContent() ?? ""}</code></pre>
      {/if}
    {:else}
      <div class="fp-empty">
        <Icon name="file" size="lg" />
        <p>选择文件查看预览</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .file-preview {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .fp-header {
    flex: none;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px 0 14px;
    border-bottom: 1px solid var(--color-line, rgba(84,84,88,0.65));
  }
  .fp-title-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    flex: 1;
    min-width: 0;
  }
  .fp-path {
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs, 12px);
    color: var(--color-text-muted, rgba(235,235,245,0.6));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fp-actions {
    display: flex;
    gap: 2px;
    flex: none;
  }

  .fp-body {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }

  .fp-loading, .fp-error, .fp-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    color: var(--color-text-muted, rgba(235,235,245,0.6));
  }
  .fp-error { color: var(--color-danger, #ff453a); }
  .spinner {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--color-line, rgba(84,84,88,0.65));
    border-top-color: var(--color-accent, #2dd4bf);
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Code view */
  .code-view {
    margin: 0;
    padding: 14px;
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    line-height: 1.5;
    color: var(--color-text, rgba(255,255,255,0.92));
    white-space: pre;
    overflow-x: auto;
    tab-size: 2;
  }

  /* Markdown view */
  .fp-markdown {
    padding: 14px;
  }

  /* Diff view */
  .diff-view {
    margin: 0;
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    line-height: 1.6;
  }
  .diff-line {
    padding: 0 14px;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .diff-add {
    background: var(--color-success-soft, rgba(78,201,176,0.08));
    color: var(--color-success, #30d158);
  }
  .diff-del {
    background: var(--color-danger-soft, rgba(255,107,107,0.08));
    color: var(--color-danger, #ff453a);
  }
  .diff-meta {
    color: var(--color-accent, #2dd4bf);
    font-weight: var(--weight-medium, 500);
  }
  .diff-ctx {
    color: var(--color-text-muted, rgba(235,235,245,0.6));
  }
</style>
