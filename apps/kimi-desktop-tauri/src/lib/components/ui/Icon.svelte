<!-- Icon.svelte — renders a lucide icon by name. Replaces the old SVG registry. -->
<script lang="ts">
  import type { Component } from 'svelte';
  import {
    Plus, Check, X, Search, Copy, Link as LinkIcon, ExternalLink, Download,
    Undo2, Send, Image as ImageIcon, Settings, SlidersHorizontal, LogIn,
    ChevronDown, ChevronRight, ArrowUp, ArrowDown, ArrowRight, ArrowLeft, Minus,
    PanelRightClose, PanelRightOpen, Maximize2, Minimize2, List, ArrowUpDown,
    GripVertical, Folder, FolderOpen, FolderPlus, File, FileText, FilePen,
    FilePlus2, FileX2, ImageOff, Code, SquareTerminal, Pencil, Wrench,
    Globe, Globe2, Moon, ListChecks, Zap, GitPullRequest, GitBranch, MessageSquare, MessageCircle, Mail,
    User, Info, CircleHelp, TriangleAlert, Clock, Sparkles, Target,
    Pause, Play, Square, Star, MoreHorizontal,
    FilePen as EditIcon, Trash2, Archive, Brain, Minimize2 as ContractIcon,
    CircleAlert, Puzzle, RefreshCw, Server, Wrench as ToolsIcon,
    Store, Code as GithubIcon,
  } from '@lucide/svelte';
  import type { IconName, IconSize } from '../../lib/icon-types';

  const SIZE_PX: Record<IconSize, number> = { sm: 14, md: 16, lg: 20 };

  const ICON_MAP: Record<IconName, Component> = {
    'plus': Plus, 'chat-new': MessageSquare, 'calendar-close': X,
    'calendar-schedule': Clock, 'calendar-todo': ListChecks,
    'close': X, 'check': Check, 'search': Search, 'copy': Copy,
    'link': LinkIcon, 'external-link': ExternalLink, 'download': Download,
    'undo': Undo2, 'send': Send, 'image': ImageIcon, 'settings': Settings,
    'sliders': SlidersHorizontal, 'log-in': LogIn,
    'chevron-down': ChevronDown, 'chevron-right': ChevronRight,
    'arrow-up': ArrowUp, 'arrow-down': ArrowDown, 'arrow-right': ArrowRight,
    'minus': Minus, 'panel-collapse': PanelRightClose, 'panel-expand': PanelRightOpen,
    'expand': Maximize2, 'collapse': Minimize2, 'list': List, 'sort': ArrowUpDown,
    'grip': GripVertical, 'folder': Folder, 'folder-closed': FolderOpen,
    'folder-plus': FolderPlus, 'folder-solid': Folder, 'file': File,
    'file-text': FileText, 'file-edit': FilePen, 'file-plus': FilePlus2,
    'file-off': FileX2, 'image-off': ImageOff, 'code': Code,
    'terminal': SquareTerminal, 'pencil': Pencil, 'tool': Wrench,
    'glob': Globe, 'globe': Globe2, 'moon': Moon, 'check-list': ListChecks,
    'bolt': Zap, 'git-pull-request': GitPullRequest, 'message': MessageCircle,
    'mail': Mail, 'user': User, 'info': Info, 'help-circle': CircleHelp,
    'alert-triangle': TriangleAlert, 'clock': Clock, 'sparkles': Sparkles,
    'target': Target, 'pause': Pause, 'play': Play, 'stop': Square,
    'star': Star, 'star-outline': Star, 'dots-horizontal': MoreHorizontal,
    'arrow-left': ArrowLeft,
    'edit': EditIcon, 'delete': Trash2, 'archive': Archive,
    'git-branch': GitBranch, 'brain': Brain, 'contract': ContractIcon,
    'error-warning': CircleAlert, 'information': Info,
    'plugin': Puzzle, 'refresh': RefreshCw, 'server': Server, 'tools': ToolsIcon,
    'store': Store, 'github': GithubIcon,
  };

  let { name, size = 'md' as IconSize, class: cls = '' }: {
    name: IconName; size?: IconSize; class?: string;
  } = $props();

  const LucideIcon = $derived(ICON_MAP[name] ?? CircleHelp);
  const px = $derived(SIZE_PX[size]);
</script>

<span class="icon-wrap {cls}">
  <LucideIcon size={px} stroke-width={1.5} />
</span>

<style>
  .icon-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
  }
  .icon-wrap :global(svg) {
    display: block;
  }
</style>
