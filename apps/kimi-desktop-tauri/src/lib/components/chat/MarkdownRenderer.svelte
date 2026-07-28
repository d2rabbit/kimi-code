<!-- MarkdownRenderer.svelte — markdown rendering with code highlighting.
     Uses marked (parser) + DOMPurify (XSS cleanup) + shiki (syntax highlight).
     Streaming support: when streaming=true, we skip shiki (which is async)
     and render plain text code blocks for zero-latency incremental display.
     When streaming=false, we highlight with shiki for the final render. -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  let {
    text = '',
    streaming = false,
  }: {
    text?: string;
    streaming?: boolean;
  } = $props();

  // 流式解析节流：marked.parse + DOMPurify 是全文 O(n) 操作，逐 token 全量
  // 重算会让单轮成本变成 O(n²) 并挤占主线程。流式期间按 ~120ms 节流刷新
  // 解析源；流式结束立即对齐最终文本，保证终稿精确。
  // svelte-ignore state_referenced_locally
  let parseText = $state(text);
  let parseTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (!streaming) {
      if (parseTimer !== undefined) { clearTimeout(parseTimer); parseTimer = undefined; }
      parseText = text;
      return;
    }
    if (parseTimer === undefined) {
      parseTimer = setTimeout(() => { parseTimer = undefined; parseText = text; }, 120);
    }
  });
  onDestroy(() => { if (parseTimer !== undefined) clearTimeout(parseTimer); });

  // Shiki highlighter singleton (loaded once).
  import type { Highlighter } from 'shiki';
  let highlighter: Highlighter | null = null;
  

  const COMMON_LANGS = [
    'javascript', 'typescript', 'bash', 'shell', 'json', 'yaml', 'python',
    'rust', 'go', 'java', 'c', 'cpp', 'html', 'css', 'sql', 'diff',
    'markdown', 'tsx', 'jsx', 'vue', 'svelte', 'toml', 'xml',
  ];

  // Init shiki lazily (only when not streaming — streaming uses plain text).
  async function ensureShiki() {
    if (highlighter) return highlighter;
    // Dynamic import: shiki (~1.5MB) is code-split and fetched only when the
    // first code block actually needs highlighting — never on app boot.
    const { createHighlighter } = await import('shiki');
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
  // For JSON / HTML we add interactive affordances after render (post-HTML
  // processing) — the renderer just emits the right class hooks.
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
      // Header bar: language label + copy button.
      const head = `<div class="cb-head"><span class="cb-lang">${language}</span><button class="cb-copy" type="button" data-copy>⧉ 复制</button></div>`;
      // For HTML blocks, emit an extra "预览" toggle button (handled in
      // post-processing — see enhanceHtmlBlocks).
      const previewBtn = language === 'html'
        ? `<button class="cb-preview" type="button" data-preview>👁 预览</button>`
        : '';
      const headWithPreview = language === 'html'
        ? `<div class="cb-head"><span class="cb-lang">${language}</span><span class="cb-head-actions">${previewBtn}<button class="cb-copy" type="button" data-copy>⧉ 复制</button></span></div>`
        : head;
      // Stash the raw code as a data attribute so post-processing can pick
      // it up (JSON tree fold / HTML preview) without re-parsing.
      const rawData = encodeURIComponent(code);
      const extraData = language === 'json' ? ` data-json="${rawData}"` : (language === 'html' ? ` data-html="${rawData}"` : '');
      return `<div class="cb-wrap cb-${language}"${extraData}>${headWithPreview}<pre class="code-block ${cls}"><code class="${cls}">${escaped}</code></pre></div>`;
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
    if (!parseText) return '';
    const raw = marked.parse(parseText, { async: false }) as string;
    return DOMPurify.sanitize(raw, {
      ADD_ATTR: ['target', 'data-line', 'data-copy'],
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
            theme: ['dark', 'glass', 'neon'].includes(document.documentElement.dataset.colorScheme ?? '') ? 'github-dark' : 'github-light',
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

  // Copy button delegation (DOMPurify strips inline handlers).
  function onBodyClick(e: MouseEvent) {
    const btn = (e.target as HTMLElement).closest?.('[data-copy]') as HTMLElement | null;
    if (!btn) return;
    const wrap = btn.closest('.cb-wrap');
    const code = wrap?.querySelector('code');
    if (!code) return;
    void navigator.clipboard.writeText(code.innerText).then(() => {
      btn.textContent = '已复制 ✓';
      setTimeout(() => { btn.textContent = '⧉ 复制'; }, 1200);
    });
  }

  // Preview toggle for HTML blocks — injects/removes a sandboxed iframe
  // under the code block so the user can see what the snippet renders as.
  function onBodyPreviewClick(e: MouseEvent) {
    const btn = (e.target as HTMLElement).closest?.('[data-preview]') as HTMLElement | null;
    if (!btn) return;
    const wrap = btn.closest('.cb-wrap') as HTMLElement | null;
    if (!wrap) return;
    const existing = wrap.querySelector('.cb-preview-frame');
    if (existing) {
      // Toggle off.
      existing.remove();
      btn.textContent = '👁 预览';
      return;
    }
    const raw = wrap.getAttribute('data-html');
    if (!raw) return;
    const htmlContent = decodeURIComponent(raw);
    const frame = document.createElement('iframe');
    frame.className = 'cb-preview-frame';
    frame.sandbox = 'allow-same-origin'; // No scripts — defensive.
    frame.srcdoc = htmlContent;
    wrap.appendChild(frame);
    btn.textContent = '✕ 关闭预览';
  }

  // Unified click handler — dispatches by which data-* attribute the click
  // target carries.
  function onBodyAnyClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest?.('[data-copy]')) { onBodyClick(e); return; }
    if (target.closest?.('[data-preview]')) { onBodyPreviewClick(e); return; }
    // Fold/unfold for JSON tree nodes.
    const fold = target.closest?.('[data-fold]') as HTMLElement | null;
    if (fold) {
      const parent = fold.parentElement;
      if (!parent) return;
      parent.classList.toggle('folded');
      e.preventDefault();
    }
  }

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

  // Post-process: convert data-json blocks into collapsible JSON trees.
  // Rendered after the raw HTML is in the DOM (so we can attach via Svelte
  // action on the container). For large JSON we keep the plain code view
  // (tree rendering becomes sluggish past ~5K nodes).
  const MAX_JSON_TREE_NODES = 5000;

  function renderJsonTree(value: unknown, depth = 0): string {
    if (depth > 32) return '<span class="jt-ellipsis">…</span>';
    if (value === null) return '<span class="jt-null">null</span>';
    if (typeof value === 'boolean') return `<span class="jt-bool">${value}</span>`;
    if (typeof value === 'number') return `<span class="jt-num">${value}</span>`;
    if (typeof value === 'string') return `<span class="jt-str">"${escapeHtml(value)}"</span>`;
    const entries = Array.isArray(value)
      ? value.map((v, i) => [i, v] as const)
      : Object.entries(value as Record<string, unknown>);
    const open = depth < 1 ? '' : ' folded';
    const bracket = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
    if (entries.length === 0) return `<span class="jt-brkt">${bracket[0]}${bracket[1]}</span>`;
    const inner = entries.map(([k, v], idx) => {
      const comma = idx < entries.length - 1 ? ',' : '';
      const keyStr = Array.isArray(value)
        ? `<span class="jt-idx">${k}</span>`
        : `<span class="jt-key">"${escapeHtml(String(k))}"</span>:`;
      // Recursively render children; objects/arrays get a fold caret.
      if (v && typeof v === 'object') {
        return `<div class="jt-row jt-obj${open}"><span class="jt-fold" data-fold>▾</span>${keyStr} <span class="jt-val">${renderJsonTree(v, depth + 1)}</span>${comma}</div>`;
      }
      return `<div class="jt-row jt-leaf"><span class="jt-fold jt-fold-empty">·</span>${keyStr} <span class="jt-val">${renderJsonTree(v, depth + 1)}</span>${comma}</div>`;
    }).join('');
    return `<span class="jt-brkt">${bracket[0]}</span><div class="jt-children">${inner}</div><span class="jt-brkt">${bracket[1]}</span>`;
  }

  let jsonEnhancedHtml = $state('');

  $effect(() => {
    const src = displayHtml;
    if (!src || streaming) {
      jsonEnhancedHtml = '';
      return;
    }
    // Quick exit if no JSON blocks to enhance.
    if (!src.includes('data-json=')) {
      jsonEnhancedHtml = '';
      return;
    }
    // Rewrite each data-json block: render the JSON tree into a div, and
    // keep the original <pre> as a fallback "raw" toggle.
    const result = src.replace(
      /<div class="cb-wrap cb-json" data-json="([^"]*)">([\s\S]*?)<\/div>/g,
      (_m, encoded: string, inner: string) => {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(decodeURIComponent(encoded));
        } catch {
          // Bad JSON — leave the original code block alone.
          return `<div class="cb-wrap cb-json">${inner}</div>`;
        }
        // Size guard — tree rendering is O(n) but the DOM gets heavy fast.
        const nodeCount = JSON.stringify(parsed).length;
        if (nodeCount > MAX_JSON_TREE_NODES) {
          return `<div class="cb-wrap cb-json">${inner}</div>`;
        }
        const tree = `<div class="jt-root">${renderJsonTree(parsed)}</div>`;
        return `<div class="cb-wrap cb-json">${inner}<div class="cb-tree-wrap" data-tree>${tree}</div></div>`;
      },
    );
    jsonEnhancedHtml = result;
  });

  const finalHtml = $derived(jsonEnhancedHtml || displayHtml);
