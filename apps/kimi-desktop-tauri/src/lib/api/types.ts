// apps/kimi-web/src/api/types.ts
// App-facing camelCase model + KimiWebApi interface.
// No daemon wire details here — Vue components consume only these types.

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface Page<T> {
  items: T[];
  hasMore: boolean;
}

export interface PageRequest {
  beforeId?: string;
  afterId?: string;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export type AppNoticeSeverity = 'info' | 'warning' | 'error';

export interface AppNoticeDetail {
  label: string;
  value: string;
}

export interface AppNotice {
  severity: AppNoticeSeverity;
  title: string;
  message?: string;
  details?: AppNoticeDetail[];
}

export type AppWarning = string | AppNotice;

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export type AppSessionStatus =
  | 'idle'
  | 'running'
  | 'awaitingApproval'
  | 'awaitingQuestion'
  | 'aborted';

export interface AppSessionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalCostUsd: number;
  contextTokens: number;
  contextLimit: number;
  turnCount: number;
}

export interface AppSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: AppSessionStatus;
  archived: boolean;
  currentPromptId?: string;
  /** Text of the most recent user prompt, for search/preview. */
  lastPrompt?: string;
  cwd: string;
  model: string;
  usage: AppSessionUsage;
  messageCount: number;
  lastSeq: number;
  /**
   * The workspace this session belongs to. Present once the daemon ships the
   * workspace registry (returns `workspace_id` on Session). Until then it is
   * undefined and the composable maps sessions to workspaces by cwd === root.
   */
  workspaceId?: string;
  /**
   * Set on a child ("side chat") session — the id of the parent it was forked
   * from. Used to keep child sessions out of the main session list.
   */
  parentSessionId?: string;
}

/**
 * Live runtime state from GET /sessions/{id}/status — the source of truth for
 * the current model + context usage (Session.agent_config.model can be "").
 */
export interface AppSessionRuntimeStatus {
  /** Current model alias, or null if the daemon couldn't resolve it. */
  model: string | null;
  thinkingEffort: string;
  permission: string;
  planMode: boolean;
  swarmMode: boolean;
  contextTokens: number;
  maxContextTokens: number;
  contextUsage: number;
}

// ---------------------------------------------------------------------------
// Workspace — a real folder the client organizes sessions by.
// 1 Workspace : N Sessions. A session inherits the workspace's root as its cwd.
// ---------------------------------------------------------------------------

export interface AppWorkspace {
  /** Stable id. In fallback mode (derived from session cwds) this IS the root. */
  id: string;
  /** Absolute path to the project root. */
  root: string;
  /** Display name — defaults to basename(root), may be renamed on the daemon. */
  name: string;
  /** Whether root is inside a git repository. */
  isGitRepo: boolean;
  /** Current branch, when known. */
  branch?: string;
  /** ISO timestamp of when this workspace was last opened. */
  lastOpenedAt?: string;
  /** Number of sessions belonging to this workspace. */
  sessionCount: number;
}

/** One directory entry from the daemon folder browser (fs:browse). */
export interface FsBrowseEntry {
  name: string;
  path: string;
  isDir: boolean;
  isGitRepo: boolean;
  branch?: string;
}

