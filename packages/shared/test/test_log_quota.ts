/* eslint-disable no-console */
import assert from 'assert';

import { decideLogGrant, utcDayKey } from '../src/graphql-server/utils/logQuota';
import { LOG_DAILY_DOWNLOAD_QUOTA } from '../src/utils/accessLimits';

// Pure-function tests for the daily log quota. Run with `npm test` in packages/shared.
// Same shape as packages/cloud/test/test_webhooks.ts: plain assertions, exit code 1 on failure.

const ids = (n: number) => Array.from({ length: n }, (_v, i) => `match-${i}`);

const cases: Record<string, () => void> = {
  'first match of the day is allowed and charged': () => {
    assert.deepStrictEqual(decideLogGrant([], 'm1', 15), { allowed: true, charge: true, usedAfter: 1 });
  },

  'the 15th distinct match is allowed': () => {
    assert.deepStrictEqual(decideLogGrant(ids(14), 'new', 15), { allowed: true, charge: true, usedAfter: 15 });
  },

  'the 16th distinct match is denied': () => {
    assert.deepStrictEqual(decideLogGrant(ids(15), 'new', 15), { allowed: false, usedToday: 15, quota: 15 });
  },

  'a match already opened today is allowed without charge, even at the limit': () => {
    assert.deepStrictEqual(decideLogGrant(ids(15), 'match-3', 15), { allowed: true, charge: false, usedAfter: 15 });
  },

  'a match already opened today does not advance the count below the limit': () => {
    assert.deepStrictEqual(decideLogGrant(ids(4), 'match-0', 15), { allowed: true, charge: false, usedAfter: 4 });
  },

  'duplicate ids in the stored list count once': () => {
    const opened = [...ids(14), 'match-0', 'match-1'];
    assert.deepStrictEqual(decideLogGrant(opened, 'new', 15), { allowed: true, charge: true, usedAfter: 15 });
  },

  'a quota of zero denies the first match': () => {
    assert.deepStrictEqual(decideLogGrant([], 'm1', 0), { allowed: false, usedToday: 0, quota: 0 });
  },

  'the configured quota allows exactly that many distinct matches': () => {
    let opened: string[] = [];
    for (let i = 0; i < LOG_DAILY_DOWNLOAD_QUOTA; i++) {
      const d = decideLogGrant(opened, `m-${i}`, LOG_DAILY_DOWNLOAD_QUOTA);
      assert.ok(d.allowed && d.charge, `match ${i + 1} of ${LOG_DAILY_DOWNLOAD_QUOTA} should be allowed`);
      opened = [...opened, `m-${i}`];
    }
    const next = decideLogGrant(opened, 'one-too-many', LOG_DAILY_DOWNLOAD_QUOTA);
    assert.strictEqual(next.allowed, false);
    assert.strictEqual(opened.length, LOG_DAILY_DOWNLOAD_QUOTA);
  },

  'day key is the UTC calendar date': () => {
    assert.strictEqual(utcDayKey(new Date('2026-09-13T23:59:59Z')), '2026-09-13');
    assert.strictEqual(utcDayKey(new Date('2026-09-14T00:00:00Z')), '2026-09-14');
  },

  'day key rolls over at midnight UTC, not local midnight': () => {
    // 7pm Pacific on the 13th is already the 14th in UTC.
    assert.strictEqual(utcDayKey(new Date('2026-09-13T19:00:00-07:00')), '2026-09-14');
    // 1am in Berlin on the 14th is still the 13th in UTC.
    assert.strictEqual(utcDayKey(new Date('2026-09-14T01:00:00+02:00')), '2026-09-13');
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
  console.error(`FAIL test_log_quota: ${failed} failing`);
  process.exit(1);
}
console.log('PASS test_log_quota');
