<!-- Composer.svelte — prompt input with auto-resizing textarea, slash menu,
     input history (↑/↓ recall), image attachment upload, and submit. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import SlashMenu from './SlashMenu.svelte';
  import * as client from '../../stores/client.svelte';

  let {
    text = $bindable(''),
    running = false,
    onsubmit,
  }: {
    text: string;
    running: boolean;
    onsubmit: (attachments?: { fileId: string; kind: 'image' | 'video' }[]) => void;
  } = $props();

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
    const sid = client.activeSessionId;
    if (!sid) return;
    const entries = loadHistory(sid);
    if (entries[entries.length - 1] !== entry) {
      entries.push(entry);
      saveHistory(sid, entries);
    }
  }

  function recallHistory(direction: 'up' | 'down') {
    const sid = client.activeSessionId;
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
  $effect(() => { void client.activeSessionId; historyBrowsing = false; });

  const allUploaded = $derived(attachments.length > 0 && attachments.every((a) => a.fileId && !a.uploading));

  function handleInput() { historyBrowsing = false; }

  function handleKeydown(e: KeyboardEvent) {
    if (showSlash) {
      if (e.key === 'ArrowDown') { e.preventDefault(); slashIndex++; return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); slashIndex = Math.max(0, slashIndex - 1); return; }
      if (e.key === 'Escape') { e.preventDefault(); text = ''; return; }
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
      <SlashMenu query={slashQuery} skills={client.skills} activeIndex={slashIndex} onselect={handleSlashSelect} />
    {/if}
    <IconButton name="image" label="添加图片" size="sm" onclick={openFilePicker} />
    <textarea
      bind:this={textareaEl}
      bind:value={text}
      onkeydown={handleKeydown}
      oninput={handleInput}
      onpaste={handlePaste}
      placeholder="输入消息… (Enter 发送, Shift+Enter 换行, / 命令, ↑ 历史, 📎 或粘贴图片)"
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
  <div class="composer-hint">
    <kbd>Enter</kbd> 发送 · <kbd>Shift+Enter</kbd> 换行 · <kbd>/</kbd> 命令 · <kbd>↑</kbd> 历史 · 📎 粘贴/选择图片
  </div>
</div>

<style>
  .composer {
    flex: none;
    padding: 8px 24px 12px;
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
    border: 1px solid var(--color-line, #2a2a2e);
  }
  .attachment-chip img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .attachment-chip.uploading img { opacity: 0.5; }
  .attachment-chip.error { border-color: var(--color-danger, #ff6b6b); }
  .chip-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: none;
    background: rgba(0,0,0,0.6);
    color: #fff;
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
    border-top-color: var(--color-accent, #7c8cff);
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
    color: #fff;
    font-weight: bold;
  }

  .composer-inner {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    background: var(--color-surface, #121214);
    border: 1px solid var(--color-line, #2a2a2e);
    border-radius: var(--radius-lg, 12px);
    padding: 6px 6px 6px 6px;
    transition: border-color var(--duration-fast, 120ms);
  }
  .composer-inner:focus-within { border-color: var(--color-accent, #7c8cff); }

  .composer-input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--color-text, #e7e7ea);
    font-family: var(--font-ui, inherit);
    font-size: var(--ui-font-size, var(--text-base, 14px));
    line-height: var(--leading-normal, 1.5);
    resize: none;
    outline: none;
    max-height: 200px;
    padding: 6px 4px;
  }
  .composer-input::placeholder { color: var(--color-text-faint, #6a6a72); }
  .composer-input.busy { opacity: 0.6; }

  .send-btn {
    flex: none;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md, 8px);
    border: none;
    background: var(--color-accent, #7c8cff);
    color: var(--color-text-on-accent, #fff);
    cursor: pointer;
    transition: opacity var(--duration-fast, 120ms), transform var(--duration-fast, 120ms);
  }
  .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .send-btn:not(:disabled):hover { opacity: 0.9; }
  .send-btn:not(:disabled):active { transform: scale(0.95); }

  .composer-hint {
    text-align: center;
    font-size: var(--text-xs, 12px);
    color: var(--color-text-faint, #6a6a72);
    margin-top: 6px;
  }
  kbd {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    background: var(--color-surface-raised, #1a1a1e);
    border: 1px solid var(--color-line, #2a2a2e);
    border-radius: var(--radius-xs, 4px);
    padding: 1px 5px;
  }
</style>
