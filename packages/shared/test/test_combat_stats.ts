/* eslint-disable no-console */
import {
  AtomicArenaCombat,
  CombatUnitReaction,
  CombatUnitType,
  IArenaMatch,
  ICombatUnit,
  IShuffleMatch,
  LogEvent,
  WoWCombatLogParser,
} from '@wowarenalogs/parser';
import assert from 'assert';
import fs from 'fs';
import _ from 'lodash';
import path from 'path';

import { ccSpellIds } from '../src/data/spellTags';
import {
  computeCombatStats,
  getCombatPlayers,
  getTotalAbsorbDone,
  getTotalHealingDone,
  ICombatStats,
  ICombatUnitStats,
  TOP_DAMAGE_SPELL_COUNT,
} from '../src/utils/combatStats';

const LOGS_DIR = path.join(__dirname, '../../parser/test/testlogs');

function parseLog(file: string): AtomicArenaCombat[] {
  const parser = new WoWCombatLogParser('retail');
  const arenaMatches: IArenaMatch[] = [];
  const shuffleMatches: IShuffleMatch[] = [];

  parser.on('arena_match_ended', (m: IArenaMatch) => arenaMatches.push(m));
  parser.on('solo_shuffle_ended', (m: IShuffleMatch) => shuffleMatches.push(m));

  for (const line of fs.readFileSync(path.join(LOGS_DIR, file), 'utf8').split('\n')) {
    parser.parseLine(line);
  }
  parser.flush();

  return [...arenaMatches, ...shuffleMatches.flatMap((m) => m.rounds)];
}

type LegacyUnitStats = {
  ccTaken: number;
  ccDone: number;
  damage: number;
  support: number;
  healing: number;
  interruptsDone: number;
  interruptsTaken: number;
};

function legacyTimeInCC(target: ICombatUnit, sourceUnitId?: string): number {
  let total = 0;
  let start = -1;
  let stack = 0;
  for (const event of target.auraEvents) {
    if (!ccSpellIds.has(event.spellId || '')) {
      continue;
    }
    if (sourceUnitId !== undefined && event.srcUnitId !== sourceUnitId) {
      continue;
    }
    if (event.logLine.event === LogEvent.SPELL_AURA_APPLIED) {
      if (start < 0) {
        start = event.logLine.timestamp;
      }
      stack++;
    } else if (event.logLine.event === LogEvent.SPELL_AURA_REMOVED) {
      stack--;
      if (stack === 0) {
        total += event.logLine.timestamp - start;
        start = -1;
      }
    }
  }
  return total;
}

// What CombatReportContext computed inline before computeCombatStats existed, kept
// verbatim so the refactor can be shown not to have moved any number.
function legacyStats(combat: AtomicArenaCombat): { units: Record<string, LegacyUnitStats>; meterScale: number } {
  const players = _.values(combat.units).filter(
    (u) =>
      u.type === CombatUnitType.Player &&
      (u.reaction === CombatUnitReaction.Friendly || u.reaction === CombatUnitReaction.Hostile),
  );

  const units: Record<string, LegacyUnitStats> = {};
  let meterScale = 0;

  for (const player of players) {
    const damage = player.damageOut.reduce((sum, a) => sum + Math.abs(a.effectiveAmount), 0);
    const healing = player.healOut.reduce((sum, a) => {
      if (a.logLine.event === 'SPELL_PERIODIC_HEAL' || a.logLine.event === 'SPELL_HEAL') {
        return sum + (a.logLine.parameters[30] - a.logLine.parameters[32]);
      }
      return sum + Math.abs(a.effectiveAmount);
    }, 0);
    const absorbed = player.absorbsOut.reduce((sum, a) => sum + Math.abs(a.effectiveAmount), 0);

    meterScale = Math.max(meterScale, damage, healing);

    units[player.id] = {
      ccTaken: legacyTimeInCC(player),
      ccDone: _.sum(players.map((target) => legacyTimeInCC(target, player.id))),
      damage,
      support: player.supportDamageIn.reduce((sum, a) => sum + Math.abs(a.effectiveAmount), 0),
      healing: healing + absorbed,
      interruptsDone: player.actionOut.filter((l) => l.logLine.event === LogEvent.SPELL_INTERRUPT).length,
      interruptsTaken: player.actionIn.filter((l) => l.logLine.event === LogEvent.SPELL_INTERRUPT).length,
    };
  }

  return { units, meterScale };
}

type AnalysedCombat = {
  combat: AtomicArenaCombat;
  stats: ICombatStats;
};

const logFiles = fs.readdirSync(LOGS_DIR).filter((f) => f.endsWith('.txt'));
const analysed: AnalysedCombat[] = logFiles
  .flatMap(parseLog)
  .map((combat) => ({ combat, stats: computeCombatStats(combat) }));

function everyUnitStat(): ICombatUnitStats[] {
  return analysed.flatMap(({ stats }) => _.values(stats.units));
}