export interface FsBrowseResult {
  path: string;
  parent: string | null;
  entries: FsBrowseEntry[];
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export type AppMessageRole = 'user' | 'assistant' | 'tool' | 'system';

export type AppMessageContent =
  | { type: 'text'; text: string }
  | { type: 'toolUse'; toolCallId: string; toolName: string; input: unknown; outputLines?: string[] }
  | { type: 'toolResult'; toolCallId: string; output: unknown; isError?: boolean }
  | { type: 'image'; source: ImageSource }
  | { type: 'video'; source: ImageSource }
  | { type: 'file'; fileId: string; name: string; mediaType: string; size: number }
  | { type: 'thinking'; thinking: string; signature?: string }
  | { type: 'unknown'; raw: unknown };

export type ImageSource =
  | { kind: 'url'; url: string }
  | { kind: 'base64'; mediaType: string; data: string }
  | { kind: 'file'; fileId: string };

export interface AppMessage {
  id: string;
  sessionId: string;
  role: AppMessageRole;
  content: AppMessageContent[];
  createdAt: string;
  promptId?: string;
  parentMessageId?: string;
  /** Client-side measured duration from turn.started to turn.ended (ms). */
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Metadata key of the client-side compaction marker message appended on
 * compactionCompleted. The transcript keeps all prior messages (TUI parity);
 * this marker renders as a "context compacted" divider. Snapshot-loaded
 * summary messages (origin kind 'compaction_summary') render the same way
 * but carry no token stats.
 */
export const COMPACTION_MARKER_METADATA_KEY = 'kimiWeb.compaction';

export interface CompactionMarkerMetadata {
  trigger: 'manual' | 'auto';
  tokensBefore?: number;
  tokensAfter?: number;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * Runtime thinking level. 'off' disables extended thinking; 'on' is the
 * enable signal for legacy boolean models (those without `support_efforts`);
 * any other string is a model-declared effort level (e.g. 'low'/'high'/'max').
 *
 * `support_efforts` is the single source of truth for which concrete levels a
 * model accepts; providers silently drop unknown efforts rather than erroring.
 * Collapses to `string` at runtime — this is a semantic marker, not a closed
 * enum. Mirrors kosong's `ThinkingEffort`.
 */
export type ThinkingLevel = 'off' | 'on' | (string & {});

export interface PromptSubmission {
  content: AppMessageContent[];
  metadata?: Record<string, unknown>;
  /** Optional non-main agent id, used by BTW side-channel prompts. */
  agentId?: string;
  /** Agent profile to bind at the target agent's first bind. */
  profile?: string;
  /** The daemon requires these on every prompt (per-prompt, not session-level). */
  model?: string;
  thinking?: ThinkingLevel;
  permissionMode?: 'manual' | 'auto' | 'yolo';
  planMode?: boolean;
  swarmMode?: boolean;
  goalObjective?: string;
  goalControl?: 'pause' | 'resume' | 'cancel';
  /** Client-managed session tool denylist: full-replace on every submit. */
  disabledTools?: string[];
}

export interface PromptSubmitResult {
  promptId: string;
  userMessageId: string;
  /** 'running' when the prompt started a turn immediately; 'queued' when
      another prompt is active and the daemon parked it (steerable);
      'blocked' when rejected before a turn was launched. */
  status?: 'running' | 'queued' | 'blocked';
}

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

export type ApprovalDecision = 'approved' | 'rejected' | 'cancelled';

export interface ApprovalResponse {
  decision: ApprovalDecision;
  scope?: 'session';
  feedback?: string;
  selectedLabel?: string;
}

export interface AppApprovalRequest {
  approvalId: string;
  sessionId: string;
  turnId?: number;
  toolCallId: string;
  toolName: string;
  action: string;
  display: unknown; // ToolInputDisplay — Web renders what it knows, falls back to generic
  expiresAt: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Question
// ---------------------------------------------------------------------------

export interface QuestionOption {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface QuestionItem {
  id: string;
  question: string;
  header?: string;
  body?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
  allowOther?: boolean;
  otherLabel?: string;
  otherDescription?: string;
}

export interface AppQuestionRequest {
  questionId: string;
  sessionId: string;
  turnId?: number;
  toolCallId?: string;
  questions: QuestionItem[];
  createdAt: string;
}

export type QuestionAnswer =
  | { kind: 'single'; optionId: string }
  | { kind: 'multi'; optionIds: string[] }
  | { kind: 'other'; text: string }
  | { kind: 'multiWithOther'; optionIds: string[]; otherText: string }
  | { kind: 'skipped' };

export interface QuestionResponse {
  answers: Record<string, QuestionAnswer>;
  method?: 'enter' | 'space' | 'number_key' | 'click';
  note?: string;
}

// ---------------------------------------------------------------------------
// Background Task
// ---------------------------------------------------------------------------

export type AppTaskStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type AppSubagentPhase = 'queued' | 'working' | 'suspended' | 'completed' | 'failed';

export interface AppTask {
  id: string;
  sessionId: string;
  kind: 'subagent' | 'bash' | 'tool';
  description: string;
  status: AppTaskStatus;
  command?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  outputPreview?: string;
  outputBytes?: number;
  outputLines?: string[]; // accumulated by eventReducer from task.progress chunks
  /** The subagent's concatenated live output (assistant.delta), accumulated by
   *  the event reducer from `taskProgress` chunks of kind `text`. Grows in the
   *  right-side detail panel like a thinking block. */
  text?: string;
  subagentPhase?: AppSubagentPhase;
  subagentType?: string;
  /** Subagent tasks only: the display-normalized model alias the child is bound to. */
  model?: string;
  /** Subagent tasks only: the child's effective thinking effort at spawn. */
  thinkingEffort?: string;
  parentToolCallId?: string;
  suspendedReason?: string;
  swarmIndex?: number;
  /** True only for subagents detached into the background task store. Drives
   *  the dock: the dock lists background subagents, while foreground subagents
   *  render inline in the message flow as the `Agent` tool card. */
  runInBackground?: boolean;
}

// ---------------------------------------------------------------------------
// Goal
// ---------------------------------------------------------------------------

export type AppGoalStatus = 'active' | 'paused' | 'blocked' | 'complete';

export interface AppGoal {
  goalId: string;
  objective: string;
  completionCriterion?: string;
  status: AppGoalStatus;
  turnsUsed: number;
  tokensUsed: number;
  wallClockMs: number;
  terminalReason?: string;
  budget: {
    tokenBudget: number | null;
    remainingTokens: number | null;
    turnBudget: number | null;
    remainingTurns: number | null;
    wallClockBudgetMs: number | null;
    remainingWallClockMs: number | null;
    overBudget: boolean;
  };
}

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------

export type AppTerminalStatus = 'running' | 'exited';

export interface AppTerminal {
  id: string;
  sessionId: string;
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
  status: AppTerminalStatus;
  createdAt: string;
  exitedAt?: string;
  exitCode?: number | null;
}

// ---------------------------------------------------------------------------
// File System
// ---------------------------------------------------------------------------

export type FsKind = 'file' | 'directory' | 'symlink';

export interface FsEntry {
  path: string;
  name: string;
  kind: FsKind;
  size?: number;
  modifiedAt: string;
  etag?: string;
  mime?: string;
  languageId?: string;
  isBinary?: boolean;
  isSymlinkTo?: string;
  gitStatus?: string;
  childCount?: number;
}

// ---------------------------------------------------------------------------
// Events (app-facing, camelCase)
// ---------------------------------------------------------------------------

export type AppEvent =
  | { type: 'sessionCreated'; session: AppSession }
  | { type: 'workspaceCreated'; workspace: AppWorkspace }
  | { type: 'workspaceUpdated'; workspace: AppWorkspace }
  | { type: 'workspaceDeleted'; workspaceId: string; root: string }
  | { type: 'sessionUpdated'; session: AppSession; changedFields: string[] }
  | { type: 'sessionDeleted'; sessionId: string }
  | { type: 'sessionStatusChanged'; sessionId: string; status: AppSessionStatus; previousStatus: AppSessionStatus; currentPromptId?: string }
  | { type: 'sessionWorkChanged'; sessionId: string; busy?: boolean; mainTurnActive?: boolean; pendingInteraction?: boolean; lastTurnReason?: string }
  | { type: 'sessionMetaUpdated'; sessionId: string; title?: string; lastPrompt?: string }
  | { type: 'sessionUsageUpdated'; sessionId: string; usage: AppSessionUsage; model?: string; swarmMode?: boolean; planMode?: boolean }
  | { type: 'historyCompacted'; sessionId: string; beforeSeq: number; reason: string; summaryMessageId?: string }
  | { type: 'compactionStarted'; sessionId: string; trigger: 'manual' | 'auto'; instruction?: string }
  | { type: 'compactionCompleted'; sessionId: string; tokensBefore?: number; tokensAfter?: number; summary?: string }
  | { type: 'compactionCancelled'; sessionId: string }
  | { type: 'messageCreated'; message: AppMessage }
  | { type: 'messageUpdated'; sessionId: string; messageId: string; content: AppMessageContent[]; status: 'pending' | 'completed' | 'error'; durationMs?: number }
  | { type: 'assistantDelta'; sessionId: string; messageId: string; contentIndex: number; delta: { text?: string; thinking?: string } }
  // Side-channel / non-main-agent streaming: carries text/thinking deltas for a
  // specific agent (e.g. a BTW side chat) without folding them into the parent
  // transcript. The web layer routes these to the side-chat panel.
  | { type: 'agentDelta'; sessionId: string; agentId: string; delta: { text?: string; thinking?: string } }
  | { type: 'agentTurnEnded'; sessionId: string; agentId: string; reason?: string }
  | { type: 'toolOutput'; sessionId: string; toolCallId: string; outputChunk: string; stream: 'stdout' | 'stderr' }
  | { type: 'approvalRequested'; sessionId: string; approval: AppApprovalRequest }
  | { type: 'approvalResolved'; sessionId: string; approvalId: string; decision: ApprovalDecision; resolvedAt: string }
  | { type: 'approvalExpired'; sessionId: string; approvalId: string }
  | { type: 'questionRequested'; sessionId: string; question: AppQuestionRequest }
  | { type: 'questionAnswered'; sessionId: string; questionId: string; resolvedAt: string }
  | { type: 'questionDismissed'; sessionId: string; questionId: string; dismissedAt: string }
  | { type: 'taskCreated'; sessionId: string; task: AppTask }
  | {
      type: 'taskProgress';
      sessionId: string;
      taskId: string;
      outputChunk: string;
      stream: 'stdout' | 'stderr';
      /**
       * `line` (default) appends a new progress line (tool-call / tool-progress).
       * `text` concatenates onto the subagent's growing streamed output
       * (`AppTask.text`), shown live in the detail panel like a thinking block.
       */
      kind?: 'line' | 'text';
    }
  | { type: 'taskCompleted'; sessionId: string; taskId: string; status: AppTaskStatus; outputPreview?: string; outputBytes?: number }
  // Prompt lifecycle (durable — server-authoritative prompt state machine)
  | { type: 'promptSubmitted'; sessionId: string; promptId: string; status: 'running' | 'queued' | 'blocked' }
  | { type: 'promptCompleted'; sessionId: string; promptId: string; reason: 'completed' | 'failed' | 'blocked' }
  | { type: 'promptAborted'; sessionId: string; promptId: string }
  | { type: 'promptSteered'; sessionId: string; activePromptId: string; promptIds: string[] }
  | { type: 'goalUpdated'; sessionId: string; goal: AppGoal | null }
  | { type: 'configChanged'; changedFields: string[]; config: AppConfig }
  | {
      type: 'modelCatalogChanged';
      changed: { providerId: string; providerName: string; added: number; removed: number }[];
      unchanged: string[];
      failed: { provider: string; reason: string }[];
    }
  | { type: 'unknown'; raw: unknown };

// ---------------------------------------------------------------------------
// WebSocket connection helpers
// ---------------------------------------------------------------------------

/** Per-session sync cursor (v2): durable seq + journal epoch. */
export interface AppSessionCursor {
  seq: number;
  epoch?: string;
}

/** In-flight (mid-turn) state recovered from the session snapshot. */
export interface AppInFlightToolCall {
  toolCallId: string;
  name: string;
  args?: unknown;
  description?: string;
  lastProgress?: { kind: string; text?: string; percent?: number };
}

export interface AppInFlightTurn {
  turnId: number;
  assistantText: string;
  thinkingText: string;
  runningTools: AppInFlightToolCall[];
  /** Authoritative daemon prompt_id for the active prompt, if known. */
  promptId?: string;
}

/**
 * IM-style initial sync result: everything needed to rebuild a session's UI
 * state, consistent at `asOfSeq`. The standard flow is
 * `getSessionSnapshot()` → `subscribe(sessionId, {seq: asOfSeq, epoch})`.
 */
export interface AppSessionSnapshot {
  asOfSeq: number;
  epoch: string;
  session: AppSession;
  /** Most recent messages, chronological ascending. */
  messages: AppMessage[];
  hasMoreMessages: boolean;
  inFlightTurn: AppInFlightTurn | null;
  /** Roster of live subagent tasks — rebuilds swarm cards on reconnect. */
  subagents?: AppTask[];
  pendingApprovals: AppApprovalRequest[];
  pendingQuestions: AppQuestionRequest[];
}

/** Plan review info from GET /sessions/{id}/transcript/plan (#2094). */
export interface AppTranscriptPlanReview {
  state: 'pending' | 'approved' | 'rejected' | 'cancelled';
  selectedOption?: string;
  feedback?: string;
}
export interface AppTranscriptPlanEntry {
  toolCallId: string;
  turnId: number;
  source: 'interaction' | 'display' | 'output';
  plan: string;
  path?: string;
  options?: Array<{ label: string; description?: string }>;
  review?: AppTranscriptPlanReview;
}
export interface AppTranscriptPlanResponse {
  agentId: string;
  plans: AppTranscriptPlanEntry[];
}

/** Managed account plan usage (GET /oauth/usage). */
export interface AppUsageWindow {
  duration: number;
  unit: 'minute' | 'hour' | 'day' | 'week';
}

/** One structured quota row of the managed account. */
export interface AppUsageRow {
  name?: string;
  window?: AppUsageWindow;
  used: number;
  limit: number;
  resetAt?: string;
}

export interface AppBoosterWallet {
  balanceCents: number;
  totalCents: number;
  monthlyChargeLimitEnabled: boolean;
  monthlyChargeLimitCents: number;
  monthlyUsedCents: number;
  currency: string;
}

/** Managed account usage (GET /oauth/usage, kind=ok 时返回) */
export interface AppManagedUsage {
  summary?: AppUsageRow;
  limits: AppUsageRow[];
  extraUsage?: AppBoosterWallet;
}

/** Current account identity from the access token's JWT claims (GET /oauth/account). */
export interface AppOAuthAccount {
  userId: string;
  scope?: string;
  expiresAt?: number;
}

/** Managed account profile returned by GET /oauth/userinfo. */
export interface AppManagedUserInfo {
  userId: string;
  nickname: string;
  status: string;
  region: string;
  userLevel: number;
  userLevelName: string;
  domain: number;
  domainName: string;
  globalId?: string;
  bio?: string;
  avatar?: string;
  username?: string;
  email?: string;
  phone?: { countryCode: string; number: string };
  createdTime?: string;
  lastLoginTime?: string;
}

export interface AppMessageSearchInput {
  query: string;
  mode?: 'terms' | 'literal';
  op?: 'AND' | 'OR';
  sessionId?: string;
  agentId?: string;
  role?: 'user' | 'assistant' | 'title';
  sort?: 'score' | 'time_desc' | 'time_asc';
  pageSize?: number;
  pageToken?: string;
}

export interface AppMessageSearchHit {
  sessionId: string;
  workspaceId: string;
  sessionTitle: string;
  agentId: string;
  role: 'user' | 'assistant' | 'title';
  snippet: string;
  time: number;
  turn?: number;
  stepId?: string;
  score: number;
}

export interface AppMessageSearchPage {
  items: AppMessageSearchHit[];
  hasMore: boolean;
  pageToken?: string;
  incomplete?: 'candidate_cap';
  source: 'live' | 'index';
}

/** Tool descriptor with active state (GET /tools). */
export interface AppToolDescriptor {
  name: string;
  description: string;
  inputSchema: unknown;
  source: 'builtin' | 'skill' | 'mcp';
  mcpServerId?: string;
  active?: boolean;
}

/** Attached WS client (GET /connections). */
export interface AppConnection {
  id: string;
  hasClientHello: boolean;
  subscriptions: string[];
  connectedAt: string;
}

export interface KimiEventHandlers {
  onEvent(event: AppEvent, meta: { sessionId: string; seq: number }): void;
  onResync(sessionId: string, currentSeq: number, epoch?: string): void;
  onError(code: number, msg: string, fatal: boolean): void;
  onConnectionChange(connected: boolean): void;
  onTerminalOutput?(sessionId: string, terminalId: string, data: string, seq: number): void;
  onTerminalExit?(sessionId: string, terminalId: string, exitCode: number | null): void;
}

export interface KimiEventConnection {
  subscribe(sessionId: string, cursor?: AppSessionCursor): void;
  unsubscribe(sessionId: string): void;
  /**
   * Bind the real daemon prompt_id to the next turn for a session, so the
   * client-side projector stops synthesizing a random promptId on turn.started.
   * Call right after submitPrompt() returns.
   */
  bindNextPromptId(sessionId: string, promptId: string): void;
  /**
   * Seed the client-side projector with a snapshot's in-flight turn so a
   * reconnecting client renders mid-turn state immediately; emits the
   * corresponding AppEvents through `onEvent`. Resets per-session projector
   * state first — call BEFORE subscribe(), with the snapshot's cursor.
   */
  seedSnapshot(sessionId: string, snapshot: AppSessionSnapshot): void;
  abort(sessionId: string, promptId: string): void;
  terminalAttach(sessionId: string, terminalId: string, sinceSeq?: number): void;
  terminalInput(sessionId: string, terminalId: string, data: string): void;
  terminalResize(sessionId: string, terminalId: string, cols: number, rows: number): void;
  terminalDetach(sessionId: string, terminalId: string): void;
  terminalClose(sessionId: string, terminalId: string): void;
  /**
   * Mark an agent as a side-channel (e.g. BTW side chat). The client-side
   * projector will then emit its text/thinking deltas as agent-scoped events
   * instead of dropping them like background subagents.
   */
  markSideChannelAgent(agentId: string): void;
  /**
   * Report the underlying socket's health. Used to detect a silent-half-open
   * connection after the tab was frozen in the background: the browser still
   * reports OPEN (so no auto-reconnect) yet no frames have arrived for a while.
   */
  health(): { connected: boolean; open: boolean; stale: boolean };
  /**
   * Force a clean reconnect of the underlying socket. Used to recover from a
   * silent-half-open (background-tab freeze) where onclose never fires. The
   * reconnect handshake re-subscribes at the last durable cursor. No-op after
   * close().
   */
  reconnect(): void;
  close(): void;
}

// ---------------------------------------------------------------------------
// Model + Provider (app-facing, camelCase)
// PRESUMED — not in current daemon docs; isolated in adapter, swap when backend defines them.
// ---------------------------------------------------------------------------

export interface AppModel {
  /** Unique identifier for this model (the string passed to PATCH session agent_config.model) */
  id: string;
  /** Provider id this model belongs to */
  provider: string;
  /** Raw model name (e.g. "moonshot-v1-128k") */
  model: string;
  /** Optional human-readable display name */
  displayName?: string;
  /** Maximum context size in tokens */
  maxContextSize: number;
  /** Optional capability tags (e.g. ["vision", "thinking"]) */
  capabilities?: string[];
  /** Effort levels this model supports for extended thinking (e.g. ["low", "high", "max"]).
      Sourced from the model catalog (managed) or config [models.<id>.overrides]. */
  supportEfforts?: readonly string[];
  /** Catalog-declared default effort for extended thinking. */
  defaultEffort?: string;
}

export interface AppProvider {
  /** Provider id */
  id: string;
  /** Provider type (e.g. "moonshot", "anthropic", "openai", "custom") */
  type: string;
  /** Optional custom base URL */
  baseUrl?: string;
  /** Optional default model alias */
  defaultModel?: string;
  /** Whether an API key is stored for this provider */
  hasApiKey: boolean;
  /** Provider connectivity status */
  status: 'connected' | 'error' | 'unconfigured';
  /** Model ids available from this provider */
  models?: string[];
}

export interface ProviderRefreshResult {
  changed: Array<{
    providerId: string;
    providerName: string;
    added: number;
    removed: number;
  }>;
  unchanged: string[];
  failed: Array<{ provider: string; reason: string }>;
}

export interface AppConfigProvider {
  type: string;
  baseUrl?: string;
  defaultModel?: string;
  hasApiKey: boolean;
}

export interface AppConfig {
  providers: Record<string, AppConfigProvider>;
  defaultProvider?: string;
  defaultModel?: string;
  models?: Record<string, unknown>;
  thinking?: { enabled?: boolean; effort?: string };
  planMode?: boolean;
  yolo?: boolean;
  defaultPermissionMode?: string;
  defaultPlanMode?: boolean;
  permission?: unknown;
  hooks?: unknown[];
  services?: unknown;
  mergeAllAvailableSkills?: boolean;
  extraSkillDirs?: string[];
  extraAgentDirs?: string[];
  loopControl?: unknown;
  background?: unknown;
  experimental?: Record<string, boolean>;
  telemetry?: boolean;
  /** Secondary model for subagents (#2064). */
  secondaryModel?: AppSecondaryModel;
  /** Global MCP server timeout config (#2065). */
  mcp?: { startupTimeoutMs?: number; toolTimeoutMs?: number };
  raw?: Record<string, unknown>;
}

/** Secondary model recipe — subagents can run on this instead of the primary model. */
export interface AppSecondaryModel {
  model?: string;
  maxContextSize?: number;
  maxInputSize?: number;
  maxOutputSize?: number;
  capabilities?: string[];
  displayName?: string;
  reasoningKey?: string;
  adaptiveThinking?: boolean;
  supportEfforts?: string[];
  defaultEffort?: string;
  offEffort?: string;
}

/** A session-scoped skill the user can invoke from the slash menu. */
export interface AppSkill {
  name: string;
  description: string;
  /** Skill source (e.g. 'builtin' | 'project' | 'plugin') for grouping/labels. */
  source: string;
}

// ---------------------------------------------------------------------------
// KimiWebApi — the app-facing interface
// ---------------------------------------------------------------------------

export interface AppSessionWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

/** One prompt in the session's prompt list (active or queued). */
export interface AppPromptItem {
  promptId: string;
  userMessageId: string;
  status: 'running' | 'queued' | 'blocked';
  /** Plain-text projection of the prompt content (non-text parts as [type]). */
  text: string;
  createdAt: string;
}

/** An installed plugin (daemon REST /plugins). */
export interface AppPluginSummary {
  id: string;
  displayName: string;
  version?: string;
  enabled: boolean;
  state: 'ok' | 'error';
  skillCount: number;
  mcpServerCount: number;
  hookCount: number;
  commandCount: number;
  hasErrors: boolean;
  source: 'local-path' | 'zip-url' | 'github';
  originalSource?: string;
}

/** A marketplace registry entry merged with install state. */
export interface AppMarketplaceEntry {
  id: string;
  displayName: string;
  source: string;
  tier?: 'official' | 'curated';
  version?: string;
  description?: string;
  homepage?: string;
  keywords?: string[];
  /** Server-injected built-in capability row (Computer Use / WebBridge). */
  builtIn?: boolean;
  installed: boolean;
  installedVersion?: string;
  enabled?: boolean;
  updateAvailable: boolean;
}

/** An agent profile spawnable in a session (builtin or file-defined). */
export interface AppAgentProfile {
  name: string;
  description?: string;
  whenToUse?: string;
  /** Tool allowlist; absent = every tool. */
  tools?: string[];
  disallowedTools?: string[];
  /** Subagent profile names this agent may delegate to; absent = any type. */
  subagents?: string[];
  modelPreference?: 'primary' | 'secondary';
}

/** A cron task scheduled in a session. */
export interface AppCronTask {
  id: string;
  /** 5-field cron expression (minute hour day-of-month month day-of-week). */
  cron: string;
  prompt: string;
  createdAt: number;
  recurring: boolean;
  lastFiredAt?: number;
}

export interface KimiWebApi {
  getHealth(): Promise<{ status: 'ok'; uptimeSec: number }>;
  getMeta(): Promise<{ serverVersion: string; serverId: string; startedAt: string; capabilities: Record<string, boolean>; openInApps: string[]; dangerousBypassAuth: boolean }>;
  listSessions(input?: PageRequest & { status?: AppSessionStatus; workspaceId?: string; includeArchive?: boolean; archivedOnly?: boolean; excludeEmpty?: boolean }): Promise<Page<AppSession>>;
  createSession(input: { title?: string; cwd?: string; model?: string; workspaceId?: string }): Promise<AppSession>;
  /** Fetch one session by id (deep links beyond the first listSessions page). */
  getSession(sessionId: string): Promise<AppSession>;
  updateSession(sessionId: string, input: { title?: string; cwd?: string; model?: string; permissionMode?: string; planMode?: boolean; swarmMode?: boolean; goalObjective?: string; goalControl?: 'pause' | 'resume' | 'cancel'; thinking?: string }): Promise<AppSession>;
  getSessionStatus(sessionId: string): Promise<AppSessionRuntimeStatus>;
  getSessionWarnings(sessionId: string): Promise<AppSessionWarning[]>;
  /** Current goal snapshot for a session (null when none is active). */
  getSessionGoal(sessionId: string): Promise<AppGoal | null>;
  /** List cron tasks scheduled in a session. */
  listCronTasks(sessionId: string): Promise<AppCronTask[]>;
  /** Create a cron task in a session. */
  createCronTask(sessionId: string, input: { cron: string; prompt: string; recurring?: boolean }): Promise<AppCronTask>;
  /** Delete a cron task (idempotent — false when already absent). */
  deleteCronTask(sessionId: string, taskId: string): Promise<{ deleted: boolean }>;
  /** List the agent profiles (builtin + file-defined) spawnable in a session. */
  listAgentProfiles(sessionId: string): Promise<AppAgentProfile[]>;
  /** List installed plugins. */
  listPlugins(): Promise<AppPluginSummary[]>;
  /** Browse the plugin marketplace registry, merged with install state. */
  getPluginMarketplace(): Promise<{ source: string; plugins: AppMarketplaceEntry[] }>;
  /** Install a plugin from a source (GitHub URL / zip URL / local path). */
  installPlugin(source: string): Promise<AppPluginSummary>;
  /** Enable or disable a plugin. */
  togglePlugin(id: string, enabled: boolean): Promise<void>;
  /** Uninstall a plugin. */
  removePlugin(id: string): Promise<{ removed: boolean }>;
  archiveSession(sessionId: string): Promise<{ archived: true }>;
  restoreSession(sessionId: string): Promise<AppSession>;
  listMessages(sessionId: string, input?: PageRequest & { role?: AppMessageRole }): Promise<Page<AppMessage>>;
  /** v2 initial sync: atomic session state + `asOfSeq` watermark + epoch. */
  getSessionSnapshot(sessionId: string): Promise<AppSessionSnapshot>;
  /** GET /sessions/{id}/transcript/plan — plan review info (#2094). */
  getTranscriptPlan(sessionId: string, agentId: string, toolCallId?: string): Promise<AppTranscriptPlanResponse>;
  submitPrompt(sessionId: string, input: PromptSubmission): Promise<PromptSubmitResult>;
  /** Steer daemon-queued prompts into the active turn (TUI ctrl+s). */
  /** Steer daemon-queued prompts into the active turn (TUI ctrl+s). */
  steerPrompts(sessionId: string, promptIds: string[]): Promise<{ steered: boolean; promptIds: string[] }>;
  /** List the active prompt and queued prompts for a session. */
  listPrompts(sessionId: string): Promise<{ active: AppPromptItem | null; queued: AppPromptItem[] }>;
  abortPrompt(sessionId: string, promptId: string): Promise<{ aborted: boolean; atSeq?: number }>;
  /** Cancel whatever is running in the session, including skill activations. */
  abortSession(sessionId: string): Promise<{ aborted: boolean }>;
  compactSession(sessionId: string, instruction?: string): Promise<void>;
  undoSession(sessionId: string, count?: number): Promise<void>;
  forkSession(sessionId: string, input?: { title?: string }): Promise<AppSession>;
  /** Create a child session under a parent — POST /sessions/{id}/children. */
  createChildSession(sessionId: string, input?: { title?: string }): Promise<AppSession>;
  /** List a session's child sessions — GET /sessions/{id}/children. */
  listChildSessions(sessionId: string): Promise<AppSession[]>;
  /** Start a BTW side-channel agent under the session — POST /sessions/{id}:btw. */
  startBtw(sessionId: string): Promise<{ agentId: string }>;
  respondApproval(sessionId: string, approvalId: string, response: ApprovalResponse): Promise<{ resolved: true; resolvedAt: string }>;
  respondQuestion(sessionId: string, questionId: string, response: QuestionResponse): Promise<{ resolved: true; resolvedAt: string }>;
  dismissQuestion(sessionId: string, questionId: string): Promise<{ dismissed: true; dismissedAt: string }>;
  listSkills(sessionId: string): Promise<AppSkill[]>;
  /** List skills for a workspace (no session required) — GET /workspaces/{id}/skills. */
  listSkillsForWorkspace(workspaceId: string): Promise<AppSkill[]>;
  activateSkill(sessionId: string, skillName: string, args?: string): Promise<{ activated: true; skillName: string }>;
  listTasks(sessionId: string, status?: AppTaskStatus): Promise<AppTask[]>;
  getTask(sessionId: string, taskId: string, input?: { withOutput?: boolean; outputBytes?: number }): Promise<AppTask>;
  cancelTask(sessionId: string, taskId: string): Promise<{ cancelled: true }>;
  listTerminals(sessionId: string): Promise<AppTerminal[]>;
  createTerminal(sessionId: string, input?: { cwd?: string; shell?: string; cols?: number; rows?: number }): Promise<AppTerminal>;
  getTerminal(sessionId: string, terminalId: string): Promise<AppTerminal>;
  closeTerminal(sessionId: string, terminalId: string): Promise<{ closed: true }>;
  listDirectory(sessionId: string, input: { path?: string; depth?: number; includeGitStatus?: boolean }): Promise<{ items: FsEntry[]; childrenByPath?: Record<string, FsEntry[]>; truncated: boolean }>;
  readFile(sessionId: string, input: { path: string; offset?: number; length?: number }): Promise<{ path: string; content: string; encoding: 'utf-8' | 'base64'; size: number; truncated: boolean; etag: string; mime: string; languageId?: string; lineCount?: number; isBinary: boolean }>;
  /** Search files in a workspace (no session required) — POST /workspace/fs:search. `workspace` accepts a registered workspace id or an absolute root. */
  searchFiles(workspace: string, input: { query: string; limit?: number }): Promise<{ items: Array<{ path: string; name: string; kind: FsKind; score: number; matchPositions: number[] }>; truncated: boolean }>;
  grepFiles(sessionId: string, input: { pattern: string; regex?: boolean; caseSensitive?: boolean }): Promise<{ files: Array<{ path: string; matches: Array<{ line: number; col: number; text: string; before: string[]; after: string[] }> }>; filesScanned: number; truncated: boolean; elapsedMs: number }>;
  getGitStatus(sessionId: string, paths?: string[]): Promise<{ branch: string; ahead: number; behind: number; entries: Record<string, string>; additions: number; deletions: number; pullRequest: { number: number; state: string; url: string } | null }>;
  getFileDiff(sessionId: string, path: string): Promise<{ path: string; diff: string }>;
  getFileDownloadUrl(sessionId: string, path: string): string;
  openFile(sessionId: string, input: { path: string; line?: number }): Promise<{ opened: true }>;
  revealFile(sessionId: string, input: { path: string }): Promise<{ revealed: true }>;
  /** Open the session working directory (or a session-relative path) in an external application. */
  openInApp(sessionId: string, appId: string, path: string, line?: number): Promise<void>;
  connectEvents(handlers: KimiEventHandlers): KimiEventConnection;

