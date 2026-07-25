/**
 * `/plugins` REST routes — installed plugin management + marketplace browsing.
 *
 *   GET    /plugins                      installed list (`IPluginService.listPlugins`)
 *   GET    /plugins/marketplace          registry entries merged with install state
 *   POST   /plugins:install              install from a source URL/path (marketplace entry source)
 *   POST   /plugins/{id}:toggle          enable/disable
 *   DELETE /plugins/{id}                 uninstall
 *
 * Thin edge over the App-scope `IPluginService` (v2). The marketplace registry
 * is loaded server-side (`services/plugins/marketplace.ts` — CDN default, env
 * override, repo-local fallback), so desktop/web clients never fetch the CDN
 * directly and always see the same catalog as the CLI. Update availability is
 * computed by a simple semver-major/minor/patch compare against the entry's
 * declared/latest version (the CLI's GitHub-latest enrichment runs in the
 * loader already).
 *
 * **Error mapping**:
 *   - marketplace fetch/parse failure → envelope `code: 50001 internal.error`
 *     (via the global error handler) — the registry being down must not break
 *     the installed-list route.
 *   - install/toggle/remove service errors → 40001 validation.failed.
 *
 * **Anti-corruption**: route resolves every service via the accessor; no SDK
 * imports.
 */

import { IPluginService, type PluginSummary, type Scope } from '@moonshot-ai/agent-core-v2';
import { z } from 'zod';

import { errEnvelope, okEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';
import { ErrorCode } from '../protocol/error-codes';
import {
  installPluginRequestSchema,
  installPluginResultSchema,
  listPluginsResponseSchema,
  pluginMarketplaceResponseSchema,
  removePluginResultSchema,
  togglePluginRequestSchema,
  togglePluginResultSchema,
  type PluginMarketplaceEntry,
  type PluginSummary as ProtocolPluginSummary,
} from '../protocol/rest-plugins';
import { loadPluginMarketplaceCached } from '../services/plugins/marketplace';
import { parseActionSuffix } from './action-suffix';

interface PluginsRouteHost {
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

const pluginIdParamsSchema = z.object({
  id: z.string().min(1),
});

const pluginTailParamsSchema = z.object({
  tail: z.string().min(1),
});

function toProtocolSummary(p: PluginSummary): ProtocolPluginSummary {
  return {
    id: p.id,
    display_name: p.displayName,
    version: p.version,
    enabled: p.enabled,
    state: p.state,
    skill_count: p.skillCount,
    mcp_server_count: p.mcpServerCount,
    hook_count: p.hookCount,
    command_count: p.commandCount,
    has_errors: p.hasErrors,
    source: p.source,
    original_source: p.originalSource,
  };
}

/** Coarse semver compare: true when `latest` is a higher x.y.z than `local`. */
function isNewerVersion(latest: string, local: string): boolean {
  const parse = (v: string): number[] | null => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const a = parse(latest);
  const b = parse(local);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i]! > b[i]!) return true;
    if (a[i]! < b[i]!) return false;
  }
  return false;
}

