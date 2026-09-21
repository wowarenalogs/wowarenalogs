/* eslint-disable no-console */
import { CombatUnitType, IArenaMatch, IShuffleMatch } from '@wowarenalogs/parser';
import assert from 'assert';
import fs from 'fs';
import path from 'path';

import { computeCombatStats } from '../../shared/src/utils/combatStats';
import { createStubDTOFromArenaMatch, createStubDTOFromShuffleMatch } from '../src/createMatchStub';
import { parseFromStringArrayAsync } from '../src/utils';

const LOGS_DIR = path.join(__dirname, '../../parser/test/testlogs');
const OWNER_ID = 'test-owner';
const LOG_URL = 'test://log';

async function parse(file: string) {
  const text = fs.readFileSync(path.join(LOGS_DIR, file), 'utf8');
  return parseFromStringArrayAsync(text.split('\n'), 'retail');
}

async function main() {
  const arenaMatch = (await parse('3v3_tww_1120_reduced.txt')).arenaMatches[0] as IArenaMatch;
  const shuffleMatch = (await parse('one_solo_shuffle.txt')).shuffleMatches[0] as IShuffleMatch;

  assert.ok(arenaMatch, 'no arena match parsed');
  assert.ok(shuffleMatch, 'no shuffle match parsed');

  const arenaStub = createStubDTOFromArenaMatch(arenaMatch, OWNER_ID, LOG_URL);
  const shuffleStubs = createStubDTOFromShuffleMatch(shuffleMatch, OWNER_ID, LOG_URL);

  const cases: Record<string, () => void> = {
    'an arena stub carries the combat-wide stats': () => {
      const expected = computeCombatStats(arenaMatch);
      assert.strictEqual(arenaStub.effectiveDurationInSeconds, expected.effectiveDurationInSeconds);
      assert.strictEqual(arenaStub.dampening, expected.dampening);
    },

    'every player on the stub carries stats': () => {
      const players = arenaStub.units.filter((u) => u.type === CombatUnitType.Player);
      assert.ok(players.length > 0, 'no players on the stub');
      for (const player of players) {
        assert.ok(player.stats, `${player.name} has no stats`);
      }
    },

    'units that are not players carry none': () => {
      for (const unit of arenaStub.units.filter((u) => u.type !== CombatUnitType.Player)) {
        assert.strictEqual(unit.stats, undefined, `${unit.name} should not carry stats`);
      }
    },

    'the stats on the stub are the ones computeCombatStats produced': () => {
      const expected = computeCombatStats(arenaMatch);
      for (const unit of arenaStub.units) {
        assert.deepStrictEqual(unit.stats, expected.units[unit.id], `stats for ${unit.name}`);
      }
    },

    'no numeric field is NaN': () => {
      // Firestore stores NaN happily; it then fails to serialize as a GraphQL Float.
      for (const stub of [arenaStub, ...shuffleStubs.map(([s]) => s)]) {
        assert.ok(Number.isFinite(stub.effectiveDurationInSeconds), 'effectiveDurationInSeconds');
        assert.ok(Number.isFinite(stub.dampening), 'dampening');
        for (const unit of stub.units) {
          for (const [field, value] of Object.entries(unit.stats ?? {})) {
            if (typeof value === 'number') {
              assert.ok(Number.isFinite(value), `${unit.name} ${field} is ${value}`);
            }
          }
        }
      }
    },

    'a shuffle produces one stub per round, each timed on its own': () => {
      assert.strictEqual(shuffleStubs.length, shuffleMatch.rounds.length);
      shuffleStubs.forEach(([stub, round]) => {
        const expected = computeCombatStats(round);
        assert.strictEqual(stub.effectiveDurationInSeconds, expected.effectiveDurationInSeconds, `round ${round.id}`);
        assert.strictEqual(stub.dampening, expected.dampening, `round ${round.id}`);
      });
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
    console.error(`FAIL test_stub_stats: ${failed} failing`);
    process.exit(1);
  }
  console.log('PASS test_stub_stats');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
