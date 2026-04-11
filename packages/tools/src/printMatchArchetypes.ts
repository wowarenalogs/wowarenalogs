/* eslint-disable no-console */
/**
 * printMatchArchetypes.ts
 *
 * Parses WoW combat logs and prints match archetype measurements using the same
 * pipeline as the AI analysis.
 *
 * Modes:
 *   Local (default):  reads WoWCombatLog*.txt files from LOG_DIR
 *   Cloud:            fetches N matches from the public API
 *
 * Usage:
 *   npm run -w @wowarenalogs/tools start:printMatchArchetypes
 *   npm run -w @wowarenalogs/tools start:printMatchArchetypes -- --cloud 10
 *   npm run -w @wowarenalogs/tools start:printMatchArchetypes -- --cloud 10 --bracket 3v3
 */

import { CombatUnitReaction, CombatUnitType, IArenaMatch, IShuffleRound } from '@wowarenalogs/parser';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import os from 'os';
import path from 'path';

import { analyzePlayerCCAndTrinket } from '../../shared/src/utils/ccTrinketAnalysis';
import { fmtTime, isHealerSpec, specToString } from '../../shared/src/utils/cooldowns';
import { reconstructEnemyCDTimeline } from '../../shared/src/utils/enemyCDs';
import { analyzeHealerExposureAtBurst } from '../../shared/src/utils/healerExposureAnalysis';
import { computeMatchArchetype, formatMatchArchetypeForContext } from '../../shared/src/utils/matchArchetype';

const API_BASE = 'https://wowarenalogs.com';

type ParsedCombat = IArenaMatch | IShuffleRound;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

