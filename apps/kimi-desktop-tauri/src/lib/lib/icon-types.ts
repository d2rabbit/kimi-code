// icon-types.ts — 图标类型定义（Icon.svelte 和 toolMeta.ts 共享）
// 从原 icons.ts 提取，lucide-svelte 迁移后保留类型兼容性。

export type IconSize = 'sm' | 'md' | 'lg';

export type IconName =
  | 'plus' | 'chat-new' | 'calendar-close' | 'calendar-schedule' | 'calendar-todo'
  | 'close' | 'check' | 'search' | 'copy' | 'link' | 'external-link' | 'download'
  | 'undo' | 'send' | 'image' | 'settings' | 'sliders' | 'log-in'
  | 'chevron-down' | 'chevron-right' | 'arrow-up' | 'arrow-down' | 'arrow-right'
  | 'arrow-left' | 'minus' | 'panel-collapse' | 'panel-expand' | 'expand' | 'collapse'
  | 'list' | 'sort' | 'grip' | 'folder' | 'folder-closed' | 'folder-plus'
  | 'folder-solid' | 'file' | 'file-text' | 'file-edit' | 'file-plus' | 'file-off'
  | 'image-off' | 'code' | 'terminal' | 'pencil' | 'tool' | 'glob' | 'globe' | 'moon'
  | 'check-list' | 'bolt' | 'git-pull-request' | 'git-branch' | 'message' | 'mail'
  | 'user' | 'info' | 'help-circle' | 'alert-triangle' | 'clock' | 'sparkles'
  | 'target' | 'pause' | 'play' | 'stop' | 'star' | 'star-outline' | 'dots-horizontal'
  | 'edit' | 'delete' | 'archive' | 'brain' | 'contract' | 'error-warning'
  | 'information' | 'plugin' | 'refresh' | 'server' | 'tools'
  | 'store' | 'github';

// 临时桩函数 — toolMeta.ts 的字符串渲染将在后续计划中重构为组件方式
export function iconSvg(_name: IconName, _size?: IconSize): string {
  return '';
}
