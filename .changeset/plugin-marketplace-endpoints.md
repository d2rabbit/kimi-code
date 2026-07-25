---
"@moonshot-ai/kimi-code": minor
---

Add plugin marketplace and management endpoints to the server REST API: `GET /api/v1/plugins` lists installed plugins, `GET /api/v1/plugins/marketplace` serves the marketplace registry proxied server-side (CDN default with local fallback, cached) merged with install state and update availability, `POST /api/v1/plugins:install` installs from a GitHub / zip / local source, `POST /api/v1/plugins/{id}:toggle` enables or disables, and `DELETE /api/v1/plugins/{id}` uninstalls.
