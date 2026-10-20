/* eslint-disable no-console */
/**
 * Refresh the spell-icon assets served from gs://images.wowarenalogs.com/spells/{spellId}.jpg.
 *
 * This replaces the old `refreshSpellIcons` Cloud Function, which scraped
 * wowhead.com HTML per spell (now 403'd behind Cloudflare) on a 4-hourly
 * Pub/Sub trigger. Instead we resolve icons straight from the authoritative
 * DB2 data we already ingest from wago.tools, which is only meaningful to
 * re-run when a patch drops (bump WAGO_BUILD):
 *
 *   SpellMisc.SpellIconFileDataID        (per SpellID)
 *     -> ManifestInterfaceData[FDID].FileName   (strip ".blp", lowercase)
 *     -> https://wow.zamimg.com/images/wow/icons/large/{name}.jpg
 *     -> upload to gs://images.wowarenalogs.com/spells/{spellId}.jpg
 *
 * The produced assets are the exact same zamimg "large" JPEGs the previous
 * function stored (verified byte-identical), so this is a drop-in for the
 * asset pipeline — just sourced in bulk instead of by brittle scraping.
 *
 * Usage:
 *   npm --workspace @wowarenalogs/tools run start:refreshSpellIcons            # tracked spells only (fast)
 *   npm --workspace @wowarenalogs/tools run start:refreshSpellIcons -- --all   # every SpellMisc spell (full backfill)
 *   ... -- --force          re-upload even if the asset already exists (use when a patch changes existing art)
 *   ... -- --dry-run        resolve and report, but do not touch the bucket
 *   ... -- --concurrency=32 tune parallelism (default 24)
 *   ... -- --build=12.0.1.X override WAGO_BUILD
 *
 * Auth: uses Application Default Credentials (run `gcloud auth application-default login`)
 * or GOOGLE_APPLICATION_CREDENTIALS, and must have write access to the images bucket.
 */
import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import _ from 'lodash';
import fetch from 'node-fetch';
import path from 'path';

import { CsvRow, loadCsv } from './csv';
import { WAGO_BUILD, WAGO_DB2_BASE } from './wagoConfig';

const PROJECT_ID = 'wowarenalogs';
const BUCKET_NAME = 'images.wowarenalogs.com';
const ZAMIMG_LARGE = 'https://wow.zamimg.com/images/wow/icons/large';
const DATA_DIR = path.resolve(__dirname, '../../shared/src/data');

interface Options {
  all: boolean;
  force: boolean;
  dryRun: boolean;
  concurrency: number;
  build: string;
}

function parseArgs(argv: string[]): Options {
  const has = (flag: string) => argv.includes(flag);
  const value = (prefix: string) => {
    const match = argv.find((a) => a.startsWith(prefix));
    return match ? match.slice(prefix.length) : undefined;
  };
  const concurrency = parseInt(value('--concurrency=') ?? '', 10);
  return {
    all: has('--all'),
    force: has('--force'),
    dryRun: has('--dry-run'),
    concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 24,
    build: value('--build=') ?? WAGO_BUILD,
  };
}

/** Read the spellId keys/values out of a data file, tolerating absence. */
function readSpellIds(file: string, pick: (json: unknown) => string[]): string[] {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) {
    console.warn(`  (skipping ${file}: not found)`);
    return [];
  }
  try {
    return pick(JSON.parse(fs.readFileSync(full, 'utf8')));
  } catch (e) {
    console.error(`  failed to read ${file}:`, e);
    return [];
  }
}

/**
 * The spells the app actually renders in combat reports: the union of its
 * tracked metadata sets. This is the conservative default — far smaller than
 * the full 400k-row Spell table, and it guarantees every UI spell has an icon.
 */
function trackedSpellIds(): string[] {
  const ids = new Set<string>();
  const add = (list: string[]) => list.forEach((id) => id && ids.add(String(id)));
  add(readSpellIds('spellEffects.json', (j) => Object.keys(j as Record<string, unknown>)));
  add(readSpellIds('spells.json', (j) => Object.keys(j as Record<string, unknown>)));
  add(readSpellIds('spellClassMap.json', (j) => Object.keys(j as Record<string, unknown>)));
  add(
    readSpellIds('spellIdLists.json', (j) => {
      const d = j as Record<string, string[]>;
      return [...(d.importantSpellIds ?? []), ...(d.externalOrBigDefensiveSpellIds ?? [])];
    }),
  );
  return Array.from(ids);
}

