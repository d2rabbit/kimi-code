/**
 * `/sessions/{session_id}/cron` REST routes — session cron task management.
 *
 *   GET    /sessions/{session_id}/cron              data: {tasks: CronTask[]}
 *   POST   /sessions/{session_id}/cron              body: {cron, prompt, recurring?} → {task}
 *   DELETE /sessions/{session_id}/cron/{task_id}    data: {deleted: boolean}
 *
 * Thin edge over the Session-scope `ISessionCronService` (the live scheduling
 * engine; `addTask` auto-tags the session id and persists via the App-scope
 * store, `removeTasks` is idempotent). The session is resolved with
 * `resumeSessionById` so a cold session cold-loads instead of
 * reporting "not activated" (same gate as /skills).
 *
 * Clients follow firings via the `cron.fired` WS event; these routes are only
 * for listing / creating / deleting tasks.
 *
 * **Error mapping**:
 *   - not live / unknown session → envelope `code: 40401 session.not_found`.
 *   - malformed cron expression or empty prompt → envelope `code: 40001 validation.failed`.
 *
 * **Anti-corruption**: route resolves every service via the accessor; no SDK
 * imports.
 */

import {
  ISessionCronService,
  ISessionIndex,
  parseCronExpression,
  resumeSessionById,
  type CronTask,
  type ISessionScopeHandle,
  type Scope,
} from '@moonshot-ai/agent-core-v2';
import { z } from 'zod';

import { errEnvelope, okEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';
import { ErrorCode } from '../protocol/error-codes';
import {
  createCronTaskRequestSchema,
  createCronTaskResultSchema,
  deleteCronTaskResultSchema,
  listCronTasksResponseSchema,
  type CronTask as ProtocolCronTask,
} from '../protocol/rest-cron';

interface CronRouteHost {
  get(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> },
    handler: (
      req: { id: string; params: unknown },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
  post(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> },
    handler: (
      req: { id: string; body: unknown; params: unknown },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
  delete(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> } | undefined,
    handler: (
      req: { id: string; params: unknown },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
}

const sessionIdParamSchema = z.object({
  session_id: z.string().min(1),
});

const cronTaskParamsSchema = z.object({
  session_id: z.string().min(1),
  task_id: z.string().min(1),
});

type ResolvedSession =
  | { readonly handle: ISessionScopeHandle }
  | { readonly envelope: ReturnType<typeof errEnvelope> };

/** Same activation gate as /skills: resume so a cold session cold-loads. */
async function resolveActivatedSession(
  core: Scope,
  sessionId: string,
  requestId: string,
): Promise<ResolvedSession> {
  const handle = await resumeSessionById(core.accessor, sessionId);
  if (handle !== undefined) return { handle };

  const summary = await core.accessor.get(ISessionIndex).get(sessionId);
  const msg =
    summary === undefined
      ? `session ${sessionId} does not exist`
      : `session ${sessionId} is not activated, you need to activate it first`;
  return { envelope: errEnvelope(ErrorCode.SESSION_NOT_FOUND, msg, requestId) };
}

function toProtocolCronTask(task: CronTask): ProtocolCronTask {
  return {
    id: task.id,
    cron: task.cron,
    prompt: task.prompt,
    created_at: task.createdAt,
    recurring: task.recurring,
    last_fired_at: task.lastFiredAt,
  };
}

export function registerCronRoutes(app: CronRouteHost, core: Scope): void {
  // GET /sessions/{session_id}/cron ---------------------------------------
  const listRoute = defineRoute(
    {
      method: 'GET',
      path: '/sessions/{session_id}/cron',
      params: sessionIdParamSchema,
      success: { data: listCronTasksResponseSchema },
      errors: {
        [ErrorCode.SESSION_NOT_FOUND]: {},
      },
      description: 'List the cron tasks scheduled in a session',
      tags: ['cron'],
      operationId: 'listCronTasks',
    },
    async (req, reply) => {
      const { session_id } = req.params;
      const resolved = await resolveActivatedSession(core, session_id, req.id);
      if ('envelope' in resolved) {
        reply.send(resolved.envelope);
        return;
      }
      const tasks = resolved.handle.accessor
        .get(ISessionCronService)
        .list()
        .map(toProtocolCronTask);
      reply.send(okEnvelope({ tasks }, req.id));
    },
  );
  app.get(listRoute.path, listRoute.options, listRoute.handler as Parameters<CronRouteHost['get']>[2]);

  // POST /sessions/{session_id}/cron --------------------------------------
  const createRoute = defineRoute(
    {
      method: 'POST',
      path: '/sessions/{session_id}/cron',
      body: createCronTaskRequestSchema,
      params: sessionIdParamSchema,
      success: { data: createCronTaskResultSchema },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: {},
        [ErrorCode.SESSION_NOT_FOUND]: {},
      },
      description: 'Create a cron task in a session',
      tags: ['cron'],
      operationId: 'createCronTask',
    },
    async (req, reply) => {
      const { session_id } = req.params;
      const resolved = await resolveActivatedSession(core, session_id, req.id);
      if ('envelope' in resolved) {
        reply.send(resolved.envelope);
        return;
      }
      try {
        // Field-level validation before touching the service: a malformed
        // expression must not create a task.
        parseCronExpression(req.body.cron);
        const task = resolved.handle.accessor.get(ISessionCronService).addTask({
          cron: req.body.cron.trim(),
          prompt: req.body.prompt,
          recurring: req.body.recurring,
        });
        reply.send(okEnvelope({ task: toProtocolCronTask(task) }, req.id));
      } catch (err) {
        sendMappedError(reply, req.id, err);
      }
    },
  );
  app.post(
    createRoute.path,
    createRoute.options,
    createRoute.handler as Parameters<CronRouteHost['post']>[2],
  );

  // DELETE /sessions/{session_id}/cron/{task_id} ---------------------------
  const deleteRoute = defineRoute(
    {
      method: 'DELETE',
      path: '/sessions/{session_id}/cron/{task_id}',
      params: cronTaskParamsSchema,
      success: { data: deleteCronTaskResultSchema },
      errors: {
        [ErrorCode.SESSION_NOT_FOUND]: {},
      },
      description: 'Delete a cron task from a session (idempotent)',
      tags: ['cron'],
      operationId: 'deleteCronTask',
    },
    async (req, reply) => {
      const { session_id, task_id } = req.params;
      const resolved = await resolveActivatedSession(core, session_id, req.id);
      if ('envelope' in resolved) {
        reply.send(resolved.envelope);
        return;
      }
      const removed = resolved.handle.accessor.get(ISessionCronService).removeTasks([task_id]);
      reply.send(okEnvelope({ deleted: removed.length > 0 }, req.id));
    },
  );
  app.delete(
    deleteRoute.path,
    deleteRoute.options,
    deleteRoute.handler as Parameters<CronRouteHost['delete']>[2],
  );
}

// ---------------------------------------------------------------------------
// Error mapping (see header).
// ---------------------------------------------------------------------------

function sendMappedError(
  reply: { send(payload: unknown): unknown },
  requestId: string,
  err: unknown,
): void {
  // parseCronExpression / addTask validation errors are client input problems.
  if (err instanceof Error) {
    reply.send(errEnvelope(ErrorCode.VALIDATION_FAILED, err.message, requestId, err.stack));
    return;
  }
  throw err;
}
