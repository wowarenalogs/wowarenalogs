/* eslint-disable @typescript-eslint/no-explicit-any */
import { CombatUnitSpec, ICombatUnit } from '@wowarenalogs/parser';

import { makeAdvancedAction, makeUnit } from '../../../../utils/__tests__/testHelpers';
import { IDamageBucket, IMajorCooldownInfo } from '../../../../utils/cooldowns';
import { IDispelSummary } from '../../../../utils/dispelAnalysis';
import { IEnemyCDTimeline } from '../../../../utils/enemyCDs';
import { IHealingGap } from '../../../../utils/healingGaps';
import { buildMatchTimeline, BuildMatchTimelineParams, buildPlayerLoadout } from '../utils';

// ── Factories ─────────────────────────────────────────────────────────────────

function makeOwner(name: string): ICombatUnit {
  return { name, spec: CombatUnitSpec.None } as ICombatUnit;
}

function makeCD(spellName: string, cooldownSeconds: number, neverUsed = false): IMajorCooldownInfo {
  return {
    spellId: '1',
    spellName,
    tag: 'Defensive',
    cooldownSeconds,
    casts: [],
    availableWindows: [],
    neverUsed,
  };
}

function makeEnemyTimeline(players: IEnemyCDTimeline['players'] = []): IEnemyCDTimeline {
  return { alignedBurstWindows: [], players };
}

// ── buildPlayerLoadout ────────────────────────────────────────────────────────

