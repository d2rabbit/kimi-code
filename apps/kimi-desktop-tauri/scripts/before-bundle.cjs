// before-bundle.cjs — Tauri `beforeBundleCommand` hook.
//
// Stages the prebuilt kimi-code agent and the current Node runtime into
// src-tauri/resources/bin/. tauri.conf.json maps that directory to the bundle
// resource root, matching sea_path.rs (`$RESOURCE/main.cjs` + `node[.exe]`).
//
// Architecture (v2): the agent is a plain Node CJS bundle (main.cjs), not a
// SEA (Single Executable Application). This is ~30s to build vs 5-10min for
// SEA, and skips the postject/blob/sign pipeline entirely. The packaged app
// runs main.cjs via the bundled Node runtime.
//
// Mirrors the dev-mode path resolution in sea_path.rs (dev mode finds
// main.cjs at apps/kimi-code/dist-native/intermediates/main.cjs directly).

'use strict';

const { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, statSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');

// Resolve paths relative to this script.
const scriptDir = __dirname;
const desktopRoot = resolve(scriptDir, '..');
const repoRoot = resolve(desktopRoot, '..', '..');

// main.cjs is platform-independent (it's a JS bundle run by Node), unlike the
// old SEA which was a per-platform binary blob. No target detection needed.
const agentScript = resolve(repoRoot, 'apps', 'kimi-code', 'dist-native', 'intermediates', 'main.cjs');
const nodeRuntime = process.execPath;
const nodeVersion = process.versions.node.split('.').map(Number);
const minimumNodeVersion = [24, 15, 0];

function versionAtLeast(actual, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] > minimum[index]) return true;
    if (actual[index] < minimum[index]) return false;
  }
  return true;
}

if (!existsSync(agentScript)) {
  const msg =
    `Bundled kimi-code agent (main.cjs) not found at ${agentScript}. ` +
    `Build it first: \`bash scripts/build-run.sh --no-run\` ` +
    `(or \`pnpm -C apps/kimi-code exec tsdown --config tsdown.native.config.ts\`).`;
  console.error(`[before-bundle] ERROR: ${msg}`);
  process.exit(1);
}

if (!versionAtLeast(nodeVersion, minimumNodeVersion)) {
  console.error(
    `[before-bundle] ERROR: Node >= ${minimumNodeVersion.join('.')} is required, ` +
      `but the bundling process is using ${process.versions.node}.`,
  );
  process.exit(1);
}

if (!existsSync(nodeRuntime)) {
  console.error(`[before-bundle] ERROR: Node runtime not found at ${nodeRuntime}.`);
  process.exit(1);
}

const sizeMB = (statSync(agentScript).size / (1024 * 1024)).toFixed(1);

// Stage into src-tauri/resources/bin/. The directory is gitignored and rebuilt
// for every package so stale cross-platform runtimes cannot leak into a bundle.
const resourcesDir = resolve(desktopRoot, 'src-tauri', 'resources');
const stageDir = join(resourcesDir, 'bin');
const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
const nodeLicenseCandidates = [
  resolve(dirname(nodeRuntime), '..', 'LICENSE'),
  resolve(dirname(nodeRuntime), 'LICENSE'),
  resolve(dirname(nodeRuntime), '..', 'LICENSE.md'),
];
const nodeLicense = nodeLicenseCandidates.find(existsSync);

// Clean and recreate the staging directory.
rmSync(resolve(resourcesDir, 'bin'), { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });
copyFileSync(agentScript, join(stageDir, 'main.cjs'));
copyFileSync(nodeRuntime, join(stageDir, nodeName));
if (process.platform !== 'win32') chmodSync(join(stageDir, nodeName), 0o755);
if (nodeLicense) copyFileSync(nodeLicense, join(stageDir, 'node-LICENSE'));

const nodeSizeMB = (statSync(nodeRuntime).size / (1024 * 1024)).toFixed(1);
console.log(`[before-bundle] staged kimi-code agent (${sizeMB}MB) -> ${join(stageDir, 'main.cjs')}`);
console.log(
  `[before-bundle] staged Node ${process.versions.node} (${nodeSizeMB}MB) -> ${join(stageDir, nodeName)}`,
);
if (!nodeLicense) {
  console.warn('[before-bundle] WARNING: Node LICENSE was not found next to the runtime.');
}
