// client.svelte.ts — the core client store (Svelte 5 runes).
//
// This is the Tauri desktop app's equivalent of kimi-web's `useKimiWebClient`.
// It is the ONLY place that imports from `lib/api/*` — components consume
// derived state ($derived) and call actions, never touching the API directly.
//
// Phase 2 scope: sessions, workspaces, turns, prompts, approvals, questions,
// and core runtime controls (permission, model). Advanced features (swarm,
// goal, side chat, task polling) will be layered on in Phase 4.

import { getKimiWebApi, type KimiWebApi } from '../api';
import type {
  AppConfig,
  AppEvent,
  AppMessage,
  AppApprovalRequest,
  AppSession,
  AppQuestionRequest,
  AppTask,
  AppWarning,
  AppWorkspace,
  AppModel,
  AppProvider,
  AppSkill,
} from '../api/types';
import type { KimiEventHandlers, KimiEventConnection } from '../api/types';
import {
  createInitialState,
  reduceAppEvent,
  type KimiClientState,
} from '../api/daemon/eventReducer';
import { isDaemonApiError, isDaemonNetworkError } from '../api/errors';
import { mergeWorkspaces } from '../lib/mergeWorkspaces';
import {
  reconcileWorkspaceOrder,
  sortByWorkspaceOrder,
} from '../lib/workspaceOrder';
import {
  safeGetString,
  safeSetString,
  STORAGE_KEYS,
} from '../lib/storage';
import { messagesToTurns, type ChatTurn } from '../lib/messagesToTurns';
import { setDaemonOrigin } from '../api/config';
import { daemon } from './daemon.svelte';

// ---------------------------------------------------------------------------
// Reactive state (Svelte 5 runes)
// ---------------------------------------------------------------------------

// The raw reducer state — mutated by reduceAppEvent then reassigned to trigger
// reactivity. Using $state.deep so nested property mutations are tracked.
const rawState = $state<KimiClientState>(createInitialState());

// Extended UI state not covered by the reducer.
const ui = $state({
  activeWorkspaceId: '' as string,
  workspaces: [] as AppWorkspace[],
  workspaceOrder: [] as string[],
  models: [] as AppModel[],
  providers: [] as AppProvider[],
  skills: [] as AppSkill[],
  starredModelIds: [] as string[],
  config: null as AppConfig | null,
  serverVersion: '',
  authReady: false,
  dangerousBypassAuth: false,
  initialized: false,
  connected: false,
  loading: false,
  sessionLoading: false,

  // Runtime controls (per-session, but stored flat for simplicity in Phase 2).
  permission: 'manual' as 'manual' | 'auto' | 'yolo',
  thinking: 'off' as 'off' | 'on' | string,
  planMode: false,
  swarmMode: false,
  goalMode: false,

  // Appearance
  colorScheme: 'system' as 'light' | 'dark' | 'system',
  accent: 'blue' as string,
  uiFontSize: 14 as number,

  // Activity
  activity: 'idle' as 'idle' | 'running',
  isSending: false,
  isStartingFirstPrompt: false,

  // Side panel
  detailTarget: null as string | null,
});

// The WS event connection.
let eventConn: KimiEventConnection | null = null;

// The API singleton (lazily created on first use).
let api: KimiWebApi | null = null;

function getApi(): KimiWebApi {
  if (!api) {
    api = getKimiWebApi();
  }
  return api;
}

// ---------------------------------------------------------------------------
// Derived state (read-only computeds)
// ---------------------------------------------------------------------------

export const sessions = $derived(rawState.sessions);
export const activeSessionId = $derived(rawState.activeSessionId ?? '');
export const workspaces = $derived(ui.workspaces);
export const activeWorkspaceId = $derived(ui.activeWorkspaceId);
export const models = $derived(ui.models);
export const providers = $derived(ui.providers);
export const skills = $derived(ui.skills);
export const config = $derived(ui.config);
export const serverVersion = $derived(ui.serverVersion);
export const authReady = $derived(ui.authReady);
export const initialized = $derived(ui.initialized);
export const connected = $derived(ui.connected);
export const loading = $derived(ui.loading);
export const sessionLoading = $derived(ui.sessionLoading);

export const permission = $derived(ui.permission);
export const thinking = $derived(ui.thinking);
export const planMode = $derived(ui.planMode);
export const swarmMode = $derived(ui.swarmMode);
export const goalMode = $derived(ui.goalMode);

export const colorScheme = $derived(ui.colorScheme);
export const accent = $derived(ui.accent);
export const uiFontSize = $derived(ui.uiFontSize);

