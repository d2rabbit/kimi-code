/**
 * `/oauth/*` REST routes.
 *
 *   POST   /oauth/login     start a device-code flow → OAuthFlowStart
 *   GET    /oauth/login     poll current flow state  → OAuthFlowSnapshot | null
 *   DELETE /oauth/login     cancel pending flow       → { cancelled, status }
 *   POST   /oauth/logout    logout                    → { logged_out, provider }
 *   GET    /oauth/usage     managed-account usage     → ManagedUsageResult
 *   GET    /oauth/account   access-token JWT claims   → JWT claims | null
 *   GET    /oauth/userinfo  managed-account profile   → ManagedUserInfoResult
 *
 * Backed by the v2 `IOAuthService` (Core scope), which already returns the
 * protocol wire types, so the handlers only swap the v1 accessor
 * (`ix.invokeFunction`) for the v2 one (`core.accessor.get`).
 */

import { IOAuthService, type Scope } from '@moonshot-ai/agent-core-v2';
import {
  managedUserInfoResultSchema,
  managedUsageResultSchema,
  oauthFlowSnapshotSchema,
  oauthFlowStartSchema,
  oauthLoginCancelResponseSchema,
  oauthLogoutResponseSchema,
  type ManagedUsageResult,
  type UsageRow,
} from '@moonshot-ai/agent-core-v2/app/auth/oauthProtocol';
import { z } from 'zod';

import { okEnvelope } from '../envelope';
import { requestLog } from '../lib/requestLog';
import { defineRoute } from '../middleware/defineRoute';
import {
  oauthLoginQuerySchema,
  oauthLoginStartRequestSchema,
  oauthLogoutRequestSchema,
} from '../protocol/rest-oauth';

/** Account identity decoded from the current access token's JWT claims. */
const oauthAccountSchema = z.object({
  user_id: z.string(),
  scope: z.string().optional(),
  client_id: z.string().optional(),
  expires_at: z.number().optional(),
});
const oauthAccountOrNullSchema = z.union([oauthAccountSchema, z.null()]);