</script>

<div class="md-body" onclick={onBodyAnyClick} role="presentation">
  {#if streaming && text}
    {@html finalHtml}<span class="md-cursor"></span>
  {:else}
    {@html finalHtml}
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
    font-family: var(--font-mono);
    font-size: 0.88em;
    background: var(--l3);
    border: 1px solid var(--bd);
    color: var(--ac-h);
    padding: 1px 5px;
    border-radius: 5px;
  }
  :global(.md-body a) {
    color: var(--ac);
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

  /* Code blocks (with header bar) */
  :global(.md-body .cb-wrap) {
    margin: 0 0 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--bd);
    background: var(--l1);
    overflow: hidden;
  }
  :global(.md-body .cb-head) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 10px;
    border-bottom: 1px solid var(--bd);
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--tx3);
  }
  :global(.md-body .cb-head-actions) {
    display: inline-flex;
    gap: 8px;
  }
  :global(.md-body .cb-preview) {
    border: none;
    background: transparent;
    color: var(--tx3);
    font-size: 10px;
    font-family: var(--font-mono);
    cursor: pointer;
    padding: 0;
    transition: color var(--duration-fast) var(--ease);
  }
  :global(.md-body .cb-preview:hover) { color: var(--ac); }
  :global(.md-body .cb-preview-frame) {
    width: 100%;
    height: 240px;
    border: none;
    border-top: 1px solid var(--bd);
    background: #fff;
    display: block;
  }
  :global(.md-body .cb-copy) {
    border: none;
    background: transparent;
    color: var(--tx3);
    font-size: 10px;
    font-family: var(--font-mono);
    cursor: pointer;
    padding: 0;
    transition: color var(--duration-fast) var(--ease);
  }
  :global(.md-body .cb-copy:hover) { color: var(--tx); }
  :global(.md-body .code-block) {
    margin: 0;
    padding: 10px 12px;
    background: transparent;
    border: none;
    overflow-x: auto;
    font-family: var(--font-mono);
    font-size: 11.5px;
    line-height: 1.65;
  }
  :global(.md-body .code-block code) {
    background: none;
    padding: 0;
    font-size: inherit;
  }
  /* Shiki output overrides our bg — let it through */
  :global(.md-body pre.shiki) {
    margin: 0 0 12px;
    padding: 10px 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--bd);
    overflow-x: auto;
    font-size: 11.5px;
    line-height: 1.65;
  }

  /* Diff blocks */
  :global(.md-body .diff-block) {
    white-space: pre;
  }
  :global(.md-body .diff-add) {
    color: var(--ok);
    background: var(--ok-soft);
    display: block;
  }
  :global(.md-body .diff-del) {
    color: var(--err);
    background: var(--err-soft);
    display: block;
  }
  :global(.md-body .diff-meta) {
    color: var(--tx3);
    display: block;
  }

  /* Streaming cursor */
  .md-cursor {
    display: inline-block;
    width: 6px;
    height: 13px;
    border-radius: 1px;
    background: var(--ac);
    animation: blink 1s steps(2) infinite;
    vertical-align: -2px;
    margin-left: 1px;
  }
  @keyframes blink {
    50% { opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .md-cursor { animation: none; }
  }

  /* ===== JSON collapsible tree (rendered from data-json blocks) ===== */
  :global(.md-body .cb-tree-wrap) {
    border-top: 1px solid var(--bd);
    padding: 8px 12px;
    font-family: var(--font-mono);
    font-size: 11.5px;
    line-height: 1.6;
    background: var(--l2);
    overflow-x: auto;
  }
  :global(.md-body .jt-root) {
    color: var(--tx);
    white-space: pre;
  }
  :global(.md-body .jt-row) {
    display: block;
    padding-left: 8px;
    position: relative;
  }
  :global(.md-body .jt-fold) {
    display: inline-block;
    width: 12px;
    cursor: pointer;
    color: var(--tx3);
    user-select: none;
    text-align: center;
    transition: transform var(--duration-fast, 120ms) var(--ease, ease);
  }
  :global(.md-body .jt-fold-empty) {
    cursor: default;
    color: transparent;
  }
  :global(.md-body .jt-obj.folded > .jt-children) {
    display: none;
  }
  :global(.md-body .jt-obj.folded .jt-fold) {
    transform: rotate(-90deg);
  }
  :global(.md-body .jt-children) {
    margin-left: 14px;
    border-left: 1px solid var(--bd);
    padding-left: 4px;
  }
  :global(.md-body .jt-key) { color: var(--ac-h); }
  :global(.md-body .jt-idx) { color: var(--tx3); }
  :global(.md-body .jt-str) { color: var(--ok); }
  :global(.md-body .jt-num) { color: var(--warn); }
  :global(.md-body .jt-bool) { color: var(--ac); }
  :global(.md-body .jt-null) { color: var(--tx3); font-style: italic; }
  :global(.md-body .jt-brkt) { color: var(--tx2); font-weight: 600; }
</style>
