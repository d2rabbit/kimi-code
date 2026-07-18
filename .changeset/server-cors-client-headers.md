---
"@moonshot-ai/kimi-code": patch
---

Fix browser-shell clients (Tauri/Electron desktop apps) getting empty data from the local server: the CORS allow-headers list now covers the X-Request-Id and X-Kimi-Client-* identity headers these clients send on every REST call, so preflight no longer blocks them.