export const activity = $derived(ui.activity);
export const isSending = $derived(ui.isSending);
export const isStartingFirstPrompt = $derived(ui.isStartingFirstPrompt);

// The active session object.
export const activeSession = $derived(
  rawState.sessions.find((s) => s.id === rawState.activeSessionId) ?? null,
);

// Messages for the active session.
export const activeMessages = $derived(
  rawState.activeSessionId
    ? (rawState.messagesBySession[rawState.activeSessionId] ?? [])
    : [],
);

// Turns (grouped messages) for the active session.
export const turns = $derived.by<ChatTurn[]>(() => {
  const sid = rawState.activeSessionId;
  if (!sid) return [];
  const msgs = rawState.messagesBySession[sid] ?? [];
  const approvals = rawState.approvalsBySession[sid] ?? [];
  const tasks = rawState.tasksBySession[sid] ?? [];
  return messagesToTurns(msgs, approvals, tasks);
});

// Pending approvals for the active session.
export const pendingApprovals = $derived(
  rawState.activeSessionId
    ? (rawState.approvalsBySession[rawState.activeSessionId] ?? []).filter(
        (a) => a.status === 'pending',
      )
    : [],
);

// Pending questions for the active session.
export const questions = $derived(
  rawState.activeSessionId
    ? (rawState.questionsBySession[rawState.activeSessionId] ?? []).filter(
        (q) => q.status === 'pending',
      )
    : [],
);

// Active tasks for the active session.
export const tasks = $derived(
  rawState.activeSessionId
    ? (rawState.tasksBySession[rawState.activeSessionId] ?? [])
    : [],
);

// Warnings.
export const warnings = $derived(rawState.warnings);

// The visible workspace object.
export const visibleWorkspace = $derived(
  ui.workspaces.find((w) => w.id === ui.activeWorkspaceId) ?? null,
);

// Sessions for the active workspace (or all if no workspace selected).
export const sessionsForView = $derived.by(() => {
  if (!ui.activeWorkspaceId) return rawState.sessions;
  return rawState.sessions.filter(
    (s) => s.workspaceId === ui.activeWorkspaceId,
  );
});

// Default model from config.
export const defaultModel = $derived(ui.config?.defaultModel ?? '');

// Starred models.
export const starredModelIds = $derived(ui.starredModelIds);

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Load initial data: meta, auth, sessions, workspaces, config, models. */
async function load(): Promise<void> {
  ui.loading = true;
  try {
    const a = getApi();

    // Set the daemon origin from the daemon store.
    if (daemon.state.origin) {
      setDaemonOrigin(daemon.state.origin);
    }

    // Fetch meta (server version, capabilities).
    try {
      const meta = await a.getMeta();
      ui.serverVersion = meta.serverVersion ?? '';
      ui.dangerousBypassAuth = meta.dangerousBypassAuth ?? false;
    } catch {
      // Non-fatal — the server might not support /meta yet.
    }

    // Check auth.
    try {
      const auth = await a.getAuth();
      ui.authReady = auth.ready;
    } catch {
      ui.authReady = false;
    }

    // Load config.
    try {
      ui.config = await a.getConfig();
    } catch {
      // Non-fatal.
    }

    // Load workspaces.
    try {
      ui.workspaces = await a.listWorkspaces();
    } catch {
      ui.workspaces = [];
    }

    // Load sessions.
    try {
      const result = await a.listSessions();
      rawState.sessions = result.sessions;
      // Auto-select the first session if any.
      if (rawState.sessions.length > 0 && !rawState.activeSessionId) {
        selectSession(rawState.sessions[0].id);
      }
    } catch {
      rawState.sessions = [];
    }

    // Load models.
    try {
      ui.models = await a.listModels();
    } catch {
      ui.models = [];
    }

    // Connect the WebSocket event stream.
    connectEvents();

    ui.initialized = true;
  } finally {
    ui.loading = false;
  }
}

/** Connect the WS event stream and wire events into the reducer. */
function connectEvents(): void {
  if (eventConn) return;
  const a = getApi();

  const handlers: KimiEventHandlers = {
    onEvent(event: AppEvent, meta?: { seq?: number; sessionId?: string }) {
      // Apply the event to the reducer state.
      const next = reduceAppEvent(rawState, event, meta);
      // Reassign top-level fields to trigger $derived reactivity.
      Object.assign(rawState, next);

      // Track activity.
      if (event.type === 'assistant.completed' || event.type === 'prompt.completed') {
        ui.activity = 'idle';
        ui.isSending = false;
      } else if (event.type === 'assistant.delta' || event.type === 'prompt.submitted') {
        ui.activity = 'running';
      }
    },
    onResyncRequired() {
      // Re-fetch the active session's snapshot.
      void resyncActiveSession();
    },
    onConnected() {
      ui.connected = true;
    },
    onDisconnected() {
      ui.connected = false;
    },
  };

  eventConn = a.connectEvents(handlers);
}

