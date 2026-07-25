<!-- TerminalPanel.svelte — interactive shell for the active session.

  Mounts an xterm.js instance wired to the daemon's terminal API (REST for
  list/create/close, WS for attach/input/resize/output/exit). Mirrors
  kimi-web's Terminal.vue: waits for webfont load before measuring (xterm
  caches char width on first open), debounces ResizeObserver, and swaps the
  xterm theme when the document's color-scheme attribute changes.

  The xterm host must NOT inherit `overflow-y: auto` from the parent tab —
  xterm manages its own viewport scrollback.
-->
<script lang="ts">
  import '@xterm/xterm/css/xterm.css';
  import type { Terminal as XTerm, ITheme } from '@xterm/xterm';
  import type { FitAddon as FitAddonType } from '@xterm/addon-fit';
  import { useTerminal } from '../../composables/useTerminal.svelte';
  import * as client from '../../stores/client.svelte';
  import Button from '../ui/Button.svelte';

  // xterm's fontFamily is a literal string — it does NOT resolve CSS vars, so
  // passing var(--font-mono) silently falls back to courier. Use the real
  // JetBrains Mono stack (already loaded via @fontsource-variable).
  const TERMINAL_FONT =
    '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

  let hostEl = $state<HTMLElement | null>(null);
  const sessionId = $derived(client.activeSessionId());
  const term = useTerminal(() => sessionId);

  let xterm: XTerm | null = null;
  let fitAddon: FitAddonType | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let disposeOutput: (() => void) | null = null;
  let disposeExit: (() => void) | null = null;

  // xterm theme (literal colors — see TERMINAL_FONT note on CSS vars).
  const isDark = $derived.by(() => {
    const attr = typeof document !== 'undefined'
      ? document.documentElement.dataset.colorScheme
      : 'dark';
    if (attr === 'dark' || attr === 'glass' || attr === 'neon') return true;
    if (attr === 'light' || attr === 'clay' || attr === 'aqua') return false;
    return typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true;
  });

  const theme = $derived<ITheme>(
    isDark
      ? {
          background: '#0d1117',
          foreground: '#e6edf3',
          cursor: '#7aa2ff',
          selectionBackground: '#264f78',
          black: '#0d1117',
          red: '#ff7b72',
          green: '#7ee787',
          yellow: '#f2cc60',
          blue: '#7aa2ff',
          magenta: '#d2a8ff',
          cyan: '#76e3ea',
          white: '#e6edf3',
        }
      : {
          background: '#ffffff',
          foreground: '#1f2328',
          cursor: '#1f6feb',
          selectionBackground: '#c8e1ff',
          black: '#24292f',
          red: '#cf222e',
          green: '#116329',
          yellow: '#9a6700',
          blue: '#0969da',
          magenta: '#8250df',
          cyan: '#1b7c83',
          white: '#1f2328',
        },
  );

  async function initTerminal() {
    if (!hostEl || xterm) return;
    const [{ Terminal: XTermCtor }, { FitAddon: FitAddonCtor }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
    ]);
    if (!hostEl) return; // unmounted during the await

    // Wait for the webfont to load before measuring — a not-yet-loaded font
    // makes xterm cache a wrong char width and the grid renders off-pitch.
    if (typeof document !== 'undefined' && 'fonts' in document) {
      try { await document.fonts.ready; } catch { /* ignore */ }
    }

    const next = new XTermCtor({
      cursorBlink: true,
      convertEol: true,
      fontFamily: TERMINAL_FONT,
      fontSize: 13,
      lineHeight: 1.1,
      letterSpacing: 0,
      scrollback: 4000,
      theme: theme,
    });
    const fit = new FitAddonCtor();
    next.loadAddon(fit);
    next.open(hostEl);
    xterm = next;
    fitAddon = fit;

    next.onData((data) => term.write(data));
    next.onResize(({ cols, rows }) => term.resize(cols, rows));

    disposeOutput = term.onOutput((data) => {
      xterm?.write(data);
    });
    disposeExit = term.onExit((exitCode) => {
      xterm?.writeln('');
      xterm?.writeln(
        exitCode === null
          ? '[process exited]'
          : `[process exited with code ${exitCode}]`,
      );
    });

    resizeObserver = new ResizeObserver(() => scheduleFit());
    resizeObserver.observe(hostEl);
  }

  function fitAndResize() {
    if (!hostEl || !fitAddon || !xterm) return;
    if (hostEl.clientWidth <= 0 || hostEl.clientHeight <= 0) return;
    try {
      fitAddon.fit();
      term.resize(xterm.cols, xterm.rows);
    } catch {
      // xterm fit can throw while layout is settling — ignore, will retry on next resize.
    }
  }

  function scheduleFit() {
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => fitAndResize(), 100);
  }

  async function start() {
    await initTerminal();
    fitAndResize();
    await term.start({ cols: xterm?.cols, rows: xterm?.rows });
    fitAndResize();
    xterm?.focus();
  }

  // Boot when sessionId becomes available (or changes).
  let prevSessionId = '';
  $effect(() => {
    const sid = sessionId;
    if (!sid) {
      prevSessionId = '';
      return;
    }
    if (sid === prevSessionId) return;
    prevSessionId = sid;
    xterm?.reset();
    void start();
  });

  // Swap the xterm theme when the document's data-color-scheme attribute flips.
  $effect(() => {
    void theme; // re-subscribe when theme changes
    if (xterm) xterm.options.theme = theme;
  });
  // Track data-color-scheme attribute changes (MutationObserver — matches
  // kimi-web's useIsDark singleton).
  $effect(() => {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.attributeName === 'data-color-scheme') {
          // Touch the derived by re-reading; Svelte reactivity handles the rest.
          void el.dataset.colorScheme;
        }
      }
    });
    observer.observe(el, { attributes: true, attributeFilter: ['data-color-scheme'] });
    return () => {
      observer.disconnect();
    };
  });

  // Cleanup on unmount.
  $effect(() => {
    return () => {
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      resizeObserver?.disconnect();
      disposeOutput?.();
      disposeExit?.();
      xterm?.dispose();
      xterm = null;
      fitAddon = null;
      term.dispose();
    };
  });