describe('buildPlayerLoadout', () => {
  it('labels the log owner with spec and (log owner)', () => {
    const result = buildPlayerLoadout(
      makeOwner('Feramonk'),
      'Mistweaver Monk',
      [makeCD('Life Cocoon', 120)],
      [],
      makeEnemyTimeline(),
    );
    expect(result).toContain('Feramonk (Mistweaver Monk — log owner)');
    expect(result).toContain('Life Cocoon [120s]');
  });

  it('includes teammates without the (log owner) label', () => {
    const result = buildPlayerLoadout(
      makeOwner('Feramonk'),
      'Mistweaver Monk',
      [],
      [
        {
          player: makeOwner('Simplesauce'),
          spec: 'Unholy Death Knight',
          cds: [makeCD('Anti-Magic Shell', 60)],
        },
      ],
      makeEnemyTimeline(),
    );
    expect(result).toContain('Simplesauce (Unholy Death Knight)');
    expect(result).not.toContain('Simplesauce (Unholy Death Knight — log owner)');
    expect(result).toContain('Anti-Magic Shell [60s]');
  });

  it('includes enemies from CD timeline with (enemy) label', () => {
    const result = buildPlayerLoadout(
      makeOwner('Feramonk'),
      'Mistweaver Monk',
      [],
      [],
      makeEnemyTimeline([
        {
          playerName: 'Dzinked',
          specName: 'Holy Paladin',
          offensiveCDs: [
            {
              spellId: '31884',
              spellName: 'Avenging Crusader',
              castTimeSeconds: 30,
              cooldownSeconds: 120,
              availableAgainAtSeconds: 150,
              buffEndSeconds: 50,
            },
          ],
        },
      ]),
    );
    expect(result).toContain('Dzinked (Holy Paladin — enemy)');
    expect(result).toContain('Avenging Crusader [120s]');
  });

  it('deduplicates enemy CDs that were cast multiple times', () => {
    const result = buildPlayerLoadout(
      makeOwner('Feramonk'),
      'Mistweaver Monk',
      [],
      [],
      makeEnemyTimeline([
        {
          playerName: 'Ruminator',
          specName: 'Beast Mastery Hunter',
          offensiveCDs: [
            {
              spellId: '19574',
              spellName: 'Bestial Wrath',
              castTimeSeconds: 15,
              cooldownSeconds: 90,
              availableAgainAtSeconds: 105,
              buffEndSeconds: 25,
            },
            {
              spellId: '19574',
              spellName: 'Bestial Wrath',
              castTimeSeconds: 60,
              cooldownSeconds: 90,
              availableAgainAtSeconds: 150,
              buffEndSeconds: 70,
            },
          ],
        },
      ]),
    );
    // Should appear once, not twice
    const count = (result.match(/Bestial Wrath/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('does not annotate any CD as NEVER USED', () => {
    const neverUsedCD = makeCD('Paralysis', 45, true);
    const result = buildPlayerLoadout(makeOwner('Feramonk'), 'Mistweaver Monk', [neverUsedCD], [], makeEnemyTimeline());
    expect(result).not.toMatch(/NEVER.USED/i);
    expect(result).toContain('Paralysis [45s]');
  });

  it('shows "none tracked" when owner has no CDs', () => {
    const result = buildPlayerLoadout(makeOwner('Feramonk'), 'Mistweaver Monk', [], [], makeEnemyTimeline());
    expect(result).toContain('none tracked');
  });

  it('skips enemies with no tracked CDs', () => {
    const result = buildPlayerLoadout(
      makeOwner('Feramonk'),
      'Mistweaver Monk',
      [],
      [],
      makeEnemyTimeline([{ playerName: 'Ghost', specName: 'Arms Warrior', offensiveCDs: [] }]),
    );
    expect(result).not.toContain('Ghost');
  });
});

// ── Timeline factory helpers ──────────────────────────────────────────────────

function makeEmptyDispelSummary(): IDispelSummary {
  return {
    allyCleanse: [],
    ourPurges: [],
    hostilePurges: [],
    missedCleanseWindows: [],
    ccEfficiency: [],
    missedPurgeWindows: [],
  };
}

function makeBaseParams(overrides: Partial<BuildMatchTimelineParams> = {}): BuildMatchTimelineParams {
  return {
    owner: makeOwner('Feramonk'),
    ownerSpec: 'Mistweaver Monk',
    ownerCDs: [],
    teammateCDs: [],
    enemyCDTimeline: makeEnemyTimeline(),
    ccTrinketSummaries: [],
    dispelSummary: makeEmptyDispelSummary(),
    friendlyDeaths: [],
    enemyDeaths: [],
    pressureWindows: [] as IDamageBucket[],
    healingGaps: [] as IHealingGap[],
    friends: [],
    matchStartMs: 0,
    isHealer: true,
    ...overrides,
  };
}

// ── buildMatchTimeline — [DEATH] events ────────────────────────────────────────

describe('buildMatchTimeline — [DEATH] events', () => {
  it('emits a [DEATH] line for a friendly death', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        friendlyDeaths: [{ spec: 'Unholy Death Knight', name: 'Simplesauce', atSeconds: 118 }],
      }),
    );
    expect(result).toContain('[DEATH]');
    expect(result).toContain('Simplesauce (Unholy Death Knight — friendly)');
  });

  it('emits a [DEATH] line for an enemy death', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        enemyDeaths: [{ spec: 'Affliction Warlock', name: 'Natjkis', atSeconds: 88 }],
      }),
    );
    expect(result).toContain('[DEATH]');
    expect(result).toContain('Natjkis (Affliction Warlock — enemy)');
  });

  it('includes HP trajectory when advanced data is present', () => {
    const matchStartMs = 1_000_000;
    const deathAtSeconds = 118;
    const deathMs = matchStartMs + deathAtSeconds * 1000;

    const unit = makeUnit('player-1', {
      name: 'Simplesauce',
      advancedActions: [
        makeAdvancedAction(deathMs - 15_000, 0, 0, 500_000, 400_000), // 80% at T-15s
        makeAdvancedAction(deathMs - 5_000, 0, 0, 500_000, 200_000), // 40% at T-5s
      ],
    });

    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [unit],
        friendlyDeaths: [{ spec: 'Unholy Death Knight', name: 'Simplesauce', atSeconds: deathAtSeconds }],
        matchStartMs,
      }),
    );
    expect(result).toContain('HP:');
    expect(result).toContain('80%');
    expect(result).toContain('40%');
    expect(result).toContain('→ dead');
  });

  it('includes top damage sources in final 10s for friendly deaths', () => {
    const matchStartMs = 1_000_000;
    const deathAtSeconds = 118;
    const deathMs = matchStartMs + deathAtSeconds * 1000;

    const unit = makeUnit('player-1', {
      name: 'Simplesauce',
      damageIn: [
        {
          logLine: { timestamp: deathMs - 5_000 },
          effectiveAmount: -80_000,
          srcUnitName: 'Natjkis',
          spellName: 'Unstable Affliction',
        } as any,
        {
          logLine: { timestamp: deathMs - 3_000 },
          effectiveAmount: -40_000,
          srcUnitName: 'Natjkis',
          spellName: 'Dark Harvest',
        } as any,
      ],
    });

    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [unit],
        friendlyDeaths: [{ spec: 'Unholy Death Knight', name: 'Simplesauce', atSeconds: deathAtSeconds }],
        matchStartMs,
      }),
    );
    expect(result).toContain('Top damage in final 10s');
    expect(result).toContain('Unstable Affliction');
    expect(result).toContain('80k');
  });

  it('outputs MATCH TIMELINE header', () => {
    const result = buildMatchTimeline(makeBaseParams());
    expect(result).toContain('MATCH TIMELINE');
  });
});
