/* eslint-disable no-console */
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

import { CombatUnitReaction, CombatUnitType, ICombatUnit } from '@wowarenalogs/parser';
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

async function tryProcessStub(stub: MatchStub, ordinal: number): Promise<IndexEntry | null> {
  const date = new Date(stub.startTime).toISOString().slice(0, 10);
  process.stderr.write(`  [${ordinal}] ${stub.id} (${stub.startInfo?.bracket ?? BRACKET}, ${date})... `);

  let text: string;
  try {
    const res = await fetch(stub.logObjectUrl);
    if (!res.ok) {
      process.stderr.write(`download failed (${res.status})\n`);
      return null;
    }
    text = await res.text();
  } catch (e) {
    process.stderr.write(`download error: ${e}\n`);
    return null;
  }

  let combats: ParsedCombat[];
  try {
    combats = await parseLogText(text);
  } catch (e) {
    process.stderr.write(`parse error: ${e}\n`);
    return null;
  }

  for (const combat of combats) {
    const friends = (Object.values(combat.units) as ICombatUnit[]).filter(
      (u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Friendly,
    );
    const owner = friends.find((p) => p.id === combat.playerId);
    if (!owner) continue;
    if (!isHealerSpec(owner.spec)) continue;

    const spec = specToString(owner.spec);
    const durationSec = Math.round((combat.endTime - combat.startTime) / 1000);
    if (durationSec < 10) continue;

    const combatAny = combat as unknown as Record<string, unknown>;
    const playerWon =
      typeof combatAny['winningTeamId'] === 'string' ? combatAny['winningTeamId'] === combat.playerTeamId : null;
    const result: IndexEntry['result'] = playerWon === true ? 'Win' : playerWon === false ? 'Loss' : 'Unknown';
    const resultLetter = result === 'Win' ? 'W' : result === 'Loss' ? 'L' : 'U';

    const prompt = buildMatchPromptNew(combat, true);
    if (!prompt) {
      process.stderr.write(`empty prompt\n`);
      return null;
    }

    const ordinalStr = String(ordinal).padStart(3, '0');
    const filename = `${ordinalStr}-${sanitizeForFilename(spec)}-${resultLetter}-${sanitizeForFilename(stub.id)}.txt`;
    const filePath = path.join(PROMPTS_DIR, filename);
    await fs.writeFile(filePath, prompt, 'utf8');

    process.stderr.write(`wrote ${filename}\n`);
    return {
      ordinal,
      file: path.join('prompts', filename),
      matchId: stub.id,
      spec,
      bracket: combat.startInfo?.bracket ?? BRACKET,
      result,
      durationSec,
    };
  }

  process.stderr.write(`no healer perspective\n`);
  return null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
