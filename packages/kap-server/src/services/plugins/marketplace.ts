/**
 * Plugin marketplace registry loader — server-side port of
 * `apps/kimi-code/src/utils/plugin-marketplace.ts` (trimmed).
 *
 * Resolution order:
 *   1. `KIMI_CODE_PLUGIN_MARKETPLACE_URL` env (URL | file:// | path)
 *   2. CDN default (`https://code.kimi.com/kimi-code/plugins/marketplace.json`)
 *   3. source-checkout fallback `plugins/marketplace.json` (repo root) when
 *      the default source is unreachable
 *
 * Entries missing `version` are enriched best-effort from the GitHub
 * `/releases/latest` redirect (no API quota), same as the CLI.
 */

import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CDN_MARKETPLACE_URL = 'https://code.kimi.com/kimi-code/plugins/marketplace.json';
const MARKETPLACE_URL_ENV = 'KIMI_CODE_PLUGIN_MARKETPLACE_URL';

export const PLUGIN_MARKETPLACE_TIERS = ['official', 'curated'] as const;
export type PluginMarketplaceTier = (typeof PLUGIN_MARKETPLACE_TIERS)[number];

export interface PluginMarketplaceEntry {
  readonly id: string;
  readonly displayName: string;
  readonly source: string;
  readonly tier?: PluginMarketplaceTier;
  readonly version?: string;
  readonly description?: string;
  readonly homepage?: string;
  readonly keywords?: readonly string[];
}

export interface PluginMarketplace {
  readonly source: string;
  readonly version?: string;
  readonly plugins: readonly PluginMarketplaceEntry[];
}

interface MarketplaceLocation {
  readonly raw: string;
  readonly kind: 'remote' | 'local';
  readonly resolved: string;
}

export async function loadPluginMarketplace(options: {
  workDir: string;
  fetchImpl?: typeof fetch;
}): Promise<PluginMarketplace> {
  const configuredSource = process.env[MARKETPLACE_URL_ENV];
  const location = resolveMarketplaceLocation(configuredSource ?? CDN_MARKETPLACE_URL, options.workDir);
  const fetchImpl = options.fetchImpl ?? fetch;
  let raw: string;
  try {
    raw = await readMarketplaceText(location, fetchImpl);
  } catch (error) {
    const fallback =
      configuredSource === undefined ? await getSourceCheckoutMarketplaceLocation() : undefined;
    if (fallback === undefined) throw error;
    raw = await readMarketplaceText(fallback, fetchImpl);
    return withLatestVersions(parsePluginMarketplace(raw, fallback), fetchImpl);
  }
  return withLatestVersions(parsePluginMarketplace(raw, location), fetchImpl);
}

// ---------------------------------------------------------------------------
// TTL cache — the registry + GitHub latest-release enrichment cost seconds;
// route handlers should go through `loadPluginMarketplaceCached` so repeat
// browses are instant.
// ---------------------------------------------------------------------------

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

let cacheEntry: { readonly key: string; readonly at: number; readonly value: PluginMarketplace } | undefined;

export async function loadPluginMarketplaceCached(options: {
  workDir: string;
  ttlMs?: number;
}): Promise<PluginMarketplace> {
  const key = `${process.env[MARKETPLACE_URL_ENV] ?? CDN_MARKETPLACE_URL}@${options.workDir}`;
  const now = Date.now();
  if (cacheEntry && cacheEntry.key === key && now - cacheEntry.at < (options.ttlMs ?? DEFAULT_CACHE_TTL_MS)) {
    return cacheEntry.value;
  }
  const value = await loadPluginMarketplace(options);
  cacheEntry = { key, at: now, value };
  return value;
}

async function withLatestVersions(
  marketplace: PluginMarketplace,
  fetchImpl: typeof fetch,
): Promise<PluginMarketplace> {
  const plugins = await Promise.all(
    marketplace.plugins.map(async (entry) => {
      if (entry.version !== undefined) return entry;
      const latest = await resolveLatestGithubRelease(entry.source, fetchImpl);
      return latest === undefined ? entry : { ...entry, version: latest };
    }),
  );
  return { ...marketplace, plugins };
}