async function parseLogText(text: string): Promise<ParsedCombat[]> {
  const { WoWCombatLogParser } = await import('@wowarenalogs/parser');
  const lines = text.split('\n');
  const parser = new WoWCombatLogParser('retail');
  const combats: ParsedCombat[] = [];
  parser.on('arena_match_ended', (c: IArenaMatch) => combats.push(c));
  parser.on('solo_shuffle_ended', (m: { rounds: IShuffleRound[] }) => combats.push(...m.rounds));
  for (const line of lines) parser.parseLine(line);
  parser.flush();
  return combats;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function processMatch(combat: ParsedCombat): string {
  const allUnits = Object.values(combat.units);
  const friends = allUnits.filter(
    (u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Friendly,
  );
  const enemies = allUnits.filter((u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Hostile);

  if (friends.length === 0 || enemies.length === 0) return '';

  const durationSeconds = (combat.endTime - combat.startTime) / 1000;
  if (durationSeconds < 10) return '';

  const enemyCDTimeline = reconstructEnemyCDTimeline(enemies, combat, friends[0], friends);
  const ccTrinketSummaries = friends.map((p) => analyzePlayerCCAndTrinket(p, enemies, combat));

  const healerUnit = friends.find((p) => isHealerSpec(p.spec)) ?? null;
  const healerCCSummary = healerUnit ? ccTrinketSummaries.find((s) => s.playerName === healerUnit.name) : undefined;
  const healerExposures =
    healerUnit && healerCCSummary
      ? analyzeHealerExposureAtBurst(
          enemyCDTimeline.alignedBurstWindows,
          enemies,
          healerUnit,
          healerCCSummary,
          ccTrinketSummaries,
          combat.startInfo.zoneId,
          combat.startTime,
        )
      : [];

  const archetype = computeMatchArchetype(
    friends,
    enemies,
    combat,
    ccTrinketSummaries,
    enemyCDTimeline.alignedBurstWindows,
    healerExposures,
  );

  const myTeam = friends.map((p) => specToString(p.spec)).join(', ');
  const enemyTeam = enemies.map((p) => specToString(p.spec)).join(', ');
  const combatAny = combat as unknown as Record<string, unknown>;
  const playerWon =
    typeof combatAny['winningTeamId'] === 'string' ? combatAny['winningTeamId'] === combat.playerTeamId : null;
  const result = playerWon === true ? 'Win' : playerWon === false ? 'Loss' : '?';

  const lines: string[] = [];
  lines.push(`  ${combat.startInfo.bracket} | ${fmtTime(durationSeconds)} | ${result}`);
  lines.push(`  My team: ${myTeam}`);
  lines.push(`  Enemy:   ${enemyTeam}`);
  formatMatchArchetypeForContext(archetype).forEach((l) => lines.push(`  ${l}`));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Local mode
// ---------------------------------------------------------------------------

async function runLocal(logDir: string) {
  const files = (await fs.readdir(logDir))
    .filter((f) => f.endsWith('.txt') && f.startsWith('WoWCombatLog'))
    .map((f) => path.join(logDir, f))
    .sort();

  if (files.length === 0) {
    console.error(`No WoWCombatLog*.txt files found in ${logDir}`);
    process.exit(1);
  }

  console.log(`Scanning ${files.length} log file(s) in ${logDir}\n`);
  let matchCount = 0;

  for (const logPath of files) {
    const fileName = path.basename(logPath);
    let combats: ParsedCombat[];
    try {
      combats = await parseLogText(await fs.readFile(logPath, 'utf-8'));
    } catch (e) {
      console.error(`  Error parsing ${fileName}: ${e}`);
      continue;
    }
    if (combats.length === 0) continue;

    console.log(`=== ${fileName} (${combats.length} match${combats.length !== 1 ? 'es' : ''}) ===`);
    for (const combat of combats) {
      const output = processMatch(combat);
      if (!output) continue;
      matchCount++;
      console.log(`\nMatch ${matchCount}:\n${output}`);
    }
    console.log('');
  }

  console.log(`Total matches processed: ${matchCount}`);
}

// ---------------------------------------------------------------------------
// Cloud mode
// ---------------------------------------------------------------------------

const STUBS_QUERY = `
  query GetLatestMatches($wowVersion: String!, $bracket: String, $offset: Int!, $count: Int!) {
    latestMatches(wowVersion: $wowVersion, bracket: $bracket, offset: $offset, count: $count) {
      combats {
        ... on ArenaMatchDataStub  { id wowVersion logObjectUrl startTime endTime timezone startInfo { bracket } }
        ... on ShuffleRoundStub    { id wowVersion logObjectUrl startTime endTime timezone startInfo { bracket } }
      }
    }
  }
`;

interface MatchStub {
  id: string;
  wowVersion: string;
  logObjectUrl: string;
  startTime: number;
  startInfo?: { bracket: string };
}

async function fetchStubs(bracket: string, count: number): Promise<MatchStub[]> {
  const res = await fetch(`${API_BASE}/api/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: STUBS_QUERY,
      variables: { wowVersion: 'retail', bracket, offset: 0, count },
    }),
  });
  if (!res.ok) throw new Error(`GraphQL ${res.status}: ${res.statusText}`);
  const json = (await res.json()) as { data?: { latestMatches?: { combats?: MatchStub[] } }; errors?: unknown[] };
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data?.latestMatches?.combats ?? [];
}

async function runCloud(count: number, bracket: string) {
  console.log(`Fetching ${count} matches (bracket: ${bracket}) from ${API_BASE}...\n`);

  const stubs = await fetchStubs(bracket, count);
  if (stubs.length === 0) {
    console.error('No matches returned from API.');
    process.exit(1);
  }
  console.log(`Got ${stubs.length} stub(s). Downloading logs...\n`);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wlogs-'));
  let matchCount = 0;

  try {
    for (const stub of stubs) {
      const date = new Date(stub.startTime).toISOString().slice(0, 10);
      console.log(`=== ${stub.id} (${stub.startInfo?.bracket ?? bracket}, ${date}) ===`);

      let text: string;
      try {
        const res = await fetch(stub.logObjectUrl);
        if (!res.ok) throw new Error(`GCS ${res.status}`);
        text = await res.text();
      } catch (e) {
        console.error(`  Download failed: ${e}\n`);
        continue;
      }

      let combats: ParsedCombat[];
      try {
        combats = await parseLogText(text);
      } catch (e) {
        console.error(`  Parse failed: ${e}\n`);
        continue;
      }

      if (combats.length === 0) {
        console.log('  (no matches parsed)\n');
        continue;
      }

      for (const combat of combats) {
        const output = processMatch(combat);
        if (!output) continue;
        matchCount++;
        console.log(`\nMatch ${matchCount}:\n${output}`);
      }
      console.log('');
    }
  } finally {
    await fs.remove(tmpDir);
  }

  console.log(`Total matches processed: ${matchCount}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const cloudIdx = args.indexOf('--cloud');
  const bracketIdx = args.indexOf('--bracket');
  const bracket = bracketIdx !== -1 ? args[bracketIdx + 1] : 'Rated Solo Shuffle';

  if (cloudIdx !== -1) {
    const count = parseInt(args[cloudIdx + 1] ?? '10', 10);
    await runCloud(count, bracket);
  } else {
    const logDir = (process.env.LOG_DIR ?? path.join(process.env.HOME ?? os.homedir(), 'Downloads/wow logs')).replace(
      /^~/,
      os.homedir(),
    );
    await runLocal(logDir);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
