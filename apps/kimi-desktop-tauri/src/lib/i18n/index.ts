// i18n/index.ts — svelte-i18n setup for the Tauri desktop app.
//
// Replaces kimi-web's vue-i18n with svelte-i18n, keeping the same locale
// messages and a compatible `i18n.global.t()` shim so that the copied API
// layer (agentEventProjector / eventReducer) can call `i18n.global.t(key)`
// without modification.
//
// Components use `import { t } from 'svelte-i18n'` and `$t('key')` in markup.

import { init, addMessages, getLocaleFromNavigator, locale as svelteLocale } from 'svelte-i18n';
import { messages } from './locales';
import { safeGetString, safeSetString, STORAGE_KEYS } from '../lib/storage';

export const availableLocales = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
] as const;

export type LocaleCode = (typeof availableLocales)[number]['code'];

let activeLocale: LocaleCode = 'en';

function detect(): LocaleCode {
  const stored = safeGetString(STORAGE_KEYS.locale);
  if (stored === 'en' || stored === 'zh') return stored;
  const nav = getLocaleFromNavigator() ?? 'en';
  return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

activeLocale = detect();

// Initialise svelte-i18n with the full message catalogue.
init({
  fallbackLocale: 'en',
  initialLocale: activeLocale,
});

// Register all messages for both locales.
for (const [lang, dict] of Object.entries(messages)) {
  addMessages(lang, dict);
}

/**
 * Resolve a dotted i18n key (e.g. "tasks.defaultDescription") from the loaded
 * message catalogue for the given locale, with English fallback.
 */
function resolveMessage(locale: string, key: string): string {
  for (const loc of [locale, 'en']) {
    const parts = key.split('.');
    let cur: unknown = (messages as Record<string, Record<string, unknown>>)[loc];
    let ok = true;
    for (const part of parts) {
      if (cur && typeof cur === 'object' && part in cur) {
        cur = (cur as Record<string, unknown>)[part];
      } else {
        ok = false;
        break;
      }
    }
    if (ok && typeof cur === 'string') return cur;
  }
  return key;
}

/**
 * vue-i18n compatibility shim.
 *
 * The copied API layer (agentEventProjector, eventReducer) imports `i18n` and
 * calls `i18n.global.t(key)`. svelte-i18n exposes translations via stores
 * instead. This object bridges the two so the copied code needs no changes.
 */
export const i18n = {
  global: {
    /**
     * Resolve a key and interpolate `{name}` placeholders with params
     * (e.g. t('tools.chip.todos', { count: 3 }) → '3 项').
     */
    t(key: string, params?: Record<string, unknown>): string {
      const template = resolveMessage(activeLocale, key);
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (m, name) =>
        name in params ? String(params[name]) : m,
      );
    },
    locale: {
      get value(): string {
        return activeLocale;
      },
    },
  },
};

export function setLocale(l: LocaleCode): void {
  activeLocale = l;
  svelteLocale.set(l);
  safeSetString(STORAGE_KEYS.locale, l);
}

export default i18n;
