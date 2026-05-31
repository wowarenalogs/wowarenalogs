import fs from 'fs';
import path from 'path';

// Copies the noobs (libobs bindings) native module into the app build output so
// it gets packaged by electron-builder.
//
// noobs is a win32-only optionalDependency. On macOS/Linux it is legitimately
// absent and we skip silently. On Windows it is REQUIRED for video recording,
// so if it is missing (or its prebuilt `dist` is incomplete) we fail the build
// loudly rather than shipping a client that throws "Path to noobs does not
// exist" the first time a user tries to enable recording.
//
// We resolve noobs via require.resolve rather than a hardcoded
// ../../node_modules path so it works regardless of where npm hoists it.

const appDir = path.resolve(__dirname, '..');
const distDir = path.join(appDir, 'dist');

function resolveNoobsDir(): string | null {
  try {
    // Resolved relative to this package; walks up to the hoisted root install.
    const pkgJson = require.resolve('noobs/package.json', { paths: [appDir] });
    return path.dirname(pkgJson);
  } catch {
    return null;
  }
}

const isWindows = process.platform === 'win32';
const noobsDir = resolveNoobsDir();

if (!noobsDir) {
  const message = '[copyNoobs] noobs module not found.';
  if (isWindows) {
    console.error(
      `${message} It is required for Windows recording builds. Run "npm ci" and ensure the win32 optionalDependency installed.`,
    );
    process.exit(1);
  }
  console.warn(`${message} Skipping (expected on non-Windows platforms).`);
  process.exit(0);
}

const noobsDistDir = path.join(noobsDir, 'dist');
if (!fs.existsSync(noobsDistDir) || fs.readdirSync(noobsDistDir).length === 0) {
  const message = `[copyNoobs] noobs is installed at ${noobsDir} but its prebuilt "dist" is missing or empty.`;
  if (isWindows) {
    console.error(`${message} Cannot package a working Windows recorder.`);
    process.exit(1);
  }
  console.warn(`${message} Skipping (expected on non-Windows platforms).`);
  process.exit(0);
}

// Copy the prebuilt dist (noobs.node + obs-plugins/data/bin) to dist/dist, the
// primary location getNoobsDistPath() looks for when packaged.
const targetDistDir = path.join(distDir, 'dist');
fs.cpSync(noobsDistDir, targetDistDir, { recursive: true });

// Also copy the whole package into dist/node_modules/noobs so require('noobs')
// resolves and the legacy lookup path keeps working.
const targetModuleDir = path.join(distDir, 'node_modules', 'noobs');
fs.cpSync(noobsDir, targetModuleDir, { recursive: true });

// Verify the native addon actually landed; a partial copy is as broken as none.
const addonPath = path.join(targetDistDir, 'noobs.node');
if (!fs.existsSync(addonPath)) {
  console.error(`[copyNoobs] Copy completed but ${addonPath} is missing. Aborting.`);
  process.exit(1);
}

console.log(`[copyNoobs] Bundled noobs from ${noobsDir} -> ${targetDistDir}`);
