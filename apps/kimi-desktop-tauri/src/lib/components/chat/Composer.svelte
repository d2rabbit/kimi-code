<!-- Composer.svelte — prompt input with auto-resizing textarea, slash menu,
     input history (↑/↓ recall), image attachment upload, and submit. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import SlashMenu from './SlashMenu.svelte';
  import * as client from '../../stores/client.svelte';
  import { getKimiWebApi } from '../../api';

  // --- File mention (@) ---
  interface FileResult { path: string; name: string; }
  let mentionQuery = $state('');
  let mentionResults = $state<FileResult[]>([]);
  let mentionIndex = $state(0);
  

  async function searchMention(query: string) {
    const sid = client.activeSessionId();
    if (!sid || !query) { mentionResults = []; return; }
    try {
      const api = getKimiWebApi();
      const result = await api.searchFiles(sid, { query, limit: 10 });
      mentionResults = result.items.map((i) => ({ path: i.path, name: i.name }));
    } catch { mentionResults = []; }
  }

  function kFmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
    return String(n);
  }

  let {
    text = $bindable(''),
    running = false,
    onsubmit,
  }: {
    text: string;
    running: boolean;
    onsubmit: (attachments?: { fileId: string; kind: 'image' | 'video' }[]) => void;
  } = $props();

  const showMention = $derived(mentionQuery !== '' && !running);

  let textareaEl: HTMLTextAreaElement | null = $state(null);
  let fileInputEl: HTMLInputElement | null = $state(null);
  let slashIndex = $state(0);

  // --- Pending attachments (not yet uploaded or just uploaded, waiting for send) ---
  interface PendingAttachment {
    id: string; // local temp id
    file: File;
    previewUrl: string;
    uploading: boolean;
    fileId?: string; // set after upload
    kind?: 'image' | 'video';
    error?: string;
  }
  let attachments = $state<PendingAttachment[]>([]);

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    for (const file of arr) {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
      const previewUrl = URL.createObjectURL(file);
      attachments.push({
        id: crypto.randomUUID(),
        file,
        previewUrl,
        uploading: true,
      });
    }
    attachments = [...attachments];
    // Upload each new attachment.
    for (const att of attachments) {
      if (att.uploading && !att.fileId) {
        void uploadAttachment(att);
      }
    }
  }

  async function uploadAttachment(att: PendingAttachment) {
    try {
      const result = await client.client.uploadImage(att.file, att.file.name);
      att.fileId = result.fileId;
      att.kind = result.kind;
      att.uploading = false;
      attachments = [...attachments];
    } catch (e) {
      att.error = e instanceof Error ? e.message : String(e);
      att.uploading = false;
      attachments = [...attachments];
    }
  }

  function removeAttachment(id: string) {
    const att = attachments.find((a) => a.id === id);
    if (att) URL.revokeObjectURL(att.previewUrl);
    attachments = attachments.filter((a) => a.id !== id);
  }

  function openFilePicker() {
    fileInputEl?.click();
  }

  function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) addFiles(input.files);
    input.value = ''; // reset so same file can be re-selected
  }

  function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.kind === 'file' && (item.type.startsWith('image/') || item.type.startsWith('video/'))) {
        const f = item.getAsFile();
        if (f) imageFiles.push(f);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addFiles(imageFiles);
    }
  }

  // --- Input history (shell-style ↑/↓ recall, per session) ---
  const HISTORY_KEY = 'kimi-desktop-input-history';
  const MAX_HISTORY = 100;
  let historyBrowsing = $state(false);
  let historyCursor = 0;
  let draftBeforeBrowse = '';

  function loadHistory(sessionId: string): string[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const map = JSON.parse(raw) as Record<string, string[]>;
      return map[sessionId] ?? [];
    } catch { return []; }
  }

  function saveHistory(sessionId: string, entries: string[]) {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
      map[sessionId] = entries.slice(-MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(map));
    } catch {}
  }

  function recordHistory(entry: string) {
    const sid = client.activeSessionId();
    if (!sid) return;
    const entries = loadHistory(sid);
    if (entries[entries.length - 1] !== entry) {
      entries.push(entry);
      saveHistory(sid, entries);
    }
  }

  function recallHistory(direction: 'up' | 'down') {
    const sid = client.activeSessionId();
    if (!sid) return;
    const entries = loadHistory(sid);
    if (entries.length === 0) return;
    if (!historyBrowsing) {
      if (direction === 'up') {
        draftBeforeBrowse = text;
        historyBrowsing = true;
        historyCursor = entries.length - 1;
        text = entries[historyCursor]!;
      }
    } else {
      if (direction === 'up') {
        historyCursor = Math.max(0, historyCursor - 1);
        text = entries[historyCursor] ?? '';
      } else {
        historyCursor++;
        if (historyCursor >= entries.length) {
          historyBrowsing = false;
          text = draftBeforeBrowse;
        } else {
          text = entries[historyCursor] ?? '';
        }
      }
    }
  }

  // --- Auto-resize ---
  $effect(() => {
    void text;
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + 'px';
    }
  });

  // --- Slash menu ---
  const slashQuery = $derived(text.startsWith('/') && !text.includes(' ') ? text.slice(1) : '');
  const showSlash = $derived(slashQuery !== '' && !running);

  $effect(() => { void slashQuery; slashIndex = 0; });
  $effect(() => { void client.activeSessionId(); historyBrowsing = false; });

  const allUploaded = $derived(attachments.length > 0 && attachments.every((a) => a.fileId && !a.uploading));

  function handleInput() {
    historyBrowsing = false;
    // Detect @ mention
    const cursorPos = textareaEl?.selectionStart ?? 0;
    const beforeCursor = text.slice(0, cursorPos);
    const atMatch = beforeCursor.match(/@([^\s@]*)$/);
    if (atMatch) {
      mentionQuery = atMatch[1] ?? '';
      void searchMention(mentionQuery);
    } else {
      mentionQuery = '';
      mentionResults = [];
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    // Steer: ⌘S / Ctrl+S injects into running turn
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      const t = text.trim();
      if (t && running) {
        void client.client.steerPrompt([]).then(() => {
          // Also send as a new prompt that gets steered
          void client.client.sendPrompt(t);
          text = '';
        });
      }
      return;
    }
    if (showSlash) {
      if (e.key === 'ArrowDown') { e.preventDefault(); slashIndex++; return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); slashIndex = Math.max(0, slashIndex - 1); return; }
      if (e.key === 'Escape') { e.preventDefault(); text = ''; return; }
    }
    if (showMention) {
      if (e.key === 'ArrowDown') { e.preventDefault(); mentionIndex = Math.min(mentionResults.length - 1, mentionIndex + 1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); mentionIndex = Math.max(0, mentionIndex - 1); return; }
      if (e.key === 'Escape') { e.preventDefault(); mentionQuery = ''; mentionResults = []; return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = mentionResults[mentionIndex];
        if (selected) {
          const cursorPos = textareaEl?.selectionStart ?? 0;
          const beforeAt = text.slice(0, cursorPos).lastIndexOf('@');
          if (beforeAt >= 0) {
            text = text.slice(0, beforeAt) + `@${selected.path} ` + text.slice(cursorPos);
            mentionQuery = ''; mentionResults = [];
          }
        }
        return;
      }
    }
    if (!showSlash && !running) {
      if (e.key === 'ArrowUp' && textareaEl?.selectionStart === 0) { e.preventDefault(); recallHistory('up'); return; }
      if (e.key === 'ArrowDown' && historyBrowsing && textareaEl && textareaEl.selectionStart === textareaEl.value.length) { e.preventDefault(); recallHistory('down'); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const canSend = !running && (text.trim() || allUploaded);
      if (canSend) {
        const sentAttachments = attachments
          .filter((a) => a.fileId)
          .map((a) => ({ fileId: a.fileId!, kind: a.kind! }));
        // Clear attachments.
        for (const att of attachments) URL.revokeObjectURL(att.previewUrl);
        attachments = [];
        if (text.trim()) recordHistory(text.trim());
        historyBrowsing = false;
        onsubmit(sentAttachments.length > 0 ? sentAttachments : undefined);
      }
    }
  }

  function handleSlashSelect(cmd: string) {
    text = cmd + ' ';
    textareaEl?.focus();
  }
