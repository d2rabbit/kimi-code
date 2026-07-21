<!-- Composer.svelte — prompt input with auto-resizing textarea, slash menu,
     @ file mentions (chips), image attachments, permission mode segmented
     control, token counter, model/thinking pickers, and a compact FAB. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import SlashMenu from './SlashMenu.svelte';
  import GoalDialog from './GoalDialog.svelte';
  import SwarmDialog from './SwarmDialog.svelte';
  import * as client from '../../stores/client.svelte';
  import { getKimiWebApi } from '../../api';

  // --- File mention (@) ---
  interface FileResult { path: string; name: string; }
  let mentionQuery = $state('');
  let mentionResults = $state<FileResult[]>([]);
  let mentionIndex = $state(0);

  async function searchMention(query: string) {
    let sid = client.activeSessionId();
    if (!sid) {
      const wsId = client.activeWorkspaceId();
      const pool = wsId ? client.sessions().filter((x) => x.workspaceId === wsId) : client.sessions();
      sid = pool[0]?.id ?? client.sessions()[0]?.id ?? '';
    }
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

  // --- @-mentioned file chips (derived from text tokens; ✕ removes the token) ---
  const mentionChips = $derived.by(() => {
    const matches = text.match(/@([^\s@]+)/g) ?? [];
    return matches.map((m) => m.slice(1));
  });

  function removeMentionChip(path: string) {
    text = text.replace(new RegExp(`@${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s?`), '');
  }

  // --- Pending attachments (image/video, uploaded before send) ---
  interface PendingAttachment {
    id: string;
    file: File;
    previewUrl: string;
    uploading: boolean;
    fileId?: string;
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
    input.value = '';
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

  // --- Slash menu：'/' 或 '$' 开头即触发（空查询展示全部技能） ---
  const slashTrigger = $derived((text.startsWith('/') || text.startsWith('$')) && !text.includes(' '));
  const slashQuery = $derived(slashTrigger ? text.slice(1) : '');
  const showSlash = $derived(slashTrigger && !running);

  $effect(() => { void slashQuery; slashIndex = 0; });
  $effect(() => { void client.activeSessionId(); historyBrowsing = false; });

  const allUploaded = $derived(attachments.length > 0 && attachments.every((a) => a.fileId && !a.uploading));

  function handleInput() {
    historyBrowsing = false;
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

  function insertMention(path: string) {
    const cursorPos = textareaEl?.selectionStart ?? 0;
    const beforeAt = text.slice(0, cursorPos).lastIndexOf('@');
    if (beforeAt >= 0) {
      text = text.slice(0, beforeAt) + `@${path} ` + text.slice(cursorPos);
    }
    mentionQuery = ''; mentionResults = [];
    textareaEl?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    // Steer: ⌘S / Ctrl+S injects into running turn
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      const t = text.trim();
      if (t && running) {
        void client.client.steerPrompt([]).then(() => {
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
        if (selected) insertMention(selected.path);
        return;
      }
    }
    if (!showSlash && !running) {
      if (e.key === 'ArrowUp' && textareaEl?.selectionStart === 0) { e.preventDefault(); recallHistory('up'); return; }
      if (e.key === 'ArrowDown' && historyBrowsing && textareaEl && textareaEl.selectionStart === textareaEl.value.length) { e.preventDefault(); recallHistory('down'); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  }

  function doSend() {
    const canSend = !running && (text.trim() || allUploaded);
    if (!canSend) return;
    const sentAttachments = attachments
      .filter((a) => a.fileId)
      .map((a) => ({ fileId: a.fileId!, kind: a.kind! }));
    for (const att of attachments) URL.revokeObjectURL(att.previewUrl);
    attachments = [];
    if (text.trim()) recordHistory(text.trim());
    historyBrowsing = false;
    onsubmit(sentAttachments.length > 0 ? sentAttachments : undefined);
  }

  function handleSlashSelect(cmd: string) {
    text = cmd + ' ';
    textareaEl?.focus();
  }

  // --- Mode / model / thinking menus ---
  let openMenu = $state<'mode' | 'model' | 'think' | null>(null);
  function toggleMenu(m: 'mode' | 'model' | 'think') {
    openMenu = openMenu === m ? null : m;
  }
  function closeMenus() { openMenu = null; }

  // --- Goal / Swarm dialogs (need text input, can't be pure toggles) ---
  let showGoal = $state(false);
  let showSwarm = $state(false);

  function setMode(m: 'manual' | 'auto' | 'yolo' | 'plan') {
    if (m === 'plan') {
      if (!client.planMode()) client.client.togglePlanMode();
    } else {
      if (client.planMode()) client.client.togglePlanMode();
      client.client.setPermission(m);
    }
    closeMenus();
  }

  const THINK_LEVELS: { id: string; label: string }[] = [
    { id: 'off', label: '关' },
    { id: 'on', label: '开' },
    { id: 'low', label: '低' },
    { id: 'high', label: '高' },
    { id: 'max', label: '最高' },
  ];
  const thinkLabel = $derived(THINK_LEVELS.find((l) => l.id === client.thinking())?.label ?? client.thinking());
  const activeModelName = $derived(
    client.models().find((m) => m.id === (client.activeSessionModel() || client.defaultModel()))?.displayName
      ?? client.activeSessionModel() ?? client.defaultModel() ?? '默认',
  );

  const PERMS: { id: 'manual' | 'auto' | 'yolo'; label: string }[] = [
    { id: 'manual', label: '手动' },
    { id: 'auto', label: '自动' },
    { id: 'yolo', label: '⚡完全访问' },
  ];
</script>

<svelte:window onclick={closeMenus} />

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
  <!-- Image attachment chips -->
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

  <div class="composer-card">
    <!-- @-mentioned file chips -->
    {#if mentionChips.length > 0}
      <div class="atch-row">
        {#each mentionChips as path (path)}
          <span class="atch">
            <span class="fi2">{path.endsWith('/') ? 'D' : 'F'}</span>
            <span class="atch-name">{path.split('/').filter(Boolean).pop()}</span>
            <button class="rm" type="button" aria-label="移除引用" onclick={() => removeMentionChip(path)}>✕</button>
          </span>
        {/each}
      </div>
    {/if}

    <!-- Input row -->
    <div class="inrow" style="position: relative;">
      {#if showSlash}
        <SlashMenu query={slashQuery} skills={client.skills()} activeIndex={slashIndex} onselect={handleSlashSelect} />
      {/if}
      {#if showMention && mentionResults.length > 0}
        <div class="mention-menu glass-menu animate-spring-in">
          {#each mentionResults as item, i (item.path)}
            <button class="mention-item glass-menu-item" class:selected={i === mentionIndex}
              onclick={() => insertMention(item.path)} type="button">
              <Icon name="file-text" size="sm" />
              <span class="mention-path">{item.path}</span>
            </button>
          {/each}
        </div>
      {/if}
      <IconButton name="plus" label="添加图片" size="sm" onclick={openFilePicker} />
      <textarea
        bind:this={textareaEl}
        bind:value={text}
        onkeydown={handleKeydown}
        oninput={handleInput}
        onpaste={handlePaste}
        placeholder="输入消息，/ 技能 · @ 文件…"
        rows="1"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        class="composer-input"
        class:busy={running}
      ></textarea>
      <button
        class="sendc"
        disabled={running || (!text.trim() && !allUploaded)}
        onclick={doSend}
        type="button"
        aria-label="发送"
      >
        <Icon name="send" size="md" />
      </button>
    </div>

    <!-- Control row -->
    <div class="ctrl">
      <!-- Mode dropdown: 手动 / 自动 / 完全访问 / 计划 -->
      <span class="pill-wrap">
        <button class="cpill mode-pill" type="button" onclick={(e) => { e.stopPropagation(); toggleMenu('mode'); }}>
          <span class="mic">{client.planMode() ? '📋' : client.permission() === 'yolo' ? '⚡' : client.permission() === 'auto' ? '✏️' : '✋'}</span><b>{client.planMode() ? '计划模式' : PERMS.find((p) => p.id === client.permission())?.label}</b><span class="chev">▾</span>
        </button>
        {#if openMenu === 'mode'}
          <div class="pop glass-menu animate-spring-in" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="menu" tabindex="-1">
            <button class="pop-item glass-menu-item" class:on={!client.planMode() && client.permission() === 'manual'} onclick={() => setMode('manual')} type="button">✋ 手动<span class="src">逐条审批</span></button>
            <button class="pop-item glass-menu-item" class:on={!client.planMode() && client.permission() === 'auto'} onclick={() => setMode('auto')} type="button">✏️ 自动<span class="src">自动编辑，高危审批</span></button>
            <button class="pop-item glass-menu-item" class:on={!client.planMode() && client.permission() === 'yolo'} onclick={() => setMode('yolo')} type="button">⚡ 完全访问<span class="src">不审批</span></button>
            <button class="pop-item glass-menu-item" class:on={client.planMode()} onclick={() => setMode('plan')} type="button">📋 计划模式<span class="src">只读分析出计划</span></button>
          </div>
        {/if}
      </span>
      <!-- Goal / Swarm — open dialogs (need text input, not pure toggles) -->
      <button class="mini-toggle" class:on={client.goalMode()} onclick={() => showGoal = true} type="button" title={client.goal() ? '更新或取消当前目标' : '设置目标'}>Goal</button>
      <button class="mini-toggle" class:on={client.swarmMode()} onclick={() => showSwarm = true} type="button" title="派发 Swarm 子智能体任务">Swarm</button>

      <span style="flex:1"></span>

      <!-- Token counter -->
      {#if client.activeSessionUsage() && client.activeSessionUsage()!.contextLimit}
        {@const usage = client.activeSessionUsage()!}
        {@const pct = usage.contextLimit > 0 ? Math.min(100, (usage.contextTokens / usage.contextLimit) * 100) : 0}
        <span class="tok" class:warning={pct >= 80} title="上下文用量">
          <span class="ring" class:warning={pct >= 80} style="--pct: {pct}"></span>{kFmt(usage.contextTokens)} / {kFmt(usage.contextLimit)}
        </span>
      {/if}

      <!-- Model picker -->
      {#if client.models().length > 0}
        <span class="pill-wrap">
          <button class="cpill" type="button" onclick={(e) => { e.stopPropagation(); toggleMenu('model'); }}>
            <span class="psq"></span><b>{activeModelName}</b><span class="chev">▾</span>
          </button>
          {#if openMenu === 'model'}
            <div class="pop glass-menu animate-spring-in" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="menu" tabindex="-1">
              {#each client.models() as m (m.id)}
                <button class="pop-item glass-menu-item" class:on={(client.activeSessionModel() || client.defaultModel()) === m.id}
                  onclick={() => { client.client.setModel(m.id); closeMenus(); }} type="button">
                  {m.displayName || m.id}
                  {#if (client.activeSessionModel() || client.defaultModel()) === m.id}<span class="src">当前</span>{/if}
                </button>
              {/each}
            </div>
          {/if}
        </span>
      {/if}

      <!-- Thinking level picker -->
      <span class="pill-wrap">
        <button class="cpill" type="button" onclick={(e) => { e.stopPropagation(); toggleMenu('think'); }}>
          <span class="sep"></span><b>{thinkLabel}</b><span class="chev">▾</span>
        </button>
        {#if openMenu === 'think'}
          <div class="pop glass-menu animate-spring-in" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="menu" tabindex="-1">
            {#each THINK_LEVELS as l (l.id)}
              <button class="pop-item glass-menu-item" class:on={client.thinking() === l.id}
                onclick={() => { client.client.setThinking(l.id); closeMenus(); }} type="button">
                {l.label}
                {#if client.thinking() === l.id}<span class="src">当前</span>{/if}
              </button>
            {/each}
          </div>
        {/if}
      </span>
    </div>
  </div>

  <!-- Compact FAB (composer 右下角外部) -->
  <div class="fab-row">
    <button class="fab" type="button" onclick={() => client.client.compact()}>⧉ 压缩对话</button>
  </div>
</div>

<GoalDialog bind:open={showGoal} />
<SwarmDialog bind:open={showSwarm} />

<style>
  .composer {
    flex: none;
    padding: 0 18px 10px;
    max-width: 920px;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
  }

  /* ---- Image attachment strip ---- */
  .attachment-strip { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
  .attachment-chip {
    position: relative; width: 56px; height: 56px;
    border-radius: var(--r-md); overflow: hidden; border: 1px solid var(--bd);
  }
  .attachment-chip img { width: 100%; height: 100%; object-fit: cover; }
  .attachment-chip.uploading img { opacity: 0.5; }
  .attachment-chip.error { border-color: var(--err); }
  .chip-remove {
    position: absolute; top: 2px; right: 2px; width: 18px; height: 18px;
    border-radius: 50%; border: none; background: rgba(0,0,0,0.6); color: #fff;
    cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;
  }
  .chip-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .chip-loading::after {
    content: ''; width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.2); border-top-color: var(--ac);
    animation: kimi-spin var(--duration-spin, 0.8s) linear infinite;
  }
  .chip-error {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: var(--err-soft); color: var(--err); font-weight: bold;
  }

  /* ---- Composer card ---- */
  .composer-card {
    background: var(--l2);
    border: 1px solid var(--bd2);
    border-radius: 18px;
    box-shadow: var(--toplight), 0 6px 20px rgba(0, 0, 0, 0.08);
    transition: border-color var(--duration-fast) var(--ease);
  }
  .composer-card:focus-within { border-color: var(--ac-bd); }

  /* @-mention chips */
  .atch-row { display: flex; gap: 6px; padding: 10px 12px 0; flex-wrap: wrap; }
  .atch {
    display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 7px 0 8px;
    border-radius: 8px; border: 1px solid var(--bd2); background: var(--l1);
    font-size: 11px; font-family: var(--font-mono); color: var(--tx);
  }
  .atch .fi2 { width: 13px; height: 13px; border-radius: 4px; background: var(--ac); color: #fff; font-size: 8px; display: flex; align-items: center; justify-content: center; font-family: var(--font-ui); font-weight: 700; }
  .atch .rm { color: var(--tx3); font-size: 11px; width: 14px; height: 14px; border: none; border-radius: 4px; display: flex; align-items: center; justify-content: center; background: transparent; cursor: pointer; padding: 0; }
  .atch .rm:hover { color: var(--err); background: var(--err-soft); }

  /* Input row */
  .inrow { display: flex; align-items: flex-end; gap: 8px; padding: 12px 14px 10px; min-height: 84px; }
  .composer-input {
    flex: 1; border: none; background: transparent; color: var(--tx);
    font-family: var(--font-ui); font-size: 14px; line-height: 1.6;
    resize: none; outline: none; max-height: 200px; min-height: 52px; padding: 6px 4px;
  }
  .composer-input::placeholder { color: var(--tx3); }
  .composer-input.busy { opacity: 0.6; }

  .sendc {
    flex: none; width: 34px; height: 34px; border-radius: 50%; border: none;
    background: var(--ac); color: #fff; display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background var(--duration-fast) var(--ease), transform var(--duration-fast) var(--ease);
    box-shadow: 0 2px 8px rgba(79, 168, 255, 0.35);
  }
  .sendc:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }
  .sendc:not(:disabled):hover { background: var(--ac-h); transform: scale(1.06); }
  .sendc:not(:disabled):active { transform: scale(0.95); }

  /* Control row */
  .ctrl { display: flex; align-items: center; gap: 6px; padding: 8px 12px 10px; border-top: 1px solid var(--bd); }
  .mini-toggle {
    padding: 0 10px; height: 30px; border: 1px solid transparent; border-radius: 8px; background: transparent;
    color: var(--tx3); font-size: 10.5px; font-weight: 500; cursor: pointer;
    transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease), border-color var(--duration-fast) var(--ease);
  }
  .mini-toggle:hover { color: var(--tx); background: var(--ac-soft); }
  .mini-toggle.on { background: var(--ac-soft); color: var(--ac); border-color: var(--ac-bd); }

  .tok { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-mono); font-size: 10.5px; color: var(--tx3); }
  .tok.warning { color: var(--warn); }
  .ring { width: 10px; height: 10px; border-radius: 50%; background: conic-gradient(var(--tx2) calc(var(--pct, 0) * 1%), var(--bd) 0); }
  .ring.warning { background: conic-gradient(var(--warn) calc(var(--pct, 0) * 1%), var(--bd) 0); }

  .pill-wrap { position: relative; }
  .mode-pill { border: 1px solid var(--bd); background: var(--l1); }
  .mode-pill .mic { font-size: 11px; }
  .cpill {
    display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 10px;
    border-radius: 8px; font-size: 11px; font-weight: 500; color: var(--tx2);
    border: 1px solid transparent; background: transparent; cursor: pointer;
    transition: background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease);
  }
  .cpill:hover { background: var(--ac-soft); color: var(--tx); }
  .cpill b { color: var(--tx); font-weight: 600; }
  .cpill .psq { width: 10px; height: 10px; border-radius: 3px; background: linear-gradient(135deg, #4fa8ff, #5bc0be); }
  .cpill .sep { width: 1px; height: 12px; background: var(--bd2); }
  .cpill .chev { font-size: 8px; color: var(--tx3); }

  .pop {
    position: absolute; bottom: calc(100% + 6px); right: 0; z-index: 200;
    min-width: 170px; max-height: 300px; overflow-y: auto;
  }
  .pop-item { font-size: 12px; }
  .pop-item.on { color: var(--ac); font-weight: 600; }
  .pop-item .src { margin-left: auto; font-size: 9px; color: var(--tx3); border: 1px solid var(--bd); border-radius: 4px; padding: 1px 5px; }

  /* Mention menu */
  .mention-menu {
    position: absolute; bottom: 100%; left: 0; right: 0; z-index: 200;
    max-height: 240px; overflow-y: auto; margin-bottom: 4px; min-width: 280px;
  }
  .mention-item.selected { background: var(--ac-soft); color: var(--tx); }
  .mention-path { font-family: var(--font-mono); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Compact FAB */
  .fab-row { display: flex; justify-content: flex-end; padding-top: 8px; }
  .fab {
    display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px;
    border-radius: 999px; background: var(--l3); border: 1px solid var(--bd2);
    color: var(--tx2); font-size: 11px; font-weight: 600; cursor: pointer;
    box-shadow: var(--shadow-lg);
    transition: color var(--duration-fast) var(--ease), border-color var(--duration-fast) var(--ease), transform var(--duration-fast) var(--ease);
  }
  .fab:hover { color: var(--ac); border-color: var(--ac); transform: translateY(-1px); }
</style>