</script>

<div class="terminal-panel">
  <div class="term-toolbar">
    <span class="term-state">
      {#if term.loading()}
        <span class="state-dot loading"></span><span>启动中…</span>
      {:else if !term.connected()}
        <span class="state-dot offline"></span><span>未连接</span>
      {:else if term.readOnly()}
        <span class="state-dot exited"></span><span>已退出</span>
      {:else}
        <span class="state-dot live"></span><span>{term.terminal()?.shell || 'shell'}</span>
      {/if}
    </span>
    {#if term.terminal()?.cwd}
      <span class="term-cwd mono" title={term.terminal()!.cwd}>{term.terminal()!.cwd}</span>
    {/if}
    <div class="term-actions">
      <Button size="sm" onclick={() => fitAndResize()}>适配</Button>
      <Button size="sm" onclick={() => void term.close()}>关闭</Button>
      <Button size="sm" variant="primary" onclick={() => { xterm?.reset(); void term.restart(); }}>新建</Button>
    </div>
  </div>
  <div class="terminal-surface">
    <div class="terminal-host" bind:this={hostEl}></div>
    {#if term.error()}
      <div class="term-overlay err">{term.error()}</div>
    {:else if !term.terminal() && !term.loading()}
      <div class="term-overlay">等待启动…</div>
    {/if}
  </div>
</div>

<style>
  .terminal-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0d1117;
    overflow: hidden;
  }

  .term-toolbar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 34px;
    padding: 0 12px;
    border-bottom: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    background: var(--mat-header-bg, var(--l1));
    font-size: 11px;
    color: var(--tx2);
  }

  .term-state { display: inline-flex; align-items: center; gap: 6px; flex: none; }
  .state-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
  .state-dot.live { background: var(--ok); box-shadow: 0 0 6px var(--ok); animation: term-pulse 1.6s ease-in-out infinite; }
  .state-dot.loading { background: var(--ac); animation: term-pulse 1s ease-in-out infinite; }
  .state-dot.exited { background: var(--tx3); }
  .state-dot.offline { background: var(--tx3); }
  @keyframes term-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  @media (prefers-reduced-motion: reduce) {
    .state-dot.live, .state-dot.loading { animation: none; }
  }

  .term-cwd {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--tx3);
    font-size: 10.5px;
  }

  .term-actions { display: flex; gap: 4px; flex: none; align-items: center; }

  .terminal-surface { flex: 1; min-height: 0; position: relative; overflow: hidden; }
  .terminal-host { width: 100%; height: 100%; padding: 8px 10px; }
  .terminal-host :global(.xterm) { padding: 0; height: 100%; }

  .term-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tx3);
    font-size: 12px;
    pointer-events: none;
    background: rgba(13, 17, 23, 0.6);
  }
  .term-overlay.err { color: var(--err); }
</style>