</script>

<!-- Hidden file input for image picker -->
<input
  bind:this={fileInputEl}
  type="file"
  accept="image/*,video/*"
  multiple
  onchange={handleFileChange}
  style="display: none;"
/>

<div class="composer">
  <!-- Attachment chips -->
  {#if attachments.length > 0}
    <div class="attachment-strip">
      {#each attachments as att (att.id)}
        <div class="attachment-chip" class:uploading={att.uploading} class:error={!!att.error}>
          <img src={att.previewUrl} alt={att.file.name} />
          <button class="chip-remove" onclick={() => removeAttachment(att.id)} type="button" aria-label="移除">
            <Icon name="close" size="sm" />
          </button>
          {#if att.uploading}
            <div class="chip-loading"></div>
          {/if}
          {#if att.error}
            <div class="chip-error" title={att.error}>!</div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <div class="composer-inner" style="position: relative;">
    {#if showSlash}
      <SlashMenu query={slashQuery} skills={client.skills()} activeIndex={slashIndex} onselect={handleSlashSelect} />
    {/if}
    {#if showMention && mentionResults.length > 0}
      <div class="mention-menu glass-menu animate-spring-in">
        {#each mentionResults as item, i (item.path)}
          <button class="mention-item" class:selected={i === mentionIndex}
            onclick={() => {
              const cursorPos = textareaEl?.selectionStart ?? 0;
              const beforeAt = text.slice(0, cursorPos).lastIndexOf('@');
              if (beforeAt >= 0) {
                text = text.slice(0, beforeAt) + `@${item.path} ` + text.slice(cursorPos);
              }
              mentionQuery = ''; mentionResults = [];
              textareaEl?.focus();
            }}
            type="button">
            <Icon name="file-text" size="sm" />
            <span class="mention-path">{item.path}</span>
          </button>
        {/each}
      </div>
    {/if}
    <IconButton name="image" label="添加图片" size="sm" onclick={openFilePicker} />
    <textarea
      bind:this={textareaEl}
      bind:value={text}
      onkeydown={handleKeydown}
      oninput={handleInput}
      onpaste={handlePaste}
      placeholder="Ask anything…  ( / for commands)"
      rows="1"
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      class="composer-input"
      class:busy={running}
    ></textarea>
    <button
      class="send-btn"
      disabled={running || (!text.trim() && !allUploaded)}
      onclick={() => {
        const canSend = !running && (text.trim() || allUploaded);
        if (!canSend) return;
        const sentAttachments = attachments.filter((a) => a.fileId).map((a) => ({ fileId: a.fileId!, kind: a.kind! }));
        for (const att of attachments) URL.revokeObjectURL(att.previewUrl);
        attachments = [];
        if (text.trim()) recordHistory(text.trim());
        historyBrowsing = false;
        onsubmit(sentAttachments.length > 0 ? sentAttachments : undefined);
      }}
      type="button"
      aria-label="发送"
    >
      <Icon name="send" size="md" />
    </button>
  </div>

  <!-- Composer toolbar: permission pill + mode toggles + context ring + model picker -->
  <div class="composer-toolbar">
    <!-- Permission pill -->
    <button
      class="toolbar-pill perm-pill perm-{client.permission()}"
      onclick={() => {
        const modes = ['manual', 'auto', 'yolo'] as const;
        const idx = modes.indexOf(client.permission());
        client.client.setPermission(modes[(idx + 1) % 3]!);
      }}
      type="button"
    >
      {client.permission() === 'manual' ? '手动' : client.permission() === 'auto' ? '自动' : '完全访问'}
    </button>

    <!-- Mode toggles -->
    <button
      class="toolbar-pill mode-toggle"
      class:active={client.planMode()}
      onclick={() => client.client.togglePlanMode()}
      type="button"
    >Plan</button>
    <button
      class="toolbar-pill mode-toggle"
      class:active={client.goalMode()}
      onclick={() => client.client.toggleGoalMode()}
      type="button"
    >Goal</button>
    <button
      class="toolbar-pill mode-toggle"
      class:active={client.swarmMode()}
      onclick={() => client.client.toggleSwarmMode()}
      type="button"
    >Swarm</button>

    <div class="toolbar-spacer"></div>

    <!-- Context ring -->
    {#if client.activeSessionUsage() && client.activeSessionUsage()!.contextLimit}
      {@const usage = client.activeSessionUsage()!}
      {@const pct = usage.contextLimit > 0 ? Math.min(100, (usage.contextTokens / usage.contextLimit) * 100) : 0}
      <div class="ctx-indicator" class:warning={pct >= 80}>
        <div class="ctx-ring" style="--pct: {pct}"></div>
        <span>{kFmt(usage.contextTokens)}/{kFmt(usage.contextLimit)}</span>
        {#if pct >= 80}
          <button class="compact-btn" onclick={() => client.client.compact()} type="button">/compact</button>
        {/if}
      </div>
    {/if}

    <!-- Model picker -->
    {#if client.models().length > 0}
      <select
        class="model-select"
        value={client.activeSessionModel() || client.defaultModel()}
        onchange={(e) => client.client.setModel((e.target as HTMLSelectElement).value)}
      >
        {#each client.models() as m (m.id)}
          <option value={m.id}>{m.displayName || m.id}</option>
        {/each}
      </select>
    {/if}
  </div>
</div>

<style>
  .composer {
    flex: none;
    padding: 6px 20px 10px;
    max-width: var(--p-content-max, 760px);
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
  }

  /* Attachment strip */
  .attachment-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 6px;
  }
  .attachment-chip {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    border: 1px solid var(--color-line, rgba(84,84,88,0.65));
  }
  .attachment-chip img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .attachment-chip.uploading img { opacity: 0.5; }
  .attachment-chip.error { border-color: var(--color-danger, #ff453a); }
  .chip-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: none;
    background: rgba(0,0,0,0.6);
    color: var(--color-text, rgba(255,255,255,0.92));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .chip-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .chip-loading::after {
    content: '';
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.2);
    border-top-color: var(--color-accent, #2dd4bf);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .chip-error {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-danger-soft, rgba(255,107,107,0.8));
    color: var(--color-text, rgba(255,255,255,0.92));
    font-weight: bold;
  }

  .composer-inner {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%), rgba(26, 26, 30, 0.60);
    backdrop-filter: blur(20px) saturate(1.4);
    -webkit-backdrop-filter: blur(20px) saturate(1.4);
    border: 1px solid var(--color-line, #2e2e2e);
    border-radius: var(--radius-lg, 12px);
    padding: 6px 6px 6px 6px;
    transition: border-color var(--duration-fast, 120ms), box-shadow var(--duration-fast, 120ms);
  }
  .composer-inner:focus-within {
    border-color: rgba(255, 255, 255, 0.15);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.04);
  }

  .composer-input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--color-text, rgba(255,255,255,0.92));
    font-family: var(--font-ui, inherit);
    font-size: var(--ui-font-size, var(--text-base, 14px));
    line-height: var(--leading-normal, 1.5);
    resize: none;
    outline: none;
    max-height: 200px;
    padding: 6px 4px;
  }
  .composer-input::placeholder { color: var(--color-text-faint, rgba(235,235,245,0.3)); }
  .composer-input.busy { opacity: 0.6; }

  .send-btn {
    flex: none;
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full, 999px);
    border: none;
    background: var(--color-text, #ececec);
    color: var(--color-bg);
    cursor: pointer;
    transition: all var(--duration-fast, 120ms);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }
  .send-btn:disabled { opacity: 0.25; cursor: not-allowed; box-shadow: none; }
  .send-btn:not(:disabled):hover { transform: scale(1.06); box-shadow: 0 4px 12px rgba(255,255,255,0.1); }
  .send-btn:not(:disabled):active { transform: scale(0.95); }

  /* Context usage bar */
  .context-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 4px 0 0;
    font-size: var(--text-xs, 11px);
    color: var(--color-text-faint, #555);
    font-family: var(--font-mono, monospace);
  }
  .context-bar.warning {
    color: var(--color-warning, #d29922);
  }
  .context-ring {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: conic-gradient(
      var(--color-text-muted, #999) calc(var(--pct, 0) * 1%),
      rgba(255,255,255,0.1) 0
    );
  }
  .context-text {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .compact-btn {
    border: none;
    background: rgba(255,255,255,0.06);
    color: var(--color-warning, #d29922);
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs, 11px);
    padding: 1px 6px;
    border-radius: var(--radius-xs, 4px);
    cursor: pointer;
  }
  .compact-btn:hover {
    background: rgba(255,255,255,0.1);
  }

  /* ---- Composer toolbar ---- */
  .composer-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 4px 0;
    font-size: 12px;
  }
  .toolbar-spacer { flex: 1; }
  .toolbar-pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px 10px;
    border: none;
    border-radius: var(--radius-full, 999px);
    background: var(--color-hover, rgba(255,255,255,0.06));
    color: var(--color-text-muted, rgba(235,235,245,0.6));
    font-size: 12px;
    cursor: pointer;
    transition: background 120ms, color 120ms;
    white-space: nowrap;
  }
  .toolbar-pill:hover {
    background: var(--color-selected, rgba(255,255,255,0.1));
    color: var(--color-text, rgba(255,255,255,0.92));
  }
  .perm-pill.perm-manual { color: var(--color-text-muted); }
  .perm-pill.perm-auto { color: var(--color-warning, #ffd60a); }
  .perm-pill.perm-yolo { color: var(--color-danger, #ff453a); }

  .mode-toggle.active {
    background: var(--color-accent-soft, rgba(10,132,255,0.16));
    color: var(--color-accent, #0a84ff);
  }

  .ctx-indicator {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--color-text-faint, rgba(235,235,245,0.3));
  }
  .ctx-indicator.warning { color: var(--color-warning, #ffd60a); }
  .ctx-ring {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: conic-gradient(
      var(--color-text-muted, #999) calc(var(--pct, 0) * 1%),
      rgba(255,255,255,0.1) 0
    );
  }
  .ctx-indicator.warning .ctx-ring {
    background: conic-gradient(
      var(--color-warning, #ffd60a) calc(var(--pct, 0) * 1%),
      rgba(255,255,255,0.1) 0
    );
  }

  .model-select {
    border: none;
    border-radius: var(--radius-full, 999px);
    background: var(--color-hover, rgba(255,255,255,0.06));
    color: var(--color-text-muted, rgba(235,235,245,0.6));
    font-size: 12px;
    padding: 3px 8px;
    cursor: pointer;
    outline: none;
  }
  .model-select:hover {
    background: var(--color-selected, rgba(255,255,255,0.1));
  }
  /* Mention menu */
  .mention-menu {
    position: absolute; bottom: 100%; left: 0; right: 0; z-index: 200;
    max-height: 240px; overflow-y: auto; margin-bottom: 4px;
    min-width: 280px;
  }
  .mention-item {
    display: flex; align-items: center; gap: 8px; width: 100%;
    padding: 7px 10px; border: none; border-radius: var(--radius-sm, 8px);
    background: transparent; color: var(--color-text-muted, rgba(235,235,245,0.6));
    font-size: 12px; cursor: pointer; text-align: left; font-family: inherit;
    transition: background 80ms;
  }
  .mention-item.selected { background: var(--color-selected, rgba(45,212,191,0.12)); color: var(--color-text); }
  .mention-item.selected :global(svg) { color: var(--color-accent, #2dd4bf); }
  .mention-path { font-family: var(--font-mono, monospace); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