/** Re-sync the active session after a resync_required signal. */
async function resyncActiveSession(): Promise<void> {
  const sid = rawState.activeSessionId;
  if (!sid) return;
  try {
    const a = getApi();
    const snapshot = await a.getSessionSnapshot(sid);
    if (snapshot && eventConn) {
      eventConn.seedSnapshot(snapshot);
    }
  } catch {
    // Best-effort.
  }
}

/** Incremented on each selectSession call to guard against stale async results. */
let selectToken = 0;

/** Select a session: set active + subscribe to its event stream. */
async function selectSession(sessionId: string): Promise<void> {
  const myToken = ++selectToken;
  rawState.activeSessionId = sessionId;
  ui.sessionLoading = true;

  try {
    const a = getApi();
    // Load messages if not already cached.
    if (!rawState.messagesBySession[sessionId]) {
      const result = await a.listMessages(sessionId);
      // Discard if a newer selection has superseded this one.
      if (myToken !== selectToken) return;
      rawState.messagesBySession[sessionId] = result.messages;
    }
    // Subscribe to events — only if this selection is still current.
    if (myToken === selectToken && eventConn) {
      eventConn.subscribe(sessionId);
    }
  } catch {
    // Non-fatal.
  } finally {
    ui.sessionLoading = false;
  }
}

/** Clear the active session (enter "new session" draft mode). */
function clearActiveSession(): void {
  rawState.activeSessionId = undefined;
}

/** Open a workspace. */
function openWorkspace(workspaceId: string): void {
  ui.activeWorkspaceId = workspaceId;
}

/** Send a prompt to the active session. */
async function sendPrompt(
  text: string,
  attachments?: { fileId: string; kind: 'image' | 'video' }[],
): Promise<void> {
  const sid = rawState.activeSessionId;
  const wsId = ui.activeWorkspaceId;
  const a = getApi();

  if (!sid && wsId) {
    // No active session — create one and send the first prompt.
    await startSessionAndSendPrompt(wsId, text, attachments);
    return;
  }
  if (!sid) return;

  ui.isSending = true;
  ui.activity = 'running';

  try {
    await a.submitPrompt(sid, {
      text,
      attachments: attachments ?? [],
    });
  } catch (e) {
    ui.activity = 'idle';
    ui.isSending = false;
    throw e;
  }
}

/** Create a session and send the first prompt. */
async function startSessionAndSendPrompt(
  workspaceId: string,
  text: string,
  attachments?: { fileId: string; kind: 'image' | 'video' }[],
): Promise<void> {
  const a = getApi();
  ui.isSending = true;
  ui.activity = 'running';

  try {
    const session = await a.createSession({ workspaceId });
    rawState.sessions = [...rawState.sessions, session];
    rawState.activeSessionId = session.id;

    // Load messages (empty for new session).
    rawState.messagesBySession[session.id] = [];

    // Subscribe.
    if (eventConn) {
      await eventConn.subscribe(session.id);
    }

    await a.submitPrompt(session.id, {
      text,
      attachments: attachments ?? [],
    });
  } finally {
    ui.isSending = false;
    ui.isStartingFirstPrompt = false;
  }
}

/** Abort the current prompt. */
async function abortCurrentPrompt(): Promise<void> {
  const sid = rawState.activeSessionId;
  if (!sid) return;
  const a = getApi();
  try {
    await a.abortSession(sid);
  } finally {
    ui.activity = 'idle';
    ui.isSending = false;
  }
}

/** Respond to an approval. */
async function respondApproval(
  approvalId: string,
  response: 'approve' | 'reject',
): Promise<void> {
  const sid = rawState.activeSessionId;
  if (!sid) return;
  const a = getApi();
  await a.respondApproval(sid, approvalId, response);
}

/** Respond to a question. */
async function respondQuestion(
  questionId: string,
  response: string,
): Promise<void> {
  const sid = rawState.activeSessionId;
  if (!sid) return;
  const a = getApi();
  await a.respondQuestion(sid, questionId, response);
}

/** Dismiss a question. */
async function dismissQuestion(questionId: string): Promise<void> {
  const sid = rawState.activeSessionId;
  if (!sid) return;
  const a = getApi();
  await a.dismissQuestion(sid, questionId);
}

/** Cancel a background task. */
async function cancelTask(taskId: string): Promise<void> {
  const sid = rawState.activeSessionId;
  if (!sid) return;
  const a = getApi();
  await a.cancelTask(sid, taskId);
}

