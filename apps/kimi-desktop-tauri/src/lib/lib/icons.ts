// icons.ts — icon registry for the Tauri desktop app (Svelte 5).
//
// Replaces kimi-web's Vue + unplugin-icons approach with inline SVG path data.
// The public API (IconName, iconSvg, ICON_GROUPS) is kept compatible so that
// copied code (toolMeta.ts etc.) works without changes.
//
// Icons are 24×24, fill or stroke = currentColor. The Svelte <Icon> component
// renders the SVG via {@html iconSvg(name, size)}.
//
// Phase 3 will replace these placeholder paths with the exact Remix/Kimi icon
// outlines. For now they are functional geometric stand-ins.

export type IconSize = 'sm' | 'md' | 'lg';

export const SIZE_PX: Record<IconSize, number> = { sm: 14, md: 16, lg: 20 };

export type IconName =
  | 'plus'
  | 'chat-new'
  | 'calendar-close'
  | 'calendar-schedule'
  | 'calendar-todo'
  | 'close'
  | 'check'
  | 'search'
  | 'copy'
  | 'link'
  | 'external-link'
  | 'download'
  | 'undo'
  | 'send'
  | 'image'
  | 'settings'
  | 'sliders'
  | 'log-in'
  | 'chevron-down'
  | 'chevron-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-right'
  | 'minus'
  | 'panel-collapse'
  | 'panel-expand'
  | 'expand'
  | 'collapse'
  | 'list'
  | 'sort'
  | 'grip'
  | 'folder'
  | 'folder-closed'
  | 'folder-plus'
  | 'folder-solid'
  | 'file'
  | 'file-text'
  | 'file-edit'
  | 'file-plus'
  | 'file-off'
  | 'image-off'
  | 'code'
  | 'terminal'
  | 'pencil'
  | 'tool'
  | 'glob'
  | 'globe'
  | 'check-list'
  | 'bolt'
  | 'git-pull-request'
  | 'message'
  | 'mail'
  | 'user'
  | 'info'
  | 'help-circle'
  | 'alert-triangle'
  | 'clock'
  | 'sparkles'
  | 'target'
  | 'pause'
  | 'play'
  | 'stop'
  | 'star'
  | 'star-outline'
  | 'dots-horizontal';

export interface IconEntry {
  svg: string;
}