const cases: Record<string, () => void> = {
  'the test corpus actually parsed': () => {
    assert.ok(logFiles.length > 0, 'no test logs found');
    assert.ok(analysed.length > 0, 'no combats parsed');
    assert.ok(everyUnitStat().length > 0, 'no player stats produced');
  },

  'every value matches the pre-refactor computation': () => {
    for (const { combat, stats } of analysed) {
      const before = legacyStats(combat);

      for (const [unitId, legacy] of Object.entries(before.units)) {
        const unitStats = stats.units[unitId];
        assert.ok(unitStats, `unit ${unitId} lost by the refactor`);

        const pairs: [keyof LegacyUnitStats, number][] = [
          ['ccTaken', unitStats.ccTakenInMilliseconds],
          ['ccDone', unitStats.ccDoneInMilliseconds],
          ['damage', unitStats.damageDone],
          ['support', unitStats.supportDamageIn],
          ['interruptsDone', unitStats.interruptsDone],
          ['interruptsTaken', unitStats.interruptsTaken],
        ];
        for (const [field, value] of pairs) {
          assert.strictEqual(value, legacy[field], `${combat.id} ${unitId} ${field}`);
        }

        // Healing is compared only where the legacy value was a real number: without
        // advanced combat logging it came out NaN, which the case below covers.
        if (Number.isFinite(legacy.healing)) {
          assert.strictEqual(unitStats.healingDone, legacy.healing, `${combat.id} ${unitId} healing`);
        }
      }
    }
  },

  'the meter scale is unchanged': () => {
    for (const { combat, stats } of analysed) {
      const before = legacyStats(combat);
      if (!Number.isFinite(before.meterScale)) {
        continue;
      }
      // The report sizes its bars on raw healing, and healingDone folds absorbs in.
      const after = _.values(stats.units).reduce(
        (max, s) => Math.max(max, s.damageDone, s.healingDone - s.absorbDone),
        0,
      );
      assert.strictEqual(after, before.meterScale, `meter scale for ${combat.id}`);
    }
  },

  'a log without advanced combat logging yields healing, not NaN': () => {
    const [combat] = parseLog('no_advanced.txt');
    assert.ok(combat, 'no_advanced.txt produced no combat');

    const legacy = legacyStats(combat);
    assert.ok(
      Object.values(legacy.units).some((u) => !Number.isFinite(u.healing)),
      'expected the legacy computation to produce NaN here',
    );

    const healing = _.values(computeCombatStats(combat).units).map((s) => s.healingDone);
    assert.ok(
      healing.every((h) => Number.isFinite(h)),
      'healing is still NaN',
    );
    assert.ok(
      healing.some((h) => h > 0),
      'healing collapsed to zero',
    );
  },

  'no stat is NaN or infinite': () => {
    for (const stats of everyUnitStat()) {
      for (const [field, value] of Object.entries(stats)) {
        if (typeof value === 'number') {
          assert.ok(Number.isFinite(value), `${field} is ${value}`);
        }
      }
    }
    for (const { stats } of analysed) {
      assert.ok(Number.isFinite(stats.effectiveDurationInSeconds), 'effectiveDurationInSeconds');
      assert.ok(Number.isFinite(stats.dampening), 'dampening');
    }
  },

  'stats cover exactly the players on both teams': () => {
    for (const { combat, stats } of analysed) {
      const expected = getCombatPlayers(combat)
        .map((p) => p.id)
        .sort();
      assert.deepStrictEqual(Object.keys(stats.units).sort(), expected, `player set for ${combat.id}`);
    }
  },

  'healingDone folds in absorbDone exactly once': () => {
    for (const { combat, stats } of analysed) {
      for (const player of getCombatPlayers(combat)) {
        const unitStats = stats.units[player.id];
        const absorbed = getTotalAbsorbDone(player);
        assert.strictEqual(unitStats.absorbDone, absorbed, `${player.id} absorbDone`);
        assert.strictEqual(unitStats.healingDone - unitStats.absorbDone, getTotalHealingDone(player) - absorbed);
      }
    }
  },

  'per-second values divide the total by the published duration': () => {
    for (const { stats } of analysed) {
      const duration = stats.effectiveDurationInSeconds;
      assert.ok(duration >= 1, 'effective duration is floored at one second');
      for (const unitStats of _.values(stats.units)) {
        assert.strictEqual(unitStats.damageDonePerSecond, Math.round(unitStats.damageDone / duration));
        assert.strictEqual(unitStats.healingDonePerSecond, Math.round(unitStats.healingDone / duration));
        assert.strictEqual(unitStats.absorbDonePerSecond, Math.round(unitStats.absorbDone / duration));
      }
    }
  },

  'top damage spells are ordered and capped': () => {
    for (const stats of everyUnitStat()) {
      assert.ok(stats.topDamageSpells.length <= TOP_DAMAGE_SPELL_COUNT, 'too many spells kept');
      const amounts = stats.topDamageSpells.map((s) => s.amount);
      assert.deepStrictEqual(
        amounts,
        [...amounts].sort((a, b) => b - a),
        'not ordered by amount',
      );
      assert.ok(
        stats.topDamageSpells.every((s) => s.spellId.length > 0),
        'a spell is missing its id',
      );
    }
  },

  'deaths are reported with a timestamp only when the unit died': () => {
    for (const { combat, stats } of analysed) {
      for (const player of getCombatPlayers(combat)) {
        const unitStats = stats.units[player.id];
        assert.strictEqual(unitStats.deaths, player.deathRecords.length, `${player.id} death count`);
        if (player.deathRecords.length === 0) {
          assert.strictEqual(unitStats.diedAtSecond, null, `${player.id} did not die`);
        } else {
          assert.ok(Number.isFinite(unitStats.diedAtSecond), `${player.id} died without a timestamp`);
        }
      }
    }
  },
};

let failed = 0;
for (const [name, run] of Object.entries(cases)) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(`  ${e instanceof Error ? e.message : String(e)}`);
  }
}

if (failed > 0) {
  console.error(`FAIL test_combat_stats: ${failed} failing`);
  process.exit(1);
}
console.log('PASS test_combat_stats');