export function parsePluginMarketplace(raw: string, location: MarketplaceLocation): PluginMarketplace {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Plugin marketplace is not valid JSON: ${formatParseError(error)}`);
  }
  if (!isRecord(parsed)) {
    throw new TypeError('Plugin marketplace must be an object.');
  }
  const rawPlugins = parsed['plugins'];
  if (!Array.isArray(rawPlugins)) {
    throw new TypeError('Plugin marketplace must contain a "plugins" array.');
  }
  return {
    source: location.resolved,
    version: stringField(parsed, 'version'),
    plugins: rawPlugins.map((entry, index) => parseMarketplaceEntry(entry, index, location)),
  };
}

function resolveMarketplaceLocation(source: string, workDir: string): MarketplaceLocation {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    throw new Error(`${MARKETPLACE_URL_ENV} cannot be empty.`);
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return { raw: trimmed, kind: 'remote', resolved: trimmed };
  }
  if (trimmed.startsWith('file://')) {
    const path = fileURLToPath(trimmed);
    return { raw: trimmed, kind: 'local', resolved: path };
  }
  return { raw: trimmed, kind: 'local', resolved: resolveLocalPath(trimmed, workDir) };
}

async function getSourceCheckoutMarketplaceLocation(): Promise<MarketplaceLocation | undefined> {
  const sourceDir = dirname(fileURLToPath(import.meta.url));
  const marketplacePath = resolve(sourceDir, '../../../../../plugins/marketplace.json');
  const info = await stat(marketplacePath).catch(() => undefined);
  if (info?.isFile() !== true) return undefined;
  return { raw: marketplacePath, kind: 'local', resolved: marketplacePath };
}

async function readMarketplaceText(
  location: MarketplaceLocation,
  fetchImpl: typeof fetch,
): Promise<string> {
  if (location.kind === 'local') {
    return readFile(location.resolved, 'utf8');
  }
  const response = await fetchImpl(location.resolved);
  if (!response.ok) {
    throw new Error(`Plugin marketplace returned HTTP ${response.status}`);
  }
  return response.text();
}

function parseMarketplaceEntry(
  value: unknown,
  index: number,
  location: MarketplaceLocation,
): PluginMarketplaceEntry {
  if (!isRecord(value)) {
    throw new TypeError(`Plugin marketplace entry ${index + 1} must be an object.`);
  }
  const id = requiredString(value, 'id', index);
  const source = stringField(value, 'source') ?? stringField(value, 'url') ?? stringField(value, 'downloadUrl');
  if (source === undefined) {
    throw new Error(`Plugin marketplace entry ${id} must define "source".`);
  }
  const resolvedSource = resolveEntrySource(source, location);
  return {
    id,
    displayName: stringField(value, 'displayName') ?? stringField(value, 'name') ?? id,
    source: resolvedSource,
    tier: parseMarketplaceTier(value, id),
    version: stringField(value, 'version') ?? deriveVersionFromGithubSource(resolvedSource),
    description: stringField(value, 'description') ?? stringField(value, 'shortDescription'),
    homepage: stringField(value, 'homepage') ?? stringField(value, 'websiteURL'),
    keywords: stringArrayField(value, 'keywords'),
  };
}

function parseMarketplaceTier(
  value: Record<string, unknown>,
  id: string,
): PluginMarketplaceTier | undefined {
  const raw = value['tier'];
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') {
    throw new TypeError(`Plugin marketplace entry ${id} "tier" must be a string.`);
  }
  const tier = raw.trim();
  if (tier.length === 0) return undefined;
  if ((PLUGIN_MARKETPLACE_TIERS as readonly string[]).includes(tier)) {
    return tier as PluginMarketplaceTier;
  }
  throw new Error(
    `Plugin marketplace entry ${id} "tier" must be one of: ${PLUGIN_MARKETPLACE_TIERS.join(', ')}.`,
  );
}

function resolveEntrySource(source: string, location: MarketplaceLocation): string {
  const trimmed = source.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('~/') ||
    trimmed === '~' ||
    isAbsolute(trimmed)
  ) {
    return trimmed;
  }
  if (trimmed.startsWith('file://')) return fileURLToPath(trimmed);
  if (location.kind === 'remote') {
    return new URL(trimmed, location.resolved).toString();
  }
  return resolve(dirname(location.resolved), trimmed);
}

/** Best-effort semver from a GitHub source URL that pins a ref (releases/tag, tree, commit). */
function deriveVersionFromGithubSource(source: string): string | undefined {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return undefined;
  }
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
    return undefined;
  }
  const [, , kind, a, b] = url.pathname.split('/').filter(Boolean);
  const ref =
    kind === 'releases' && a === 'tag' ? b : kind === 'tree' || kind === 'commit' ? a : undefined;
  if (ref === undefined) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(ref);
  } catch {
    decoded = ref;
  }
  const candidate = decoded.replace(/^v/i, '');
  return /^\d+\.\d+\.\d+/.test(candidate) ? candidate : undefined;
}

async function resolveLatestGithubRelease(
  source: string,
  fetchImpl: typeof fetch,
): Promise<string | undefined> {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return undefined;
  }
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return undefined;
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 2) return undefined;
  const [owner, repo] = segments;
  try {
    const resp = await fetchImpl(`https://github.com/${owner}/${repo}/releases/latest`, {
      redirect: 'manual',
    });
    if (resp.status === 404) return undefined;
    if (resp.status !== 301 && resp.status !== 302) return undefined;
    const location = resp.headers.get('location');
    if (location === null) return undefined;
    const match = /\/releases\/tag\/([^/?#]+)/.exec(location);
    const tag = match?.[1];
    if (tag === undefined) return undefined;
    let decoded: string;
    try {
      decoded = decodeURIComponent(tag);
    } catch {
      decoded = tag;
    }
    const candidate = decoded.replace(/^v/i, '');
    return /^\d+\.\d+\.\d+/.test(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function resolveLocalPath(input: string, workDir: string): string {
  if (input === '~') return homedir();
  if (input.startsWith('~/')) return join(homedir(), input.slice(2));
  return isAbsolute(input) ? input : resolve(workDir, input);
}

function requiredString(value: Record<string, unknown>, field: string, index: number): string {
  const result = stringField(value, field);
  if (result === undefined) {
    throw new Error(`Plugin marketplace entry ${index + 1} must define "${field}".`);
  }
  return result;
}

function stringField(value: Record<string, unknown>, field: string): string | undefined {
  const raw = value[field];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function stringArrayField(
  value: Record<string, unknown>,
  field: string,
): readonly string[] | undefined {
  const raw = value[field];
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return out.length > 0 ? out : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatParseError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
