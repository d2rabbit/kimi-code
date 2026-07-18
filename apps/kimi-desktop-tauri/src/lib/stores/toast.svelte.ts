// toast.svelte.ts — global toast store (bottom-center pill, ≤3 stacked).

export type ToastKind = 'ok' | 'err' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

const MAX_TOASTS = 3;
const DURATION_MS = 2200;

let nextId = 1;
let items = $state<ToastItem[]>([]);

function push(kind: ToastKind, text: string) {
  const id = nextId++;
  items = [...items.slice(-(MAX_TOASTS - 1)), { id, kind, text }];
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
  }, DURATION_MS);
}

export const toast = {
  ok: (text: string) => push('ok', text),
  err: (text: string) => push('err', text),
  info: (text: string) => push('info', text),
};

export const toasts = () => items;
