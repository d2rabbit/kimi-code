// debug/trace.ts — minimal trace stubs.
//
// In kimi-web these capture REST/WS traffic into a debug buffer (opt-in via
// ?debug=1). For the Tauri desktop MVP they are no-ops; wire up real tracing
// when the DebugPanel is ported.

export function isTraceEnabled(): boolean {
  return false;
}

export function traceRestRequest(_entry: Record<string, unknown>): void {
  void _entry;
}
export function traceRestResponse(_entry: Record<string, unknown>): void {
  void _entry;
}
export function traceRestFailure(_entry: Record<string, unknown>): void {
  void _entry;
}
export function traceWsIn(_entry: unknown): void {
  void _entry;
}
export function traceWsOut(_entry: unknown): void {
  void _entry;
}
export function traceWsLifecycle(_event: string, _data?: Record<string, unknown> | unknown): void {
  void _event; void _data;
}
