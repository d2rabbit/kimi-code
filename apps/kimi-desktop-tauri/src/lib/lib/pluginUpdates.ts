// pluginUpdates.ts — 插件更新的一次性提醒与配额提示，对齐 CLI 的
// plugin-update-notifier（apps/kimi-code/src/tui/controllers/plugin-update-notifier.ts）
// 用户语义：只有默认官方目录能背书“官方市场更新”提醒；每个插件的每个新版本
// 只提醒一次（localStorage 持久化）；提醒是后台好意，任何失败（如离线）静默吞掉。
// 与 CLI 的差异：版本比较不在客户端做——daemon 的 /plugins/marketplace 已经
// 按安装状态算好 update_available（packages/kap-server/src/routes/plugins.ts），
// 这里直接消费。

import { getKimiWebApi } from '../api';
import type { AppMarketplaceEntry } from '../api/types';
import { toast } from '../stores/toast.svelte';
import { STORAGE_KEYS, safeGetJson, safeSetJson } from './storage';

// Mirror of KIMI_CODE_PLUGIN_MARKETPLACE_URL in apps/kimi-code/src/constant/app.ts.
const OFFICIAL_MARKETPLACE_URL = 'https://code.kimi.com/kimi-code/plugins/marketplace.json';

// Mirror of QUOTA_CONSUMING_PLUGIN_IDS in apps/kimi-code/src/constant/app.ts:
// official plugins whose usage bills against the user's plan quota.
const QUOTA_CONSUMING_PLUGIN_IDS: readonly string[] = ['kimi-datasource'];

function readNotified(): Record<string, string> {
  return safeGetJson<Record<string, string>>(STORAGE_KEYS.pluginUpdateNotices) ?? {};
}

/** After installing an official quota-consuming plugin, surface the quota note. */
export function noteQuotaConsumingPlugin(entry: Pick<AppMarketplaceEntry, 'id' | 'tier'>): void {
  if (entry.tier !== 'official') return;
  if (!QUOTA_CONSUMING_PLUGIN_IDS.includes(entry.id)) return;
  toast.info('注意：该插件会消耗您的套餐额度。');
}

/**
 * Toast once per plugin per new marketplace version for installed, enabled
 * plugins with an update available. Fire-and-forget; failures are swallowed.
 */
export async function notifyPluginUpdatesOnce(): Promise<void> {
  try {
    const { source, plugins } = await getKimiWebApi().getPluginMarketplace();
    // A custom/registry-fallback source may advertise anything under any id —
    // only the default official catalog backs an update notice.
    if (source !== OFFICIAL_MARKETPLACE_URL) return;
    const notified = readNotified();
    const fresh = plugins.filter(
      (e) =>
        e.installed &&
        e.enabled !== false &&
        e.updateAvailable &&
        e.version !== undefined &&
        notified[e.id] !== e.version,
    );
    if (fresh.length === 0) return;
    const next = { ...notified };
    for (const e of fresh) next[e.id] = e.version!;
    safeSetJson(STORAGE_KEYS.pluginUpdateNotices, next);
    const first = fresh[0]!;
    toast.info(
      fresh.length === 1
        ? `检测到插件更新：${first.displayName} v${first.version} 可用，可在「插件 → 发现」中更新。`
        : `检测到 ${fresh.length} 个插件有可用更新，可在「插件 → 发现」中更新。`,
    );
  } catch {
    // offline marketplace / daemon hiccup — the notice is a background nicety
  }
}
