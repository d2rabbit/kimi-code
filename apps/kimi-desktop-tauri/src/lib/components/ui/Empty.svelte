<!-- Empty.svelte — unified empty state: icon + title + description + optional action. -->
<script lang="ts">
  let {
    icon = '◌',
    title,
    desc = '',
    action = '',
    onaction = () => {},
  }: {
    icon?: string;
    title: string;
    desc?: string;
    action?: string;
    onaction?: () => void;
  } = $props();
</script>

<div class="empty">
  <span class="empty-ic">{icon}</span>
  <p class="empty-t">{title}</p>
  {#if desc}<p class="empty-d">{desc}</p>{/if}
  {#if action}
    <button class="empty-btn" type="button" onclick={onaction}>{action}</button>
  {/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 64px 20px;
    text-align: center;
  }
  .empty-ic { font-size: 26px; color: var(--ac); opacity: 0.55; }
  .empty-t { font-size: 13px; font-weight: 500; color: var(--tx2); }
  .empty-d { font-size: 11px; color: var(--tx3); max-width: 320px; line-height: 1.6; }
  .empty-btn {
    margin-top: 6px;
    height: 26px;
    padding: 0 12px;
    border-radius: var(--r-md);
    border: 1px solid var(--ac-bd);
    background: var(--ac-soft);
    color: var(--ac);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color var(--duration-fast) var(--ease), background var(--duration-fast) var(--ease);
  }
  .empty-btn:hover { border-color: var(--ac); }
</style>
