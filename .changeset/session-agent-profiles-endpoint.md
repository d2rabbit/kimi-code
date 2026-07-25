---
"@moonshot-ai/kimi-code": minor
---

Add a read-only agent profile catalog endpoint to the server REST API: `GET /api/v1/sessions/{session_id}/agent-profiles` lists every agent profile spawnable in the session (builtin profiles plus file-defined agents from user / project / extra / explicit sources), with description, when-to-use, tool allowlist, delegable subagents, and model preference.