/** FileDataID -> lowercase icon name (no extension), e.g. "spell_holy_magicalsentry". */
function buildIconNameIndex(manifestRows: CsvRow[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const row of manifestRows) {
    const fileName = row.FileName;
    if (!fileName) continue;
    // Strip the extension, then normalize to the zamimg CDN naming: lowercase,
    // trimmed, with internal spaces as hyphens (e.g. DB2 "Spell_Frost_Ring of Frost.blp"
    // -> "spell_frost_ring-of-frost", the file zamimg actually serves).
    const name = fileName
      .replace(/\.[^.]+$/, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
    if (name) index.set(row.ID, name);
  }
  return index;
}

/** Run `task` over `items` with a fixed-size worker pool. */
async function mapPool<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await task(item);
    }
  };
  await Promise.all(_.range(Math.min(concurrency, items.length)).map(() => worker()));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(
    `refreshSpellIcons: build=${opts.build} set=${opts.all ? 'all' : 'tracked'} ` +
      `force=${opts.force} dryRun=${opts.dryRun} concurrency=${opts.concurrency}`,
  );

  const db2Csv = (table: string) => `${WAGO_DB2_BASE}/${table}/csv?build=${encodeURIComponent(opts.build)}`;

  // 1) SpellID -> SpellIconFileDataID
  console.log('Loading SpellMisc...');
  const spellMiscRows = await loadCsv(db2Csv('SpellMisc'));
  const iconFdidBySpellId = new Map<string, string>();
  for (const row of spellMiscRows) {
    const fdid = row.SpellIconFileDataID;
    if (row.SpellID && fdid && fdid !== '0') {
      iconFdidBySpellId.set(row.SpellID, fdid);
    }
  }

  // 2) FileDataID -> icon name
  console.log('Loading ManifestInterfaceData...');
  const iconNameByFdid = buildIconNameIndex(await loadCsv(db2Csv('ManifestInterfaceData')));

  // 3) decide which spellIds to process
  const spellIds = opts.all ? Array.from(iconFdidBySpellId.keys()) : trackedSpellIds();
  console.log(`Processing ${spellIds.length} spell ids...`);

  const storage = new Storage({ projectId: PROJECT_ID });
  const bucket = storage.bucket(BUCKET_NAME);

  const stats = { uploaded: 0, skippedExisting: 0, noIcon: 0, unresolved: 0, zamimgMissing: 0, failed: 0 };

  await mapPool(spellIds, opts.concurrency, async (spellId) => {
    try {
      const fdid = iconFdidBySpellId.get(spellId);
      if (!fdid) {
        stats.noIcon += 1;
        return;
      }
      const name = iconNameByFdid.get(fdid);
      if (!name) {
        stats.unresolved += 1;
        console.error(`refreshSpellIcons: no icon name for spell ${spellId} (FileDataID ${fdid})`);
        return;
      }

      const file = bucket.file(`spells/${spellId}.jpg`);
      // Existence is only an upload optimization, and checking it needs bucket
      // auth, so skip it on a dry run (and on --force, which re-uploads anyway).
      if (!opts.force && !opts.dryRun) {
        const [exists] = await file.exists();
        if (exists) {
          stats.skippedExisting += 1;
          return;
        }
      }

      const response = await fetch(`${ZAMIMG_LARGE}/${name}.jpg`);
      if (!response.ok) {
        stats.zamimgMissing += 1;
        console.error(`refreshSpellIcons: zamimg ${response.status} for spell ${spellId} (${name})`);
        return;
      }
      const body = Buffer.from(await response.arrayBuffer());

      if (opts.dryRun) {
        stats.uploaded += 1;
        return;
      }
      await file.save(body, { contentType: 'image/jpeg', resumable: false });
      stats.uploaded += 1;
    } catch (e) {
      stats.failed += 1;
      // Reported to Cloud Logging / Error Reporting (stderr with stack).
      console.error(`refreshSpellIcons: failed on spell ${spellId}:`, e);
    }
  });

  console.log(
    `Done. uploaded=${stats.uploaded} skippedExisting=${stats.skippedExisting} ` +
      `noIcon=${stats.noIcon} unresolved=${stats.unresolved} zamimgMissing=${stats.zamimgMissing} failed=${stats.failed}`,
  );

  // Surface a single aggregate error so Error Reporting flags a bad run (e.g. mass failures).
  if (stats.failed > 0 || stats.zamimgMissing > 0) {
    console.error(
      `refreshSpellIcons: completed with problems — ${stats.failed} failed, ${stats.zamimgMissing} missing on zamimg.`,
    );
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('refreshSpellIcons: fatal error', e);
  process.exit(1);
});
