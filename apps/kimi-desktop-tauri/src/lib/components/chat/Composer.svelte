<!-- Composer.svelte — prompt input with auto-resizing textarea + submit. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';

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

  // Auto-resize the textarea.
  $effect(() => {
    void text;
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + 'px';
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    // Enter to send, Shift+Enter for newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!running && text.trim()) {
        onsubmit();
      }
    }
  }
</script>

<div class="composer">
  <div class="composer-inner">
    <textarea
      bind:this={textareaEl}
      bind:value={text}
      onkeydown={handleKeydown}
      placeholder="输入消息… (Enter 发送, Shift+Enter 换行)"
      rows="1"
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      class="composer-input"
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
    <kbd>Enter</kbd> 发送 · <kbd>Shift+Enter</kbd> 换行
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
    transition:
      opacity var(--duration-fast, 120ms),
      transform var(--duration-fast, 120ms);
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
