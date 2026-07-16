<!-- MarkdownRenderer.svelte — markdown rendering with code highlighting.
     Uses marked (parser) + DOMPurify (XSS cleanup) + shiki (syntax highlight).
     Streaming support: when streaming=true, we skip shiki (which is async)
     and render plain text code blocks for zero-latency incremental display.
     When streaming=false, we highlight with shiki for the final render. -->
<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { createHighlighter } from 'shiki';

  let {
    text = '',
    streaming = false,
  }: {
    text?: string;
    streaming?: boolean;
  } = $props();

  // Shiki highlighter singleton (loaded once).
  let highlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null;
  

  const COMMON_LANGS = [
    'javascript', 'typescript', 'bash', 'shell', 'json', 'yaml', 'python',
    'rust', 'go', 'java', 'c', 'cpp', 'html', 'css', 'sql', 'diff',
    'markdown', 'tsx', 'jsx', 'vue', 'svelte', 'toml', 'xml',
  ];

  // Init shiki lazily (only when not streaming — streaming uses plain text).
  async function ensureShiki() {
    if (highlighter) return highlighter;
    highlighter = await createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: COMMON_LANGS,
    });
    
    return highlighter;
  }

  // Configure marked.
  marked.setOptions({
    gfm: true,
    breaks: false,
  });

  // Custom code renderer: during streaming, render plain <pre><code>;
  // after streaming ends, use shiki for highlighting.
  const renderer = {
    code({ text: code, lang }: { text: string; lang?: string }) {
      const language = (lang || '').trim().toLowerCase() || 'text';
      const escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      if (language === 'diff') {
        return renderDiff(code);
      }
      const cls = `language-${language}`;
      return `<pre class="code-block ${cls}"><code class="${cls}">${escaped}</code></pre>`;
    },
  };

  marked.use({ renderer });

  function renderDiff(text: string): string {
    const lines = text.split('\n');
    const html = lines.map((line) => {
      if (line.startsWith('+++') || line.startsWith('@@')) {
        return `<span class="diff-meta">${escapeHtml(line)}</span>`;
      }
      if (line.startsWith('+')) {
        return `<span class="diff-add">${escapeHtml(line)}</span>`;
      }
      if (line.startsWith('-')) {
        return `<span class="diff-del">${escapeHtml(line)}</span>`;
      }
      return `<span>${escapeHtml(line)}</span>`;
    }).join('\n');
    return `<pre class="code-block diff-block">${html}</pre>`;
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Render markdown to sanitized HTML.
  let html = $derived.by(() => {
    if (!text) return '';
    const raw = marked.parse(text, { async: false }) as string;
    return DOMPurify.sanitize(raw, {
      ADD_ATTR: ['target', 'data-line'],
    });
  });

  // After streaming ends, highlight code blocks with shiki.
  let highlightedHtml = $state('');

  $effect(() => {
    if (streaming || !text) {
      highlightedHtml = '';
      return;
    }
    let cancelled = false;
    void (async () => {
      const h = await ensureShiki();
      if (cancelled || !h) return;
      // Re-parse with shiki code renderer.
      const codeRegex = /<pre class="code-block(?:[^"]*)"><code class="language-([^"]+)">([\s\S]*?)<\/code><\/pre>/g;
      let result = html;
      const matches = [...result.matchAll(codeRegex)];
      for (const m of matches) {
        const lang = m[1];
        const codeText = m[2]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');
        if (lang === 'text' || !COMMON_LANGS.includes(lang)) continue;
        try {
          const highlighted = h.codeToHtml(codeText, {
            lang,
            theme: document.documentElement.dataset.colorScheme === 'dark' ? 'github-dark' : 'github-light',
          });
          result = result.replace(m[0], highlighted);
        } catch {
          // Unsupported lang — keep plain text.
        }
      }
      if (!cancelled) highlightedHtml = result;
    })();
    return () => { cancelled = true; };
  });

  // Use highlighted version when available, plain during streaming.
  const displayHtml = $derived(highlightedHtml || html);

  // Detect dark mode for re-highlighting on theme change.
  $effect(() => {
    // Re-render when color-scheme changes.
    const observer = new MutationObserver(() => {
      highlightedHtml = '';
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-color-scheme'],
    });
    return () => observer.disconnect();
  });
</script>

<div class="md-body">
  {#if streaming && text}
    {@html displayHtml}<span class="md-cursor"></span>
  {:else}
    {@html displayHtml}
  {/if}
</div>

<style>
  :global(.md-body) {
    font-size: var(--ui-font-size, var(--text-base, 14px));
    line-height: var(--leading-normal, 1.6);
    color: var(--color-text, rgba(255,255,255,0.92));
    word-break: break-word;
  }
  :global(.md-body p) {
    margin: 0 0 12px;
  }
  :global(.md-body p:last-child) {
    margin-bottom: 0;
  }
  :global(.md-body h1),
  :global(.md-body h2),
  :global(.md-body h3) {
    margin: 20px 0 8px;
    font-weight: var(--weight-medium, 500);
    line-height: 1.3;
  }
  :global(.md-body h1) { font-size: 1.4em; }
  :global(.md-body h2) { font-size: 1.25em; }
  :global(.md-body h3) { font-size: 1.1em; }
  :global(.md-body ul),
  :global(.md-body ol) {
    margin: 0 0 12px;
    padding-left: 24px;
  }
  :global(.md-body li) {
    margin: 3px 0;
  }
  :global(.md-body code) {
    font-family: var(--font-mono, monospace);
    font-size: 0.9em;
    background: var(--color-surface-raised, rgba(128,128,128,0.15));
    padding: 1px 5px;
    border-radius: var(--radius-xs, 4px);
  }
  :global(.md-body a) {
    color: var(--color-accent, #2dd4bf);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  :global(.md-body blockquote) {
    margin: 0 0 12px;
    padding-left: 12px;
    border-left: 3px solid var(--color-line-strong, rgba(84,84,88,0.4));
    color: var(--color-text-muted, rgba(235,235,245,0.6));
  }
  :global(.md-body table) {
    border-collapse: collapse;
    margin: 0 0 12px;
    font-size: 0.9em;
  }
  :global(.md-body th),
  :global(.md-body td) {
    border: 1px solid var(--color-line, rgba(84,84,88,0.65));
    padding: 6px 10px;
    text-align: left;
  }
  :global(.md-body hr) {
    border: none;
    border-top: 1px solid var(--color-line, rgba(84,84,88,0.65));
    margin: 16px 0;
  }

  /* Code blocks */
  :global(.md-body .code-block) {
    margin: 0 0 12px;
    padding: 12px 14px;
    border-radius: var(--radius-md, 8px);
    background: var(--color-surface-raised, rgba(28,28,30,0.72));
    border: 1px solid var(--color-line, rgba(84,84,88,0.65));
    overflow-x: auto;
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    line-height: 1.5;
  }
  :global(.md-body .code-block code) {
    background: none;
    padding: 0;
    font-size: inherit;
  }
  /* Shiki output overrides our bg — let it through */
  :global(.md-body pre.shiki) {
    margin: 0 0 12px;
    padding: 12px 14px;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--color-line, rgba(84,84,88,0.65));
    overflow-x: auto;
    font-size: 13px;
    line-height: 1.5;
  }

  /* Diff blocks */
  :global(.md-body .diff-block) {
    white-space: pre;
  }
  :global(.md-body .diff-add) {
    color: var(--color-success, #30d158);
    background: var(--color-success-soft, rgba(78,201,176,0.08));
    display: block;
  }
  :global(.md-body .diff-del) {
    color: var(--color-danger, #ff453a);
    background: var(--color-danger-soft, rgba(255,107,107,0.08));
    display: block;
  }
  :global(.md-body .diff-meta) {
    color: var(--color-accent, #2dd4bf);
    display: block;
  }

  /* Streaming cursor */
  .md-cursor {
    display: inline-block;
    width: 2px;
    height: 1.1em;
    background: var(--color-accent, #2dd4bf);
    animation: blink 1s steps(2) infinite;
    vertical-align: text-bottom;
    margin-left: 1px;
  }
  @keyframes blink {
    50% { opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .md-cursor { animation: none; }
  }
</style>
