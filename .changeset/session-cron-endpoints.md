---
"@moonshot-ai/kimi-code": minor
---

Add session cron management endpoints to the server REST API: `GET /api/v1/sessions/{session_id}/cron` to list a session's scheduled tasks, `POST` on the same path to create one (`{cron, prompt, recurring?}`, with cron-expression validation), and `DELETE /api/v1/sessions/{session_id}/cron/{task_id}` to remove one (idempotent).
