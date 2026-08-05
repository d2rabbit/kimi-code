/**
 *   GET    /v1/plugins                     data: {plugins: PluginSummary[]}
 *   GET    /v1/plugins/marketplace         data: {source, plugins: MarketplaceEntry[]}
 *   POST   /v1/plugins:install             body: {source} → {plugin: PluginSummary}
 *   POST   /v1/plugins/{id}:toggle         body: {enabled} → {ok: true}
 *   DELETE /v1/plugins/{id}                data: {removed: boolean}
 */

import { z } from 'zod';

export const pluginSummarySchema = z.object({
  id: z.string().min(1),
  display_name: z.string(),
  version: z.string().optional(),
  enabled: z.boolean(),
  state: z.enum(['ok', 'error']),
  skill_count: z.number(),
  mcp_server_count: z.number(),
  hook_count: z.number(),
  command_count: z.number(),
  has_errors: z.boolean(),
  source: z.enum(['local-path', 'zip-url', 'github']),
  original_source: z.string().optional(),
});
export type PluginSummary = z.infer<typeof pluginSummarySchema>;

export const listPluginsResponseSchema = z.object({
  plugins: z.array(pluginSummarySchema),
});
export type ListPluginsResponse = z.infer<typeof listPluginsResponseSchema>;

export const pluginMarketplaceEntrySchema = z.object({
  id: z.string().min(1),
  display_name: z.string(),
  source: z.string(),
  tier: z.enum(['official', 'curated']).optional(),
  version: z.string().optional(),
  description: z.string().optional(),
  homepage: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  /** Server-injected built-in capability row (kimi-cu / kimi-webbridge). */
  built_in: z.boolean().optional(),
  /** Merged install state (absent when not installed). */
  installed: z.boolean(),
  installed_version: z.string().optional(),
  enabled: z.boolean().optional(),
  update_available: z.boolean().optional(),
});
export type PluginMarketplaceEntry = z.infer<typeof pluginMarketplaceEntrySchema>;

export const pluginMarketplaceResponseSchema = z.object({
  source: z.string(),
  plugins: z.array(pluginMarketplaceEntrySchema),
});
export type PluginMarketplaceResponse = z.infer<typeof pluginMarketplaceResponseSchema>;

export const installPluginRequestSchema = z.object({
  /** GitHub URL / zip URL / local path (marketplace entry's `source`). */
  source: z.string().min(1),
});
export type InstallPluginRequest = z.infer<typeof installPluginRequestSchema>;

export const installPluginResultSchema = z.object({
  plugin: pluginSummarySchema,
});
export type InstallPluginResult = z.infer<typeof installPluginResultSchema>;

export const togglePluginRequestSchema = z.object({
  enabled: z.boolean(),
});
export type TogglePluginRequest = z.infer<typeof togglePluginRequestSchema>;

export const togglePluginResultSchema = z.object({
  ok: z.literal(true),
});
export type TogglePluginResult = z.infer<typeof togglePluginResultSchema>;

export const removePluginResultSchema = z.object({
  removed: z.boolean(),
});
export type RemovePluginResult = z.infer<typeof removePluginResultSchema>;