export function registerPluginsRoutes(app: PluginsRouteHost, core: Scope): void {
  // GET /plugins ---------------------------------------------------------
  const listRoute = defineRoute(
    {
      method: 'GET',
      path: '/plugins',
      success: { data: listPluginsResponseSchema },
      description: 'List installed plugins',
      tags: ['plugins'],
      operationId: 'listPlugins',
    },
    async (req, reply) => {
      const plugins = await core.accessor.get(IPluginService).listPlugins();
      reply.send(okEnvelope({ plugins: plugins.map(toProtocolSummary) }, req.id));
    },
  );
  app.get(listRoute.path, listRoute.options, listRoute.handler as Parameters<PluginsRouteHost['get']>[2]);

  // GET /plugins/marketplace ----------------------------------------------
  const marketplaceRoute = defineRoute(
    {
      method: 'GET',
      path: '/plugins/marketplace',
      success: { data: pluginMarketplaceResponseSchema },
      description: 'Browse the plugin marketplace registry, merged with install state',
      tags: ['plugins'],
      operationId: 'getPluginMarketplace',
    },
    async (req, reply) => {
      const [marketplace, installed] = await Promise.all([
        loadPluginMarketplaceCached({ workDir: process.cwd() }),
        core.accessor.get(IPluginService).listPlugins(),
      ]);
      const byId = new Map(installed.map((p) => [p.id, p]));
      const entries: PluginMarketplaceEntry[] = marketplace.plugins.map((entry) => {
        const local = byId.get(entry.id);
        const updateAvailable =
          local !== undefined && entry.version !== undefined && local.version !== undefined
            ? isNewerVersion(entry.version, local.version)
            : false;
        return {
          id: entry.id,
          display_name: entry.displayName,
          source: entry.source,
          tier: entry.tier,
          version: entry.version,
          description: entry.description,
          homepage: entry.homepage,
          keywords: entry.keywords ? [...entry.keywords] : undefined,
          installed: local !== undefined,
          installed_version: local?.version,
          enabled: local?.enabled,
          update_available: updateAvailable,
        };
      });
      reply.send(okEnvelope({ source: marketplace.source, plugins: entries }, req.id));
    },
  );
  app.get(
    marketplaceRoute.path,
    marketplaceRoute.options,
    marketplaceRoute.handler as Parameters<PluginsRouteHost['get']>[2],
  );

  // POST /plugins:install --------------------------------------------------
  const installRoute = defineRoute(
    {
      method: 'POST',
      path: '/plugins:install',
      body: installPluginRequestSchema,
      success: { data: installPluginResultSchema },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: {},
      },
      description: 'Install a plugin from a source (GitHub URL / zip URL / local path)',
      tags: ['plugins'],
      operationId: 'installPlugin',
    },
    async (req, reply) => {
      try {
        const plugin = await core.accessor
          .get(IPluginService)
          .installPlugin({ source: req.body.source });
        reply.send(okEnvelope({ plugin: toProtocolSummary(plugin) }, req.id));
      } catch (err) {
        if (err instanceof Error) {
          reply.send(errEnvelope(ErrorCode.VALIDATION_FAILED, err.message, req.id, err.stack));
          return;
        }
        throw err;
      }
    },
  );
  app.post(
    installRoute.path,
    installRoute.options,
    installRoute.handler as Parameters<PluginsRouteHost['post']>[2],
  );

  // POST /plugins/{id}:{toggle} --------------------------------------------
  const tailRoute = defineRoute(
    {
      method: 'POST',
      path: '/plugins/{tail}',
      body: togglePluginRequestSchema,
      params: pluginTailParamsSchema,
      success: { data: togglePluginResultSchema },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: {},
      },
      description: 'Enable or disable a plugin (:toggle)',
      tags: ['plugins'],
      operationId: 'togglePlugin',
    },
    async (req, reply) => {
      const { tail } = req.params;
      const parsed = parseActionSuffix({ tail, allowedActions: ['toggle'] as const, resourceLabel: 'plugin' });
      if (parsed.kind !== 'action') {
        reply.send(
          errEnvelope(ErrorCode.VALIDATION_FAILED, parsed.kind === 'bare' ? `unsupported action: ${tail}` : parsed.reason, req.id),
        );
        return;
      }
      try {
        await core.accessor
          .get(IPluginService)
          .setPluginEnabled({ id: parsed.id, enabled: req.body.enabled });
        reply.send(okEnvelope({ ok: true }, req.id));
      } catch (err) {
        if (err instanceof Error) {
          reply.send(errEnvelope(ErrorCode.VALIDATION_FAILED, err.message, req.id, err.stack));
          return;
        }
        throw err;
      }
    },
  );
  app.post(
    tailRoute.path,
    tailRoute.options,
    tailRoute.handler as Parameters<PluginsRouteHost['post']>[2],
  );

  // DELETE /plugins/{id} ----------------------------------------------------
  const removeRoute = defineRoute(
    {
      method: 'DELETE',
      path: '/plugins/{id}',
      params: pluginIdParamsSchema,
      success: { data: removePluginResultSchema },
      description: 'Uninstall a plugin',
      tags: ['plugins'],
      operationId: 'removePlugin',
    },
    async (req, reply) => {
      const { id } = req.params;
      try {
        await core.accessor.get(IPluginService).removePlugin({ id });
        reply.send(okEnvelope({ removed: true }, req.id));
      } catch (err) {
        if (err instanceof Error) {
          reply.send(okEnvelope({ removed: false }, req.id));
          return;
        }
        throw err;
      }
    },
  );
  app.delete(
    removeRoute.path,
    removeRoute.options,
    removeRoute.handler as Parameters<PluginsRouteHost['delete']>[2],
  );
}
