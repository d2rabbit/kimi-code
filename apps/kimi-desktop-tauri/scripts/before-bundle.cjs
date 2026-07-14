// before-bundle.cjs — Tauri `beforeBundleCommand` hook.
//
// Stages the matching prebuilt Kimi SEA backend into src-tauri/resources/bin/<target>/
// so that Tauri's `bundle.resources` rule copies it into the packaged app.
//
// The SEA is per-platform (the blob is injected into the host Node binary), so
// each OS must be built on its own CI runner. This script stages exactly the
// one matching the current platform.
//
// Mirrors apps/kimi-desktop/scripts/before-pack.cjs (Electron version).

'use strict';

const { existsSync, rmSync, mkdirSync, cpSync } = require('node:fs');
const { join, resolve } = require('node:path');

// Tauri passes the target info via environment variables during build.
// We derive the platform-arch triple from process.env or the current process.
function detectTarget() {
  const platform = process.env.TAURI_PLATFORM || process.platform;
  const arch = process.env.TAURI_ARCH || process.arch;

  const osMap = { darwin: 'darwin', win32: 'win32', linux: 'linux' };
  const archMap = { x64: 'x64', arm64: 'arm64', x86_64: 'x64', aarch64: 'arm64' };

  const os = osMap[platform] ?? platform;
  const a = archMap[arch] ?? arch;
  return `${os}-${a}`;
}

const target = detectTarget();
const exe = process.platform === 'win32' ? 'kimi.exe' : 'kimi';

// Resolve paths relative to this script.
const scriptDir = __dirname;
const desktopRoot = resolve(scriptDir, '..');
// The SEA is built by: pnpm -C apps/kimi-code build:native:sea
// Output: apps/kimi-code/dist-native/bin/<target>/kimi[.exe]
const seaDir = resolve(desktopRoot, '..', 'kimi-code', 'dist-native', 'bin', target);
const seaExe = join(seaDir, exe);

if (!existsSync(seaExe)) {
  const msg =
    `Bundled Kimi server not found for ${target} at ${seaExe}. ` +
    `Build it first: \`pnpm -C apps/kimi-code build:native:sea\` ` +
    `(CI builds the SEA on each platform runner before packaging).`;
  console.error(`[before-bundle] ERROR: ${msg}`);
  process.exit(1);
}

// Stage into src-tauri/resources/bin/<target>/ — the tauri.conf.json
// `bundle.resources: ["bin"]` rule copies this into the app bundle.
const resourcesDir = resolve(desktopRoot, 'src-tauri', 'resources');
const stageDir = join(resourcesDir, 'bin', target);

// Clean and recreate the staging directory.
rmSync(resolve(resourcesDir, 'bin'), { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });
cpSync(seaDir, stageDir, { recursive: true });

console.log(`[before-bundle] staged Kimi server (${target}) -> ${stageDir}`);