  // Workspaces + daemon folder browser. /workspaces now ships and includes
  // derived workspaces (cwds with sessions that were never explicitly registered).
  listWorkspaces(): Promise<AppWorkspace[]>;
  addWorkspace(input: { root: string; name?: string }): Promise<AppWorkspace>;
  updateWorkspace(id: string, input: { name: string }): Promise<AppWorkspace>;
  deleteWorkspace(id: string): Promise<void>;
  browseFs(path?: string): Promise<FsBrowseResult>;
  getFsHome(): Promise<{ home: string; recentRoots: string[] }>;

  // Models + Providers — upstream REST endpoints (#2110 provider write API)
  listModels(): Promise<AppModel[]>;
  listProviders(): Promise<AppProvider[]>;
  addProvider(input: { type: string; apiKey?: string; baseUrl?: string; defaultModel?: string }): Promise<AppProvider>;
  /** PUT /providers/{id} — replace provider (#2110). */
  replaceProvider(id: string, input: { newId?: string; type: string; apiKey?: string; baseUrl?: string; defaultModel?: string }): Promise<AppProvider>;
  /** POST /providers:import_catalog — import models.dev entry (#2110). */
  importProviderFromCatalog(input: { catalogId: string; id?: string; apiKey?: string; baseUrl?: string }): Promise<AppProvider>;
  /** POST /models/{id}:set_default — dedicated endpoint (#2110). */
  setDefaultModel(modelId: string): Promise<void>;
  deleteProvider(id: string): Promise<{ deleted: true }>;
  refreshProvider(id: string): Promise<ProviderRefreshResult>;
  refreshAllProviders(): Promise<ProviderRefreshResult>;
  refreshOAuthProviderModels(): Promise<ProviderRefreshResult>;