/** Decode the payload of a JWT without verifying the signature (the token was
 *  issued/validated by the OAuth host; we only surface identity claims). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf-8'));
    return payload !== null && typeof payload === 'object' ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

interface RouteHost {
  get(
    path: string,
    options: { preHandler?: unknown[]; schema?: Record<string, unknown> },
    handler: (
      req: { id: string; query: unknown },
      reply: { send(payload: unknown): void },
    ) => Promise<void> | void,
  ): unknown;
  post(
    path: string,
    options: { preHandler?: unknown[]; schema?: Record<string, unknown> },
    handler: (
      req: { id: string; body: unknown },
      reply: { send(payload: unknown): void },
    ) => Promise<void> | void,
  ): unknown;
  delete(
    path: string,
    options: { preHandler?: unknown[]; schema?: Record<string, unknown> },
    handler: (
      req: { id: string; query: unknown },
      reply: { send(payload: unknown): void },
    ) => Promise<void> | void,
  ): unknown;
}

const oauthFlowSnapshotOrNullSchema = z.union([
  oauthFlowSnapshotSchema,
  z.null(),
]);

export function registerOAuthRoutes(app: RouteHost, core: Scope): void {
  // POST /oauth/login — start device flow ----------------------------------
  const loginStartRoute = defineRoute(
    {
      method: 'POST',
      path: '/oauth/login',
      body: oauthLoginStartRequestSchema,
      success: { data: oauthFlowStartSchema },
      description: 'Start an OAuth device-code flow',
      tags: ['auth'],
    },
    async (req, reply) => {
      const result = await core.accessor.get(IOAuthService).startLogin(req.body.provider);
      requestLog(req)?.info({ provider: req.body.provider, action: 'login' }, 'oauth login started');
      reply.send(okEnvelope(result, req.id));
    },
  );
  app.post(
    loginStartRoute.path,
    loginStartRoute.options,
    loginStartRoute.handler as Parameters<RouteHost['post']>[2],
  );

  // GET /oauth/login — poll current flow state -----------------------------
  const loginPollRoute = defineRoute(
    {
      method: 'GET',
      path: '/oauth/login',
      querystring: oauthLoginQuerySchema,
      success: { data: oauthFlowSnapshotOrNullSchema },
      description: 'Poll the current OAuth device-code flow',
      tags: ['auth'],
    },
    async (req, reply) => {
      const snapshot = core.accessor.get(IOAuthService).getFlow(req.query.provider);
      reply.send(okEnvelope(snapshot ?? null, req.id));
    },
  );
  app.get(
    loginPollRoute.path,
    loginPollRoute.options,
    loginPollRoute.handler as Parameters<RouteHost['get']>[2],
  );

  // DELETE /oauth/login — cancel pending flow ------------------------------
  const loginCancelRoute = defineRoute(
    {
      method: 'DELETE',
      path: '/oauth/login',
      querystring: oauthLoginQuerySchema,
      success: { data: oauthLoginCancelResponseSchema },
      description: 'Cancel the current OAuth device-code flow',
      tags: ['auth'],
    },
    async (req, reply) => {
      const result = await core.accessor.get(IOAuthService).cancelLogin(req.query.provider);
      requestLog(req)?.info(
        { provider: req.query.provider, action: 'cancel_login' },
        'oauth login cancelled',
      );
      reply.send(okEnvelope(result, req.id));
    },
  );
  app.delete(
    loginCancelRoute.path,
    loginCancelRoute.options,
    loginCancelRoute.handler as Parameters<RouteHost['delete']>[2],
  );

  // POST /oauth/logout -----------------------------------------------------
  const logoutRoute = defineRoute(
    {
      method: 'POST',
      path: '/oauth/logout',
      body: oauthLogoutRequestSchema,
      success: { data: oauthLogoutResponseSchema },
      description: 'Logout the managed OAuth provider',
      tags: ['auth'],
    },
    async (req, reply) => {
      const result = await core.accessor.get(IOAuthService).logout(req.body.provider);
      requestLog(req)?.info({ provider: req.body.provider, action: 'logout' }, 'oauth logout');
      reply.send(okEnvelope(result, req.id));
    },
  );
  app.post(
    logoutRoute.path,
    logoutRoute.options,
    logoutRoute.handler as Parameters<RouteHost['post']>[2],
  );

  // GET /oauth/usage — managed-account plan usage (limits + booster wallet) ---
  const usageRoute = defineRoute(
    {
      method: 'GET',
      path: '/oauth/usage',
      querystring: oauthLoginQuerySchema,
      success: { data: managedUsageResultSchema },
      description: 'Get the managed account usage summary',
      tags: ['auth'],
    },
    async (req, reply) => {
      const result = await core.accessor.get(IOAuthService).getManagedUsage(req.query.provider);
      reply.send(okEnvelope(toWireUsage(result), req.id));
    },
  );
  app.get(
    usageRoute.path,
    usageRoute.options,
    usageRoute.handler as Parameters<RouteHost['get']>[2],
  );

  // GET /oauth/account — current account identity from the access token -----
  const accountRoute = defineRoute(
    {
      method: 'GET',
      path: '/oauth/account',
      querystring: oauthLoginQuerySchema,
      success: { data: oauthAccountOrNullSchema },
      description: 'Get the current account identity (JWT claims), null when logged out',
      tags: ['auth'],
    },
    async (req, reply) => {
      const oauth = core.accessor.get(IOAuthService);
      const provider = (req.query as { provider?: string }).provider;
      const token = await oauth.getCachedAccessToken(
        provider ?? 'managed:kimi-code',
        undefined,
      );
      if (token === undefined) {
        reply.send(okEnvelope(null, req.id));
        return;
      }
      const claims = decodeJwtPayload(token);
      if (claims === null) {
        reply.send(okEnvelope(null, req.id));
        return;
      }
      const sub = claims['sub'] ?? claims['user_id'];
      reply.send(okEnvelope(
        {
          user_id:
            typeof sub === 'string' ? sub : typeof sub === 'number' ? String(sub) : '',
          scope: typeof claims['scope'] === 'string' ? claims['scope'] : undefined,
          client_id: typeof claims['client_id'] === 'string' ? claims['client_id'] : undefined,
          expires_at: typeof claims['exp'] === 'number' ? claims['exp'] : undefined,
        },
        req.id,
      ));
    },
  );
  app.get(
    accountRoute.path,
    accountRoute.options,
    accountRoute.handler as Parameters<RouteHost['get']>[2],
  );

  // GET /oauth/userinfo — managed-account profile ------------------------------
  const userInfoRoute = defineRoute(
    {
      method: 'GET',
      path: '/oauth/userinfo',
      querystring: oauthLoginQuerySchema,
      success: { data: managedUserInfoResultSchema },
      description: 'Get the managed account profile',
      tags: ['auth'],
    },
    async (req, reply) => {
      const result = await core.accessor.get(IOAuthService).getManagedUserInfo(req.query.provider);
      reply.send(okEnvelope(result, req.id));
    },
  );
  app.get(
    userInfoRoute.path,
    userInfoRoute.options,
    userInfoRoute.handler as Parameters<RouteHost['get']>[2],
  );
}

/** Domain (camelCase) → wire (snake_case) mapping for the usage payload. */
function toWireUsage(result: ManagedUsageDomainResult): ManagedUsageResult {
  if (result.kind === 'error') {
    return { kind: 'error', message: result.message, status: result.status };
  }
  return {
    kind: 'ok',
    summary: result.summary === null ? null : toWireUsageRow(result.summary),
    limits: result.limits.map(toWireUsageRow),
    extra_usage:
      result.extraUsage === null
        ? null
        : {
            balance_cents: result.extraUsage.balanceCents,
            total_cents: result.extraUsage.totalCents,
            monthly_charge_limit_enabled: result.extraUsage.monthlyChargeLimitEnabled,
            monthly_charge_limit_cents: result.extraUsage.monthlyChargeLimitCents,
            monthly_used_cents: result.extraUsage.monthlyUsedCents,
            currency: result.extraUsage.currency,
          },
  };
}

type ManagedUsageDomainResult = Awaited<ReturnType<IOAuthService['getManagedUsage']>>;
type DomainUsageRow = {
  name?: string;
  window?: { duration: number; unit: 'minute' | 'hour' | 'day' | 'week' };
  used: number;
  limit: number;
  resetAt?: string;
};

function toWireUsageRow(row: DomainUsageRow): UsageRow {
  return {
    name: row.name,
    window: row.window,
    used: row.used,
    limit: row.limit,
    reset_at: row.resetAt,
  };
}
