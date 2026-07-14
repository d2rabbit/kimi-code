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
import { messagesToTurns, type ChatTurn } from '../lib/messagesToTurns';
import { setDaemonOrigin } from '../api/config';
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
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

  // Auth
  authProvider: null as { name: string; status: string } | null,

  // Side panel
  detailTarget: null as string | null,

  // File preview panel
  previewPath: null as string | null,
  previewContent: null as string | null,
  previewLoading: false,
  previewError: null as string | null,
  previewMode: 'file' as 'file' | 'diff',
  previewDiff: null as string | null,
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

export const authProvider = $derived(ui.authProvider);

// File preview panel state.
export const previewOpen = $derived(ui.previewPath !== null);
export const previewPath = $derived(ui.previewPath);
export const previewContent = $derived(ui.previewContent);
export const previewLoading = $derived(ui.previewLoading);
export const previewError = $derived(ui.previewError);
export const previewMode = $derived(ui.previewMode);
export const previewDiff = $derived(ui.previewDiff);

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
    // Set the daemon origin BEFORE creating the API singleton — the singleton
    // snapshots the origin at construction time, so it must be correct first.
    if (daemon.state.origin) {
      setDaemonOrigin(daemon.state.origin);
    }

    const a = getApi();

    // Restore persisted appearance preferences (theme + font size).
    try {
      const scheme = localStorage.getItem('kimi-web.color-scheme');
      if (scheme === 'light' || scheme === 'dark' || scheme === 'system') {
        setColorScheme(scheme);
      }
      const fs = localStorage.getItem('kimi-web.ui-font-size');
      if (fs) setUiFontSize(Number(fs));
    } catch {
      // Non-fatal — localStorage may be unavailable.
    }

    // Fire all independent REST calls in parallel for faster startup.
    const [metaR, authR, configR, providersR, workspacesR, sessionsR, modelsR] =
      await Promise.allSettled([
        a.getMeta(),
        a.getAuth(),
        a.getConfig(),
        a.listProviders(),
        a.listWorkspaces(),
        a.listSessions(),
        a.listModels(),
      ]);

    if (metaR.status === 'fulfilled') {
      ui.serverVersion = metaR.value.serverVersion ?? '';
      ui.dangerousBypassAuth = metaR.value.dangerousBypassAuth ?? false;
    }

    if (authR.status === 'fulfilled') {
      ui.authReady = authR.value.ready;
      ui.authProvider = authR.value.managedProvider
        ? { name: authR.value.managedProvider.name ?? 'managed:kimi-code', status: authR.value.managedProvider.status ?? 'unknown' }
        : null;
    }

    if (configR.status === 'fulfilled') {
      ui.config = configR.value;
    }

    ui.providers = providersR.status === 'fulfilled' ? providersR.value : [];
    ui.workspaces = workspacesR.status === 'fulfilled' ? workspacesR.value : [];
    ui.models = modelsR.status === 'fulfilled' ? modelsR.value : [];

    if (sessionsR.status === 'fulfilled') {
      rawState.sessions = sessionsR.value.sessions;
      // Auto-select the first session if any.
      if (rawState.sessions.length > 0 && !rawState.activeSessionId) {
        selectSession(rawState.sessions[0].id);
      }
    }

    // Connect the WebSocket event stream.
    connectEvents();

    ui.initialized = true;
  } finally {
    ui.loading = false;
  }
}

/** Send a desktop notification (uses Notification API, which Tauri's WebView
 *  delegates to the OS notification center). Silently no-ops if permission
 *  hasn't been granted or notifications aren't available. */
function notifyDesktop(title: string, body: string): void {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      void Notification.requestPermission().then((perm) => {
        if (perm === 'granted') new Notification(title, { body });
      });
    }
  } catch {
    // Non-fatal — notifications are best-effort.
  }
}