  // File upload / download
  uploadFile(input: { file: Blob; name?: string }): Promise<{ id: string; name: string; mediaType: string; size: number }>;
  getFileUrl(fileId: string): string;
  /** Fetch a file's bytes with auth — feed the resulting Blob to a blob URL for <video>/<img> src. */
  getFileBlob(fileId: string): Promise<Blob>;

  // Config — REAL endpoints
  getConfig(): Promise<AppConfig>;
  setConfig(patch: Partial<AppConfig>): Promise<AppConfig>;

  // MCP servers — GET /mcp/servers + POST /mcp/servers/{id}:restart
  listMcpServers(): Promise<Array<{ id: string; name: string; status: string; toolCount?: number; transport?: string }>>;
  restartMcpServer(serverId: string): Promise<{ restarted: true }>;

  // Auth — REAL endpoints
  getAuth(): Promise<{
    ready: boolean;
    providersCount: number;
    defaultModel: string | null;
    managedProvider: { status: string } | null;
  }>;
  startOAuthLogin(): Promise<{
    flowId: string;
    provider: string;
    verificationUri: string;
    verificationUriComplete: string;
    userCode: string;
    expiresIn: number;
    interval: number;
    status: 'pending';
    expiresAt: string;
  }>;
  pollOAuthLogin(): Promise<{
    flowId: string;
    status: 'pending' | 'authenticated' | 'expired' | 'cancelled';
    resolvedAt?: string;
  } | null>;
  cancelOAuthLogin(): Promise<{ cancelled: boolean; status: string }>;
  logout(): Promise<{ loggedOut: boolean }>;

