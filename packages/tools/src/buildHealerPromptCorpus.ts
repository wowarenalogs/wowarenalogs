/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * buildHealerPromptCorpus.ts
 *
 * Phase 1 of the verify-healer-prompts skill.
 *
 * Pages the public GraphQL `latestMatches` feed (3v3, retail) and writes the
 * AI prompt for each combat where `combat.playerId` is a healer spec, until
 * we have TARGET_COUNT files. Output:
 *
 *   packages/tools/local-batch/healer-review/
 *     prompts/<NNN>-<spec>-<W|L>-<matchId>.txt
 *     index.json
 *
 * No AI calls. Phase 2 (review) is a separate slash command.
 *
 * Usage:
 *   npm run -w @wowarenalogs/tools start:buildHealerPromptCorpus
 *   TARGET_COUNT=10 npm run -w @wowarenalogs/tools start:buildHealerPromptCorpus
 */

import { CombatUnitReaction, CombatUnitType, IArenaMatch, ICombatUnit, IShuffleRound } from '@wowarenalogs/parser';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import path from 'path';

import { isHealerSpec, specToString } from '../../shared/src/utils/cooldowns';
import { buildMatchPromptNew, fetchStubs, MatchStub, ParsedCombat, parseLogText } from './printMatchPrompts';

const TARGET_COUNT = Number(process.env.TARGET_COUNT ?? 100);
const PAGE_SIZE = Number(process.env.PAGE_SIZE ?? 50);
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 20); // safety stop: 20 * 50 = 1000 candidates
const BRACKET = process.env.BRACKET ?? '3v3';

const OUTPUT_DIR = path.join(__dirname, '../local-batch/healer-review');
const PROMPTS_DIR = path.join(OUTPUT_DIR, 'prompts');
const INDEX_FILE = path.join(OUTPUT_DIR, 'index.json');

interface IndexEntry {
  ordinal: number;
  file: string;
  matchId: string;
  spec: string;
  bracket: string;
  result: 'Win' | 'Loss' | 'Unknown';
  durationSec: number;
}

function sanitizeForFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9-]/g, '');
}

async function main() {
  await fs.ensureDir(PROMPTS_DIR);
  console.log(`Target: ${TARGET_COUNT} healer prompts at bracket=${BRACKET}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  const entries: IndexEntry[] = [];
  const seenMatchIds = new Set<string>();
  let page = 0;

  while (entries.length < TARGET_COUNT && page < MAX_PAGES) {
    const offset = page * PAGE_SIZE;
    console.log(`Fetching stubs page ${page + 1} (offset=${offset}, count=${PAGE_SIZE})...`);
    let stubs: MatchStub[];
    try {
      stubs = await fetchStubs(BRACKET, PAGE_SIZE, offset);
    } catch (e) {
      console.error(`  Stub fetch failed: ${e}`);
      break;
    }
    if (stubs.length === 0) {
      console.log('  No more stubs returned. Stopping.');
      break;
    }

    for (const stub of stubs) {
      if (entries.length >= TARGET_COUNT) break;
      if (seenMatchIds.has(stub.id)) continue;
      seenMatchIds.add(stub.id);
      const entry = await tryProcessStub(stub, entries.length + 1);
      if (entry) entries.push(entry);
    }

    page++;
  }

  await fs.writeJson(INDEX_FILE, entries, { spaces: 2 });

  console.log(`\nWrote ${entries.length} prompt(s) to ${PROMPTS_DIR}`);
  console.log(`Index: ${INDEX_FILE}`);
  if (entries.length < TARGET_COUNT) {
    console.warn(`WARNING: only ${entries.length}/${TARGET_COUNT} healer matches found after ${page} page(s).`);
  }
}

// Stubbed in Task 3 — placeholder so the file compiles.
async function tryProcessStub(_stub: MatchStub, _ordinal: number): Promise<IndexEntry | null> {
  return null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
