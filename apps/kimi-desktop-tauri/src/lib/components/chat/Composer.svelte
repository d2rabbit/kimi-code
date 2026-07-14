<!-- Composer.svelte — prompt input with auto-resizing textarea, slash menu, and submit. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import SlashMenu from './SlashMenu.svelte';
  import * as client from '../../stores/client.svelte';

  let {
    text = $bindable(''),
    running = false,
    onsubmit,
  }: {
    text: string;
    running: boolean;
    onsubmit: () => void;
  } = $props();

  let textareaEl: HTMLTextAreaElement | null = $state(null);
  let slashActive = $state(false);
  let slashIndex = $state(0);

  // Auto-resize the textarea.
  $effect(() => {
    void text;
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      const h = textareaEl.scrollHeight;
      textareaEl.style.height = Math.min(h, 200) + 'px';
    }
  });

  // Slash command detection: text starts with "/" and has no space yet.
  const slashQuery = $derived(
    text.startsWith('/') && !text.includes(' ') ? text.slice(1) : '',
  );
  const showSlash = $derived(slashQuery !== '' && !running);

  // Reset index when query changes.
  $effect(() => {
    void slashQuery;
    slashIndex = 0;
  });

  function handleKeydown(e: KeyboardEvent) {
    // Slash menu keyboard navigation.
    if (showSlash) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        slashIndex++;
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        slashIndex = Math.max(0, slashIndex - 1);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        text = '';
        return;
      }
    }
    // Enter to send, Shift+Enter for newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showSlash) {
        // If slash menu is open, Enter selects the highlighted command.
        e.stopPropagation();
        // The SlashMenu component handles selection via mousedown,
        // but Enter key is handled here by calling onselect directly.
        // For simplicity, just close the menu and let user confirm.
        // TODO: wire slashIndex → onselect
      }
      if (!running && text.trim()) {
        onsubmit();
      }
    }
  }

  function handleSlashSelect(cmd: string) {
    text = cmd + ' ';
    textareaEl?.focus();
  }
</script>

<div class="composer">
  <div class="composer-inner" style="position: relative;">
    {#if showSlash}
      <SlashMenu
        query={slashQuery}
        skills={client.skills}
        activeIndex={slashIndex}
        onselect={handleSlashSelect}
      />
    {/if}
    <textarea
      bind:this={textareaEl}
      bind:value={text}
      onkeydown={handleKeydown}
      placeholder="输入消息… (Enter 发送, Shift+Enter 换行, / 查看命令)"
      rows="1"
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      class="composer-input"
      class:busy={running}
    ></textarea>
    <button
      class="send-btn"
      disabled={running || !text.trim()}
      onclick={onsubmit}
      type="button"
      aria-label="发送"
    >
      <Icon name="send" size="md" />
    </button>
  </div>
  <div class="composer-hint">
    <kbd>Enter</kbd> 发送 · <kbd>Shift+Enter</kbd> 换行 · <kbd>/</kbd> 命令
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

  .composer-inner {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    background: var(--color-surface, #121214);
    border: 1px solid var(--color-line, #2a2a2e);
    border-radius: var(--radius-lg, 12px);
    padding: 8px 8px 8px 14px;
    transition: border-color var(--duration-fast, 120ms);
  }
  .composer-inner:focus-within {
    border-color: var(--color-accent, #7c8cff);
  }

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
    padding: 4px 0;
  }
  .composer-input::placeholder {
    color: var(--color-text-faint, #6a6a72);
  }
  .composer-input.busy {
    opacity: 0.6;
  }

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
  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .send-btn:not(:disabled):hover {
    opacity: 0.9;
  }
  .send-btn:not(:disabled):active {
    transform: scale(0.95);
  }

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
