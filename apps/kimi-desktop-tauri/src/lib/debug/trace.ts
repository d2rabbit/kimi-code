// debug/trace.ts — minimal trace stubs.
//
// In kimi-web these capture REST/WS traffic into a debug buffer (opt-in via
// ?debug=1). For the Tauri desktop MVP they are no-ops; wire up real tracing
// when the DebugPanel is ported.

export function isTraceEnabled(): boolean {
  return false;
}

interface Traceable {
  readonly method?: string;
  readonly url?: string;
  readonly path?: string;
  readonly status?: number;
  readonly bodyPreview?: string;
  readonly phase?: string;
  readonly requestId?: string;
  readonly durationMs?: number;
  readonly body?: string;
  readonly error?: unknown;
  readonly code?: string | number;
  readonly msg?: string;
  readonly envelopeRequestId?: string;
  readonly data?: unknown;
}

export function traceRestRequest(_entry: Traceable): void {
  void _entry;
}
export function traceRestResponse(_entry: Traceable): void {
  void _entry;
}
export function traceRestFailure(_entry: Traceable): void {
  void _entry;
}
export function traceWsIn(_entry: Traceable): void {
  void _entry;
}
export function traceWsOut(_entry: Traceable): void {
  void _entry;
}
export function traceWsLifecycle(_entry: Traceable): void {
  void _entry;
}
