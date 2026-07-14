# kimi-desktop-tauri Agent Guide

Package-local rules for `apps/kimi-desktop-tauri` (`@moonshot-ai/kimi-desktop-tauri`).

## What it is

A Tauri 2 + Svelte 5 desktop client for Kimi Code, a peer to the Electron-based `apps/kimi-desktop`. It does **not** bundle kimi-web; the frontend is a fresh Svelte implementation that connects to the same shared daemon (REST + WS under `/api/v1`, port 58627) as the CLI, browser, TUI, and the Electron desktop app.

## Stack

- **Frontend**: Svelte 5 (Runes) + Vite + TypeScript (strict). State via `$state` / `$derived` runes in `src/lib/stores/`. No SvelteKit router (SPA). No Pinia/vue-i18n — uses `svelte-i18n`.
- **Backend (Rust)**: Tauri 2 main process in `src-tauri/`. Manages the daemon lifecycle (`ensure_daemon`), exposes native capabilities as Tauri commands.

## Architecture boundaries

- **Business data (REST + WS) flows directly** from the WebView (Svelte) to the daemon. Do **not** route REST/WS through Tauri IPC — it would become a bottleneck for streaming.
- **Tauri IPC is reserved for native-only operations**: daemon startup, reading the server token, opening files, tray, global shortcuts, notifications.
- The Rust side spawns the bundled SEA (`kimi server run`) and reads `~/.kimi-code/server/lock` — the same `ensureDaemon` flow as the Electron app. See `src-tauri/src/daemon.rs`.
- **Do not depend on `@moonshot-ai/agent-core`.** Wire types are re-implemented locally (copied from kimi-web and adapted), same rule as kimi-web.

## Relationship to kimi-web

This app **copies logic from `apps/kimi-web`** (API client, types, event reducer, agent projector, i18n keys, design tokens, lib utils) and maintains it independently. When kimi-web updates these, sync manually — there is no shared package.

## Commands

```bash
pnpm --filter @moonshot-ai/kimi-desktop-tauri run dev          # Vite dev server (port 1420)
pnpm --filter @moonshot-ai/kimi-desktop-tauri run build        # production build → dist/
pnpm --filter @moonshot-ai/kimi-desktop-tauri run typecheck    # svelte-check
pnpm --filter @moonshot-ai/kimi-desktop-tauri run tauri:dev    # full Tauri dev (Rust + frontend)
pnpm --filter @moonshot-ai/kimi-desktop-tauri run tauri:build  # package for current platform
```

The daemon must be running for the frontend to connect (`pnpm run dev:server` from the repo root, or `kimi server run`).

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

## Status

**Phase 1 (scaffold + Rust daemon)** is in progress. See `.tmp/kimi-desktop-tauri-design.md` for the full design and roadmap.
