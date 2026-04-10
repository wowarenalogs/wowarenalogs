/* eslint-disable no-console */
import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';

const DATA_DIR = path.resolve(__dirname, '../../shared/src/data');
const OUTPUT_FILE = path.join(DATA_DIR, 'dataManifest.json');
const REPO_ROOT = path.resolve(__dirname, '../../..');

// Files to track. Each entry records source, generation script, and WoW data dependency.
const TRACKED_FILES: Array<{
  file: string;
  description: string;
  generatedBy: string;
  wowDataDependent: boolean;
}> = [
  {
    file: 'spellEffects.json',
    description: 'Per-spell cooldown, duration, dispelType from Wago.tools DB2',
    generatedBy: 'npm run start:refreshSpellMetadata (packages/tools)',
    wowDataDependent: true,
  },
  {
    file: 'spells.json',
    description: 'Spell type/priority classifications from BigDebuffs addon',
    generatedBy: 'npm run start:generateSpellsData (packages/tools)',
    wowDataDependent: true,
  },
  {
    file: 'spellIdLists.json',
    description: 'bigDefensive / externalDefensive / important spell ID lists from Wago.tools + SimC flags',
    generatedBy: 'npm run start:generateSpellIdLists (packages/tools)',
    wowDataDependent: true,
  },
  {
    file: 'talentIdMap.json',
    description: 'Full talent tree structure per spec from Wago.tools Talent API',
    generatedBy: 'npm run start:refreshSpellMetadata (packages/tools)',
    wowDataDependent: true,
  },
  {
    file: 'raidbotsEnchantments.json',
    description: 'Enchantment metadata from Raidbots live API',
    generatedBy: 'Manual: download https://www.raidbots.com/static/data/live/enchantments.json',
    wowDataDependent: true,
  },
];

function sha256(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function entryCount(filePath: string): number {
  try {
    const data = fs.readJsonSync(filePath);
    if (Array.isArray(data)) return data.length;
    if (typeof data === 'object' && data !== null) return Object.keys(data).length;
    return 0;
  } catch {
    return 0;
  }
}

function gitLastCommit(filePath: string): { hash: string; date: string; subject: string } | null {
  try {
    const relPath = path.relative(REPO_ROOT, filePath);
    const out = execSync(`git -C "${REPO_ROOT}" log -1 --format="%H|%aI|%s" -- "${relPath}"`, {
      encoding: 'utf-8',
    }).trim();
    if (!out) return null;
    const [hash, date, subject] = out.split('|');
    return { hash, date, subject };
  } catch {
    return null;
  }
}

function currentGitCommit(): string {
  try {
    return execSync(`git -C "${REPO_ROOT}" rev-parse HEAD`, { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

interface FileManifestEntry {
  description: string;
  generatedBy: string;
  wowDataDependent: boolean;
  entryCount: number;
  sha256: string;
  lastCommit: { hash: string; date: string; subject: string } | null;
}

interface DataManifest {
  generatedAt: string;
  gitCommit: string;
  files: Record<string, FileManifestEntry>;
}

function main() {
  console.log('Generating data manifest...');

  const manifest: DataManifest = {
    generatedAt: new Date().toISOString(),
    gitCommit: currentGitCommit(),
    files: {},
  };

  for (const tracked of TRACKED_FILES) {
    const filePath = path.join(DATA_DIR, tracked.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  MISSING: ${tracked.file}`);
      continue;
    }

    const entry: FileManifestEntry = {
      description: tracked.description,
      generatedBy: tracked.generatedBy,
      wowDataDependent: tracked.wowDataDependent,
      entryCount: entryCount(filePath),
      sha256: sha256(filePath),
      lastCommit: gitLastCommit(filePath),
    };

    manifest.files[tracked.file] = entry;

    const commitDate = entry.lastCommit?.date ?? 'unknown';
    console.log(`  ${tracked.file}: ${entry.entryCount} entries, last updated ${commitDate}`);
  }

  fs.writeJsonSync(OUTPUT_FILE, manifest, { spaces: 2 });
  console.log(`\nManifest written to ${path.relative(REPO_ROOT, OUTPUT_FILE)}`);
}

main();
