// tooltip.ts — Svelte action: use:tooltip={'文本'}.
// First hover delays 400ms; subsequent hovers are instant (emil rule).
// Positions above by default, flips below when near the viewport top.

interface TooltipState {
  el: HTMLDivElement | null;
  timer: ReturnType<typeof setTimeout> | null;
}

let lastCloseAt = 0;
const FIRST_DELAY_MS = 400;
const INSTANT_WINDOW_MS = 1200;

export function tooltip(node: HTMLElement, text: string) {
  const state: TooltipState = { el: null, timer: null };

  function show() {
    if (!text || state.el) return;
    const rect = node.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'ux-tooltip';
    el.textContent = text;
    document.body.appendChild(el);
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    const above = rect.top > th + 12;
    el.style.left = `${Math.min(Math.max(8, rect.left + rect.width / 2 - tw / 2), window.innerWidth - tw - 8)}px`;
    el.style.top = above ? `${rect.top - th - 6}px` : `${rect.bottom + 6}px`;
    state.el = el;
  }

  function hide() {
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
    if (state.el) { state.el.remove(); state.el = null; lastCloseAt = Date.now(); }
  }

  function onEnter() {
    const delay = Date.now() - lastCloseAt < INSTANT_WINDOW_MS ? 0 : FIRST_DELAY_MS;
    state.timer = setTimeout(show, delay);
  }

  node.addEventListener('pointerenter', onEnter);
  node.addEventListener('pointerleave', hide);
  node.addEventListener('pointerdown', hide);

  return {
    update(next: string) { text = next; },
    destroy() {
      hide();
      node.removeEventListener('pointerenter', onEnter);
      node.removeEventListener('pointerleave', hide);
      node.removeEventListener('pointerdown', hide);
    },
  };
}