/** Connect the WS event stream and wire events into the reducer. */
function connectEvents(): void {
  if (eventConn) return;
  const a = getApi();

  const handlers: KimiEventHandlers = {
    onEvent(event: AppEvent, meta: { sessionId: string; seq: number }) {
      // Apply the event to the reducer state.
      const next = reduceAppEvent(rawState, event, meta);
      // Reassign top-level fields to trigger $derived reactivity.
      Object.assign(rawState, next);

      // Track activity.
      if (event.type === 'assistant.completed' || event.type === 'prompt.completed') {
        ui.activity = 'idle';
        ui.isSending = false;
        // Desktop notification on task completion.
        notifyDesktop('任务完成', `${ui.activeWorkspaceId || 'Kimi Code'} 的任务已完成`);
      } else if (event.type === 'assistant.delta' || event.type === 'prompt.submitted') {
        ui.activity = 'running';
      } else if (event.type === 'approval.requested') {
        notifyDesktop('需要审批', 'Agent 请求你的确认');
      } else if (event.type === 'question.requested') {
        notifyDesktop('Agent 提问', 'Agent 需要你的回答');
      }
    },
    onResync(sessionId: string, _currentSeq: number, _epoch?: string) {
      void sessionId;
      void resyncActiveSession();
    },
    onError(code: number, msg: string, fatal: boolean) {
      console.error(`[kimi-desktop-tauri] WS error (code=${code} fatal=${fatal}): ${msg}`);
    },
    onConnectionChange(connected: boolean) {
      ui.connected = connected;
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
      eventConn.seedSnapshot(sid, snapshot);
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

/** Upload an image file to the daemon. Returns the fileId for attaching to a prompt. */
async function uploadImage(file: Blob, name?: string): Promise<{ fileId: string; kind: 'image' | 'video' }> {
  const a = getApi();
  const result = await a.uploadFile({ file, name });
  const kind: 'image' | 'video' = result.mediaType.startsWith('video/') ? 'video' : 'image';
  return { fileId: result.id, kind };
}

// ---------------------------------------------------------------------------
// File preview panel (right-side detail)
// ---------------------------------------------------------------------------

/** Open a file preview in the right panel (reads file content from daemon). */
async function openFilePreview(path: string, mode: 'file' | 'diff' = 'file'): Promise<void> {
  const sid = rawState.activeSessionId;
  if (!sid) return;
  const a = getApi();
  ui.previewPath = path;
  ui.previewMode = mode;
  ui.previewLoading = true;
  ui.previewError = null;
  ui.previewContent = null;
  ui.previewDiff = null;
  ui.detailTarget = 'file';
  try {
    if (mode === 'diff') {
      const result = await a.getFileDiff(sid, path);
      ui.previewDiff = result.diff;
    } else {
      const result = await a.readFile(sid, { path });
      ui.previewContent = result.content;
    }
  } catch (e) {
    ui.previewError = e instanceof Error ? e.message : String(e);
  } finally {
    ui.previewLoading = false;
  }
}

/** Close the file preview panel. */
function closeFilePreview(): void {
  ui.previewPath = null;
  ui.previewContent = null;
  ui.previewDiff = null;
  ui.previewError = null;
  ui.previewLoading = false;
  ui.detailTarget = null;
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
// Config / Provider / Model / Auth management (GUI configuration panel)
// ---------------------------------------------------------------------------
// VERIFIED: the daemon's POST /config uses deepMerge (merge.ts) to recursively
// merge the patch into the existing config. Writing { providers: { "my-id": {...} } }
// adds/updates ONLY that one provider — it does NOT replace the entire providers
// table. The server route converts snake_case sub-keys to camelCase before
// merging (configService.ts:25 convertKeysSnakeToCamel), so we pass snake_case
// keys (api_key, base_url, max_context_size) in the wire body.
// Caveat: deepMerge cannot DELETE fields — editing a provider and leaving a
// field empty means "don't change it", not "clear it". This is a daemon
// limitation (Zod schema rejects null for these optional fields).

/** Update the daemon config via POST /config. */
async function updateConfig(patch: Partial<AppConfig>): Promise<void> {
  const a = getApi();
  const saved = await a.setConfig(patch);
  ui.config = saved;
}

/** Add or update a provider by writing it into config.providers[id]. */
async function saveProvider(
  id: string,
  input: {
    type: string;
    apiKey?: string;
    baseUrl?: string;
    defaultModel?: string;
  },
): Promise<void> {
  const a = getApi();
  // POST /config with the provider merged into providers[id].
  // Wire body uses snake_case; setConfig() handles the camelCase→snake mapping
  // for top-level keys, but provider sub-keys need manual snake-casing.
  const providerEntry: Record<string, unknown> = { type: input.type };
  if (input.apiKey) providerEntry['api_key'] = input.apiKey;
  if (input.baseUrl) providerEntry['base_url'] = input.baseUrl;
  if (input.defaultModel) providerEntry['default_model'] = input.defaultModel;

  await a.setConfig({
    providers: { [id]: providerEntry } as unknown as AppConfig['providers'],
  });
  // Refresh the provider list.
  await refreshProviders();
}

/** Add a model alias by writing it into config.models[alias]. */
async function saveModelAlias(
  alias: string,
  input: {
    provider: string;
    model: string;
    maxContextSize: number;
    displayName?: string;
    capabilities?: string[];
  },
): Promise<void> {
  const a = getApi();
  const modelEntry: Record<string, unknown> = {
    provider: input.provider,
    model: input.model,
    max_context_size: input.maxContextSize,
  };
  if (input.displayName) modelEntry['display_name'] = input.displayName;
  if (input.capabilities) modelEntry['capabilities'] = input.capabilities;

  await a.setConfig({
    models: { [alias]: modelEntry },
  } as unknown as Partial<AppConfig>);
  // Refresh the model list.
  await refreshModels();
}

/** Set the default model via POST /models/:id:set_default (the real endpoint). */
async function setDefaultModel(modelId: string): Promise<void> {
  // The REST endpoint POST /models/<id>:set_default is the cleanest path.
  // But the API client doesn't expose it directly — fall back to POST /config.
  await updateConfig({ defaultModel: modelId });
}

/** Refresh the provider catalog from the daemon. */
async function refreshProviders(): Promise<void> {
  const a = getApi();
  try {
    ui.providers = await a.listProviders();
  } catch {
    // Non-fatal.
  }
}

/** Refresh the model catalog from the daemon. */
async function refreshModels(): Promise<void> {
  const a = getApi();
  try {
    ui.models = await a.listModels();
  } catch {
    // Non-fatal.
  }
}

/** Trigger a remote model refresh for a specific provider. */
async function refreshProviderModels(providerId: string): Promise<void> {
  const a = getApi();
  try {
    await a.refreshProvider(providerId);
    await refreshModels();
  } catch {
    // Non-fatal.
  }
}

/** Check auth status and update authProvider. */
async function checkAuth(): Promise<void> {
  const a = getApi();
  try {
    const auth = await a.getAuth();
    ui.authReady = auth.ready;
    ui.authProvider = auth.managedProvider
      ? { name: auth.managedProvider.name ?? 'managed:kimi-code', status: auth.managedProvider.status ?? 'unknown' }
      : null;
  } catch {
    ui.authReady = false;
  }
}

/** Start the OAuth device flow login. */
async function startOAuthLogin(): Promise<{
  verificationUri: string;
  verificationUriComplete?: string;
  userCode?: string;
  expiresIn?: number;
  interval?: number;
}> {
  const a = getApi();
  const result = await a.startOAuthLogin();
  return {
    verificationUri: result.verificationUri,
    verificationUriComplete: result.verificationUriComplete,
    userCode: result.userCode,
    expiresIn: result.expiresIn,
    interval: result.interval,
  };
}

/** Poll the OAuth login status. */
async function pollOAuthLogin(): Promise<{
  status: string;
} | null> {
  const a = getApi();
  const result = await a.pollOAuthLogin();
  if (!result) return null;
  return { status: result.status };
}

/** Cancel the OAuth login flow. */
async function cancelOAuthLogin(): Promise<void> {
  const a = getApi();
  await a.cancelOAuthLogin();
}

/** Logout (clear OAuth token). */
async function logout(): Promise<void> {
  const a = getApi();
  await a.logout();
  await checkAuth();
}

/** Set the color scheme (appearance — frontend local, not daemon config). */
function setColorScheme(scheme: 'light' | 'dark' | 'system'): void {
  ui.colorScheme = scheme;
  try {
    document.documentElement.dataset.colorScheme = scheme;
    localStorage.setItem('kimi-web.color-scheme', scheme);
  } catch {
    // Non-fatal.
  }
}

/** Set the UI font size (appearance — frontend local). */
function setUiFontSize(size: number): void {
  ui.uiFontSize = size;
  try {
    document.documentElement.style.setProperty('--base-ui-font-size', String(size) + 'px');
    localStorage.setItem('kimi-web.ui-font-size', String(size));
  } catch {
    // Non-fatal.
  }
}

// ---------------------------------------------------------------------------
// Skill management (filesystem CRUD via Tauri commands)
// ---------------------------------------------------------------------------
// The daemon only exposes list + activate for skills — no create/edit/delete.
// These actions call Rust commands that operate directly on
// ~/.kimi-code/skills/<name>/SKILL.md, then refresh the file list.

interface UserSkillFile {
  name: string;
  path: string;
  content: string;
}

const userSkills = $state<UserSkillFile[]>([]);

export const skillFiles = $derived(userSkills);

/** Refresh the user-level skill file list from the filesystem. */
async function refreshUserSkills(): Promise<void> {
  try {
    userSkills = await tauriInvoke<UserSkillFile[]>('list_user_skills');
  } catch {
    // Non-fatal — skills dir may not exist yet.
  }
}

/** Create or overwrite a skill. Returns the file path on success. */
async function saveUserSkill(name: string, content: string): Promise<string> {
  const path = await tauriInvoke<string>('write_user_skill', { name, content });
  await refreshUserSkills();
  return path;
}

/** Delete a user-level skill from the filesystem. */
async function deleteUserSkill(name: string): Promise<void> {
  await tauriInvoke('delete_user_skill', { name });
  await refreshUserSkills();
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const client = {
  // State refs (for direct reads in non-reactive contexts).
  get rawState() { return rawState; },
  get ui() { return ui; },

  // Session / workspace actions.
  load,
  selectSession,
  clearActiveSession,
  openWorkspace,
  sendPrompt,
  startSessionAndSendPrompt,
  abortCurrentPrompt,
  uploadImage,
  openFilePreview,
  closeFilePreview,
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

  // Config / provider / model / auth actions (GUI configuration panel).
  updateConfig,
  saveProvider,
  saveModelAlias,
  setDefaultModel,
  refreshProviders,
  refreshModels,
  refreshProviderModels,
  checkAuth,
  startOAuthLogin,
  pollOAuthLogin,
  cancelOAuthLogin,
  logout,
  setColorScheme,
  setUiFontSize,

  // Skill management (filesystem CRUD).
  refreshUserSkills,
  saveUserSkill,
  deleteUserSkill,
};