// Minimal but recognisable SVG outlines (24×24, currentColor). These are
// geometric placeholders — Phase 3 will swap in the exact Remix/Kimi paths.
function stroke(d: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

function fill(d: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="${d}"/></svg>`;
}

export const ICONS: Record<IconName, IconEntry> = {
  plus: { svg: stroke('M12 5v14M5 12h14') },
  'chat-new': { svg: stroke('M12 5v14M5 12h14M8 4h8a2 2 0 0 1 2 2v10l-3 3H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z') },
  'calendar-close': { svg: stroke('M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9.5 14.5l5 5M14.5 14.5l-5 5') },
  'calendar-schedule': { svg: stroke('M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM12 11v4l2 2') },
  'calendar-todo': { svg: stroke('M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 15l2 2 4-4') },
  close: { svg: stroke('M6 6l12 12M18 6L6 18') },
  check: { svg: stroke('M5 12l5 5L20 7') },
  search: { svg: stroke('M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-4.3-4.3') },
  copy: { svg: stroke('M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1') },
  link: { svg: stroke('M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5') },
  'external-link': { svg: stroke('M14 4h6v6M20 4L10 14M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5') },
  download: { svg: stroke('M12 3v12M7 10l5 5 5-5M5 21h14') },
  undo: { svg: stroke('M9 7L4 12l5 5M4 12h11a5 5 0 0 1 5 5v1') },
  send: { svg: stroke('M12 19V5M5 12l7-7 7 7') },
  image: { svg: stroke('M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM22 15l-5-5L5 21') },
  settings: { svg: stroke('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H10a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V10a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z') },
  sliders: { svg: stroke('M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M12 15v6') },
  'log-in': { svg: stroke('M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3') },
  'chevron-down': { svg: stroke('M6 9l6 6 6-6') },
  'chevron-right': { svg: stroke('M9 6l6 6-6 6') },
  'arrow-up': { svg: stroke('M12 19V5M5 12l7-7 7 7') },
  'arrow-down': { svg: stroke('M12 5v14M19 14l-7 7-7-7') },
  'arrow-right': { svg: stroke('M5 12h14M13 5l7 7-7 7') },
  minus: { svg: stroke('M5 12h14') },
  'panel-collapse': { svg: stroke('M3 5h18v14H3zM9 5v14M15 9l-2 3 2 3') },
  'panel-expand': { svg: stroke('M3 5h18v14H3zM15 5v14M13 9l2 3-2 3') },
  expand: { svg: stroke('M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7') },
  collapse: { svg: stroke('M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7') },
  list: { svg: stroke('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01') },
  sort: { svg: stroke('M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4') },
  grip: { svg: fill('M9 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM18 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z') },
  folder: { svg: stroke('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z') },
  'folder-closed': { svg: stroke('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z') },
  'folder-plus': { svg: stroke('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM12 11v4M10 13h4') },
  'folder-solid': { svg: fill('M5 5h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z') },
  file: { svg: stroke('M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v5h5') },
  'file-text': { svg: stroke('M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v5h5M9 13h6M9 17h6') },
  'file-edit': { svg: stroke('M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v5h5M13 18l-3-3 7-7 3 3-7 7zM10 21l1-3') },
  'file-plus': { svg: stroke('M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v5h5M12 12v4M10 14h4') },
  'file-off': { svg: stroke('M7 3h7l5 5v11M3 3l18 18M7 19a2 2 0 0 1-2-2V8') },
  'image-off': { svg: stroke('M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 3l18 18M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z') },
  code: { svg: stroke('M16 18l6-6-6-6M8 6l-6 6 6 6') },
  terminal: { svg: stroke('M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM7 9l3 3-3 3M13 15h4') },
  pencil: { svg: stroke('M7 17L3 21M7 3l6 6M14 4l3 3-9 9H5v-3l9-9zM17 2l3 3-3 3-3-3 3-3z') },
  tool: { svg: stroke('M14 7a4 4 0 0 1-5.7 5.7L4 17v3h3l4.3-4.3A4 4 0 0 0 17 10l3-3a3 3 0 0 0-6 0z') },
  glob: { svg: stroke('M10 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM5 3l1 2M9 3v6M7 9h4') },
  globe: { svg: stroke('M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18') },
  'check-list': { svg: stroke('M3 6l2 2 3-3M3 14l2 2 3-3M12 7h9M12 15h9') },
  bolt: { svg: stroke('M13 2L4 14h7l-2 8 9-12h-7l2-8z') },
  'git-pull-request': { svg: stroke('M7 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM7 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM5 7v10M19 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM17 9a4 4 0 0 0-4-4h-4') },
  message: { svg: stroke('M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4V7a2 2 0 0 1 2-2z') },
  mail: { svg: stroke('M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 7l9 6 9-6') },
  user: { svg: stroke('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0') },
  info: { svg: stroke('M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 11v5M12 8h.01') },
  'help-circle': { svg: stroke('M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M9.5 9a2.5 2.5 0 1 1 4 2.5c0 1.5-1.5 2-1.5 3.5M12 18h.01') },
  'alert-triangle': { svg: stroke('M12 2l10 18H2L12 2zM12 9v4M12 17h.01') },
  clock: { svg: stroke('M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2') },
  sparkles: { svg: stroke('M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z') },
  target: { svg: stroke('M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0') },
  pause: { svg: fill('M8 5h3v14H8zM13 5h3v14h-3z') },
  play: { svg: fill('M7 4l12 8-12 8V4z') },
  stop: { svg: fill('M6 6h12v12H6z') },
  star: { svg: fill('M12 2l3 7h7l-5.5 4 2 7-6.5-4.5L5.5 20l2-7L2 9h7z') },
  'star-outline': { svg: stroke('M12 2l3 7h7l-5.5 4 2 7-6.5-4.5L5.5 20l2-7L2 9h7z') },
  'dots-horizontal': { svg: fill('M5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm8 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm8 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z') },
};

export function getIcon(name: IconName): IconEntry {
  return ICONS[name];
}

function applySize(svg: string, px: number): string {
  return svg
    .replace(/\s(?:width|height)="[^"]*"/g, '')
    .replace(/^<svg\b/, `<svg class="kw-icon" width="${px}" height="${px}" aria-hidden="true"`);
}

/** Render an icon to a full <svg> string for {@html} contexts. */
export function iconSvg(name: IconName, size: IconSize = 'md'): string {
  const entry = ICONS[name];
  if (!entry) return '';
  return applySize(entry.svg, SIZE_PX[size]);
}

/** Display order + grouping for the icon catalog. */
export const ICON_GROUPS: ReadonlyArray<readonly [string, readonly IconName[]]> = [
  ['Actions', ['plus', 'chat-new', 'close', 'check', 'search', 'copy', 'link', 'external-link', 'download', 'undo', 'send', 'image', 'settings', 'sliders', 'log-in']],
  ['Navigation & layout', ['chevron-down', 'chevron-right', 'arrow-up', 'arrow-down', 'arrow-right', 'minus', 'panel-collapse', 'panel-expand', 'expand', 'collapse', 'list', 'sort', 'grip']],
  ['Files & tools', ['folder', 'folder-closed', 'folder-plus', 'folder-solid', 'file', 'file-text', 'file-edit', 'file-plus', 'file-off', 'image-off', 'code', 'terminal', 'pencil', 'tool', 'glob', 'globe', 'check-list', 'bolt', 'git-pull-request', 'target', 'calendar-schedule', 'calendar-todo', 'calendar-close']],
  ['Communication', ['message', 'mail', 'user']],
  ['Status & media', ['info', 'help-circle', 'alert-triangle', 'clock', 'sparkles', 'pause', 'play', 'stop', 'star', 'star-outline', 'dots-horizontal']],
];