  // Tools — GET /tools (tool descriptors with active state, #2005)
  listTools(sessionId?: string): Promise<AppToolDescriptor[]>;

  // OAuth usage — GET /oauth/usage (managed account plan usage, #2027)
  getOauthUsage(): Promise<AppManagedUsage | null>;
  getOAuthAccount(): Promise<AppOAuthAccount | null>;
  getManagedUserInfo(): Promise<AppManagedUserInfo | null>;

  // Search — POST /search (cross-session messages and titles)
  searchMessages(input: AppMessageSearchInput): Promise<AppMessageSearchPage>;

  // Connections — GET /connections (attached WS clients diagnostic)
  getConnections(): Promise<AppConnection[]>;

  // Shutdown — POST /shutdown (graceful daemon termination)
  shutdownDaemon(): Promise<{ shuttingDown: true }>;

  // GUI store — server-backed localStorage mirror
  guiStoreGetItem(key: string): Promise<string | null>;
  guiStoreSetItem(key: string, value: string): Promise<void>;
  guiStoreRemoveItem(key: string): Promise<void>;

  // Session export — POST /sessions/{id}/export (diagnostic archive download).
  // `webLog` uploads a client log for bundling; `desktop` asks the server to
  // bundle the on-disk desktop app log (read server-side, skipped if missing).
  exportSession(
    sessionId: string,
    options?: { webLog?: string; desktop?: boolean },
  ): Promise<Blob>;
}
