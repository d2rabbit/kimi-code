---
"@moonshot-ai/kimi-desktop-tauri": minor
---

The desktop app now runs its own embedded agent: a private agent process starts with the app, uses an isolated data home and an ephemeral port, and stops when the app quits — no separately started daemon is required anymore.
