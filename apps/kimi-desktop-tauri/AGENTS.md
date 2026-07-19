# kimi-desktop-tauri Agent Guide

Package-local rules for `apps/kimi-desktop-tauri` (`@moonshot-ai/kimi-desktop-tauri`).

## What it is

A Tauri 2 + Svelte 5 desktop client for Kimi Code, a peer to the Electron-based `apps/kimi-desktop`. It does **not** bundle kimi-web; the frontend is a fresh Svelte implementation. Unlike the Electron app, the Tauri client **owns its own isolated embedded agent** — the Rust main process spawns the bundled SEA (`kimi server run --foreground`) as a private child process bound to the app lifecycle, using an isolated `KIMI_CODE_HOME` (`~/.kimi-code/desktop`) and an ephemeral loopback port. It never attaches to the shared CLI daemon (port 58627) or any foreign daemon. See `src-tauri/src/agent.rs`.

## Stack

- **Frontend**: Svelte 5 (Runes) + Vite + TypeScript (strict). State via `$state` / `$derived` runes in `src/lib/stores/`. No SvelteKit router (SPA). No Pinia/vue-i18n — uses `svelte-i18n`.
- **Backend (Rust)**: Tauri 2 main process in `src-tauri/`. Spawns and supervises the embedded agent (`agent.rs::start_embedded_agent`), exposes native capabilities as Tauri commands.

## Architecture boundaries

- **Business data (REST + WS) flows directly** from the WebView (Svelte) to the embedded agent. Do **not** route REST/WS through Tauri IPC — it would become a bottleneck for streaming.
- **Tauri IPC is reserved for native-only operations**: agent startup (`ensure_server`), reading the server token, opening files, tray, global shortcuts, notifications, git ops, skill/plugin file IO.
- The Rust side spawns the bundled SEA on an ephemeral port with `KIMI_CODE_HOME=~/.kimi-code/desktop` (private lock/token/sessions) and seeds user data (config.toml / mcp.json / sessions / plugins / skills) from the shared home on first launch. The agent dies with the app (`kill_on_drop` + explicit `stop_embedded_agent` on exit). See `src-tauri/src/agent.rs`.
- **Do not depend on `@moonshot-ai/agent-core`.** Wire types are re-implemented locally (copied from kimi-web and adapted), same rule as kimi-web.

## Relationship to kimi-web

This app **copies logic from `apps/kimi-web`** (API client, types, event reducer, agent projector, i18n keys, design tokens, lib utils) and maintains it independently. When kimi-web updates these, sync manually — there is no shared package.

## Commands

```bash
# Tester / developer quick-start (foreground, info-level diagnostics):
pnpm desktop:dev                                                 # or: bash scripts/dev-quick.sh

# Full build + detached launch / build only / distributable installer:
pnpm desktop:run                                                 # background setsid launch
pnpm desktop:build                                               # build, no launch
bash scripts/build-run.sh --dist                                 # .deb/.dmg/.msi/.AppImage
bash scripts/build-run.sh --foreground --log-level debug --debug-endpoints  # deep diagnostics

# Frontend-only (needs the embedded agent reachable — see dev prerequisites):
pnpm --filter @moonshot-ai/kimi-desktop-tauri run dev            # Vite dev server (port 1420)
pnpm --filter @moonshot-ai/kimi-desktop-tauri run build          # production build → dist/
pnpm --filter @moonshot-ai/kimi-desktop-tauri run typecheck      # svelte-check
pnpm --filter @moonshot-ai/kimi-desktop-tauri run tauri:dev      # full Tauri dev (Rust + frontend)
pnpm --filter @moonshot-ai/kimi-desktop-tauri run tauri:build    # package for current platform
```

`scripts/build-run.sh` is the local end-to-end entry point. It builds the SEA from kimi-code source, stages it for the release binary, and spawns the app with diagnostic env vars (`KIMI_DESKTOP_LOG_LEVEL`, `KIMI_DESKTOP_DEBUG_ENDPOINTS`) that `commands.rs::ensure_server` reads to tune the embedded agent.

## Dev prerequisites

- **Rust toolchain** (stable 1.77+): `cargo`, `rustc`. Tauri 2 requires it.
- **Platform WebView**: macOS (WKWebView, built-in), Windows (WebView2 / Edge), Linux (WebKitGTK).
- **SEA build** for dev: `pnpm --filter @moonshot-ai/kimi-code run build:native:sea` (the Rust `sea_path.rs` resolves `apps/kimi-code/dist-native/bin/<target>/kimi` in dev mode).

## Packaging

`pnpm run tauri:build` triggers:
1. `pnpm build` (frontend → dist/)
2. `node scripts/before-bundle.cjs` (stages SEA into src-tauri/resources/bin/)
3. Cargo build + Tauri bundler (produces .dmg/.msi/.deb/.AppImage)

The `before-bundle.cjs` script detects the current platform via `TAURI_PLATFORM` / `TAURI_ARCH` env vars (set by Tauri during build) and stages the matching SEA. If the SEA is missing, the build fails with a clear error.

CI: `.github/workflows/desktop-tauri-build.yml` builds on 4 runners (macos-arm64, macos-x64, windows-x64, linux-x64), each building the SEA for its platform first.

## Gotchas

- **CSP**: `tauri.conf.json` restricts `connect-src` to `127.0.0.1` and `localhost`. If the daemon binds a different host, update the CSP.
- **`titleBarStyle: "Overlay"`** in `tauri.conf.json` hides the native title bar on macOS — the Svelte UI must reserve space for traffic lights (left ~72px in the header).
- **Design tokens** live in `src/lib/styles/global.css` (copied from kimi-web's `style.css`). Keep the token names identical for future sync.
- **i18n keys** must stay in sync between `en/` and `zh/` (same manual responsibility as kimi-web).

## Observability

- **Embedded agent log**: `~/.kimi-code/desktop/server/server.log` (Pino format). Default level `info` records turn processing, model calls, and MCP connections — tune via `bash scripts/build-run.sh --log-level <fatal|error|warn|info|debug|trace|silent>` or the `KIMI_DESKTOP_LOG_LEVEL` env var.
- **Debug endpoints**: `--debug-endpoints` (or `KIMI_DESKTOP_DEBUG_ENDPOINTS=1`) mounts `/api/v1/debug/*` introspection routes on the embedded agent (loopback only).
- **Session event journal**: `~/.kimi-code/desktop/server/events/ses_*.jsonl` — the durable event stream per session, useful for post-mortem when a prompt silently fails (look for `turn.started` without a following `assistant.delta` / `error`).
- **Client log**: `/tmp/kimi-desktop-tauri.log` (stdout/stderr of the background setsid launch).

When diagnosing "prompt submitted but no response": check `server.log` for the gap after `turn.started`, and the session event journal for where the event stream broke.

## Status

Mature: full embedded agent lifecycle, 20 Tauri IPC commands, isolated home + data seeding, session/goal/swarm/terminal panels, conversation TOC, and a tester-friendly build/run script suite. The app is an independent project — it depends only on its own package and the bundled kimi-code SEA, with zero `@moonshot-ai/agent-core` dependency.