/** Rename a session. */
async function renameSession(sessionId: string, title: string): Promise<void> {
  const a = getApi();
  await a.updateSession(sessionId, { title });
  rawState.sessions = rawState.sessions.map((s) =>
    s.id === sessionId ? { ...s, title } : s,
  );
}

/** Archive a session. */
async function archiveSession(sessionId: string): Promise<void> {
  const a = getApi();
  await a.archiveSession(sessionId);
  rawState.sessions = rawState.sessions.filter((s) => s.id !== sessionId);
  if (rawState.activeSessionId === sessionId) {
    rawState.activeSessionId = undefined;
  }
}

/** Fork a session. */
async function forkSession(sessionId?: string): Promise<void> {
  const sid = sessionId ?? rawState.activeSessionId;
  if (!sid) return;
  const a = getApi();
  const forked = await a.forkSession(sid);
  rawState.sessions = [...rawState.sessions, forked];
  await selectSession(forked.id);
}

/** Undo the latest exchange. */
async function undo(count?: number): Promise<void> {
  const sid = rawState.activeSessionId;
  if (!sid) return;
  const a = getApi();
  await a.undoSession(sid, count);
}

/** Compact the conversation. */
async function compact(instruction?: string): Promise<void> {
  const sid = rawState.activeSessionId;
  if (!sid) return;
  const a = getApi();
  await a.compactSession(sid, instruction);
}

/** Set the active model. */
async function setModel(modelId: string): Promise<boolean> {
  const sid = rawState.activeSessionId;
  if (!sid) return false;
  const a = getApi();
  try {
    await a.updateSession(sid, { modelId });
    // Update session status.
    rawState.sessions = rawState.sessions.map((s) =>
      s.id === sid ? { ...s, modelId } : s,
    );
    return true;
  } catch {
    return false;
  }
}

/** Set the permission mode. */
function setPermission(mode: 'manual' | 'auto' | 'yolo'): void {
  ui.permission = mode;
}

/** Set the thinking level. */
function setThinking(level: 'off' | 'on' | string): void {
  ui.thinking = level;
}

/** Toggle plan mode. */
function togglePlanMode(): void {
  ui.planMode = !ui.planMode;
}

/** Toggle swarm mode. */
function toggleSwarmMode(): void {
  ui.swarmMode = !ui.swarmMode;
}

/** Toggle goal mode. */
function toggleGoalMode(): void {
  ui.goalMode = !ui.goalMode;
}

/** Add a workspace by path. */
async function addWorkspaceByPath(root: string): Promise<boolean> {
  const a = getApi();
  try {
    const ws = await a.addWorkspace({ root });
    ui.workspaces = [...ui.workspaces, ws];
    ui.activeWorkspaceId = ws.id;
    return true;
  } catch {
    return false;
  }
}

/** Delete a workspace. */
async function deleteWorkspace(id: string): Promise<void> {
  const a = getApi();
  await a.deleteWorkspace(id);
  ui.workspaces = ui.workspaces.filter((w) => w.id !== id);
  if (ui.activeWorkspaceId === id) {
    ui.activeWorkspaceId = '';
  }
}

/** Activate a skill. */
async function activateSkill(name: string, args?: string): Promise<void> {
  const sid = rawState.activeSessionId;
  if (!sid) return;
  const a = getApi();
  await a.activateSkill(sid, name, args);
}

/** Steer queued prompts into the current turn. */
async function steerPrompt(promptIds: string[]): Promise<void> {
  const sid = rawState.activeSessionId;
  if (!sid) return;
  const a = getApi();
  await a.steerPrompts(sid, promptIds);
}

/** Dismiss a warning. */
function dismissWarning(index: number): void {
  if (index < 0) {
    rawState.warnings = [];
  } else {
    rawState.warnings = rawState.warnings.filter((_, i) => i !== index);
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const client = {
  // State refs (for direct reads in non-reactive contexts).
  get rawState() { return rawState; },
  get ui() { return ui; },

  // Actions.
  load,
  selectSession,
  clearActiveSession,
  openWorkspace,
  sendPrompt,
  startSessionAndSendPrompt,
  abortCurrentPrompt,
  respondApproval,
  respondQuestion,
  dismissQuestion,
  cancelTask,
  renameSession,
  archiveSession,
  forkSession,
  undo,
  compact,
  setModel,
  setPermission,
  setThinking,
  togglePlanMode,
  toggleSwarmMode,
  toggleGoalMode,
  addWorkspaceByPath,
  deleteWorkspace,
  activateSkill,
  steerPrompt,
  dismissWarning,
};
