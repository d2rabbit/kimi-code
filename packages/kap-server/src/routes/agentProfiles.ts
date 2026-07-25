/**
 * `/sessions/{session_id}/agent-profiles` REST route — read-only agent profile
 * catalog.
 *
 *   GET /sessions/{session_id}/agent-profiles   data: {profiles: AgentProfileDescriptor[]}
 *
 * Thin edge over the Session-scope `ISessionAgentProfileCatalog` — the merged
 * view of builtin (code-contribution) profiles and file-backed sources
 * (user / extra / project / explicit), i.e. exactly the set the `Agent` tool
 * and the swarm scheduler can spawn in this session. Session gate matches
 * /skills and /cron (`resume` cold-loads).
 *
 * **Anti-corruption**: route resolves every service via the accessor; no SDK
 * imports.
 */

import {
  ISessionAgentProfileCatalog,
  ISessionIndex,
  ISessionLifecycleService,
  type AgentProfile,
  type ISessionScopeHandle,
  type Scope,
} from '@moonshot-ai/agent-core-v2';
import { z } from 'zod';

import { errEnvelope, okEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';
import { ErrorCode } from '../protocol/error-codes';
import {
  listAgentProfilesResponseSchema,
  type AgentProfileDescriptor,
} from '../protocol/rest-agentProfiles';

interface AgentProfilesRouteHost {
  get(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> },
    handler: (
      req: { id: string; params: unknown },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
}

const sessionIdParamSchema = z.object({
  session_id: z.string().min(1),
});

type ResolvedSession =
  | { readonly handle: ISessionScopeHandle }
  | { readonly envelope: ReturnType<typeof errEnvelope> };

/** Same activation gate as /skills and /cron: resume so a cold session cold-loads. */
async function resolveActivatedSession(
  core: Scope,
  sessionId: string,
  requestId: string,
): Promise<ResolvedSession> {
  const handle = await core.accessor.get(ISessionLifecycleService).resume(sessionId);
  if (handle !== undefined) return { handle };

  const summary = await core.accessor.get(ISessionIndex).get(sessionId);
  const msg =
    summary === undefined
      ? `session ${sessionId} does not exist`
      : `session ${sessionId} is not activated, you need to activate it first`;
  return { envelope: errEnvelope(ErrorCode.SESSION_NOT_FOUND, msg, requestId) };
}

function toDescriptor(profile: AgentProfile): AgentProfileDescriptor {
  return {
    name: profile.name,
    description: profile.description,
    when_to_use: profile.whenToUse,
    tools: profile.tools ? [...profile.tools] : undefined,
    disallowed_tools: profile.disallowedTools ? [...profile.disallowedTools] : undefined,
    subagents: profile.subagents ? [...profile.subagents] : undefined,
    model_preference: profile.modelPreference,
  };
}

export function registerAgentProfilesRoutes(app: AgentProfilesRouteHost, core: Scope): void {
  const listRoute = defineRoute(
    {
      method: 'GET',
      path: '/sessions/{session_id}/agent-profiles',
      params: sessionIdParamSchema,
      success: { data: listAgentProfilesResponseSchema },
      errors: {
        [ErrorCode.SESSION_NOT_FOUND]: {},
      },
      description: 'List the agent profiles (builtin + file-defined) spawnable in a session',
      tags: ['agents'],
      operationId: 'listAgentProfiles',
    },
    async (req, reply) => {
      const { session_id } = req.params;
      const resolved = await resolveActivatedSession(core, session_id, req.id);
      if ('envelope' in resolved) {
        reply.send(resolved.envelope);
        return;
      }
      const catalog = resolved.handle.accessor.get(ISessionAgentProfileCatalog);
      await catalog.ready;
      const profiles = catalog.list().map(toDescriptor);
      reply.send(okEnvelope({ profiles }, req.id));
    },
  );
  app.get(
    listRoute.path,
    listRoute.options,
    listRoute.handler as Parameters<AgentProfilesRouteHost['get']>[2],
  );
}
