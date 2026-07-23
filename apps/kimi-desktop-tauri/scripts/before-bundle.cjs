// before-bundle.cjs — Tauri `beforeBundleCommand` hook.
//
// Stages the prebuilt kimi-code agent (main.cjs, bundled by tsdown) into
// src-tauri/resources/bin/ so that Tauri's `bundle.resources` rule copies
// it into the packaged app.
//
// Architecture (v2): the agent is a plain Node CJS bundle (main.cjs), not a
// SEA (Single Executable Application). This is ~30s to build vs 5-10min for
// SEA, and skips the postject/blob/sign pipeline entirely. The packaged app
// runs main.cjs via the bundled Node runtime.
//
// Mirrors the dev-mode path resolution in sea_path.rs (dev mode finds
// main.cjs at apps/kimi-code/dist-native/intermediates/main.cjs directly).

'use strict';

const { existsSync, rmSync, mkdirSync, copyFileSync, statSync } = require('node:fs');
const { join, resolve } = require('node:path');

// Resolve paths relative to this script.
const scriptDir = __dirname;
const desktopRoot = resolve(scriptDir, '..');
const repoRoot = resolve(desktopRoot, '..', '..');

// main.cjs is platform-independent (it's a JS bundle run by Node), unlike the
// old SEA which was a per-platform binary blob. No target detection needed.
const agentScript = resolve(repoRoot, 'apps', 'kimi-code', 'dist-native', 'intermediates', 'main.cjs');

if (!existsSync(agentScript)) {
  const msg =
    `Bundled kimi-code agent (main.cjs) not found at ${agentScript}. ` +
    `Build it first: \`bash scripts/build-run.sh --no-run\` ` +
    `(or \`pnpm -C apps/kimi-code exec tsdown --config tsdown.native.config.ts\`).`;
  console.error(`[before-bundle] ERROR: ${msg}`);
  process.exit(1);
}

const sizeMB = (statSync(agentScript).size / (1024 * 1024)).toFixed(1);

// Stage into src-tauri/resources/bin/ — the tauri.conf.json
// `bundle.resources: ["bin"]` rule copies this into the app bundle.
const resourcesDir = resolve(desktopRoot, 'src-tauri', 'resources');
const stageDir = join(resourcesDir, 'bin');

// Clean and recreate the staging directory.
rmSync(resolve(resourcesDir, 'bin'), { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });
copyFileSync(agentScript, join(stageDir, 'main.cjs'));

console.log(`[before-bundle] staged kimi-code agent (${sizeMB}MB) -> ${join(stageDir, 'main.cjs')}`);
