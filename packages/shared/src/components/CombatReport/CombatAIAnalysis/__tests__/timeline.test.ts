/* eslint-disable @typescript-eslint/no-explicit-any */
import { CombatUnitReaction, CombatUnitSpec, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import {
  makeAdvancedAction,
  makeAuraEvent,
  makeSpellCastEvent,
  makeUnit,
} from '../../../../utils/__tests__/testHelpers';
import { ICCInstance, IPlayerCCTrinketSummary } from '../../../../utils/ccTrinketAnalysis';
import { IDamageBucket, IMajorCooldownInfo } from '../../../../utils/cooldowns';
import { IDispelSummary } from '../../../../utils/dispelAnalysis';
import { IOutgoingCCChain } from '../../../../utils/drAnalysis';
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
    maxChargesDetected: 1,
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
    const { text } = buildPlayerLoadout(
      makeOwner('Feramonk'),
      'Mistweaver Monk',
      [makeCD('Life Cocoon', 120)],
      [],
      makeEnemyTimeline(),
    );
    expect(text).toContain('Feramonk (Mistweaver Monk — log owner)');
    expect(text).toContain('Life Cocoon [120s]');
  });

  it('includes teammates without the (log owner) label', () => {
    const { text } = buildPlayerLoadout(
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
    expect(text).toContain('Simplesauce (Unholy Death Knight)');
    expect(text).not.toContain('Simplesauce (Unholy Death Knight — log owner)');
    expect(text).toContain('Anti-Magic Shell [60s]');
  });

  it('includes enemies from CD timeline with (enemy) label', () => {
    const { text } = buildPlayerLoadout(
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
    expect(text).toContain('Dzinked (Holy Paladin — enemy)');
    expect(text).toContain('Avenging Crusader [120s]');
  });

  it('deduplicates enemy CDs that were cast multiple times', () => {
    const { text } = buildPlayerLoadout(
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
    const count = (text.match(/Bestial Wrath/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('does not annotate any CD as NEVER USED', () => {
    const neverUsedCD = makeCD('Paralysis', 45, true);
    const { text } = buildPlayerLoadout(
      makeOwner('Feramonk'),
      'Mistweaver Monk',
      [neverUsedCD],
      [],
      makeEnemyTimeline(),
    );
    expect(text).not.toMatch(/NEVER.USED/i);
    expect(text).toContain('Paralysis [45s]');
  });

  it('shows "none tracked" when owner has no CDs', () => {
    const { text } = buildPlayerLoadout(makeOwner('Feramonk'), 'Mistweaver Monk', [], [], makeEnemyTimeline());
    expect(text).toContain('none tracked');
  });

  it('includes enemies with no tracked CDs in loadout so their IDs can be resolved in timeline', () => {
    const { text, enemyIdMap } = buildPlayerLoadout(
      makeOwner('Feramonk'),
      'Mistweaver Monk',
      [],
      [],
      makeEnemyTimeline([{ playerName: 'Ghost', specName: 'Arms Warrior', offensiveCDs: [] }]),
    );
    // Player must appear so Claude can resolve their numeric ID from [HP] ticks and [OWNER CAST] targets
    expect(text).toContain('Ghost');
    expect(text).toContain('none tracked');
    expect(enemyIdMap.get('Ghost')).toBeDefined();
  });

  it('assigns sequential numeric IDs starting at 1 for owner, then teammates, then enemies', () => {
    const { text, playerIdMap, enemyIdMap } = buildPlayerLoadout(
      makeOwner('Feramonk'),
      'Mistweaver Monk',
      [],
      [{ player: makeOwner('Simplesauce'), spec: 'Unholy Death Knight', cds: [] }],
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
    expect(playerIdMap.get('Feramonk')).toBe(1);
    expect(playerIdMap.get('Simplesauce')).toBe(2);
    expect(enemyIdMap.get('Dzinked')).toBe(3);
    expect(text).toContain('1: Feramonk');
    expect(text).toContain('2: Simplesauce');
    expect(text).toContain('3: Dzinked');
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

function makeEmptyCCTrinketSummary(playerName: string): IPlayerCCTrinketSummary {
  return {
    playerName,
    playerSpec: 'Mistweaver Monk',
    trinketType: 'Gladiator',
    trinketCooldownSeconds: 90,
    ccInstances: [],
    trinketUseTimes: [],
    missedTrinketWindows: [],
  };
}

function makeBaseParams(overrides: Partial<BuildMatchTimelineParams> = {}): BuildMatchTimelineParams {
  return {
    owner: makeOwner('Feramonk'),
    ownerSpec: 'Holy Paladin',
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
    enemies: [],
    matchStartMs: 0,
    matchEndMs: 0,
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

describe('buildMatchTimeline — CD events', () => {
  it('emits [OWNER CD] for each cast', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        ownerCDs: [
          {
            spellId: '1',
            spellName: 'Life Cocoon',
            tag: 'Defensive',
            cooldownSeconds: 120,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 27 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).toContain('[OWNER CD]');
    expect(result).toContain('Life Cocoon');
    expect(result).toContain('0:27');
  });

  it('includes target name and HP when available on [OWNER CD]', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        ownerCDs: [
          {
            spellId: '1',
            spellName: 'Life Cocoon',
            tag: 'Defensive',
            cooldownSeconds: 120,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 27, targetName: 'Gardianmini', targetHpPct: 27 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).toContain('→ Gardianmini (27% HP)');
  });

  it('emits [TEAMMATE CD] for each teammate cast', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        teammateCDs: [
          {
            player: makeOwner('Simplesauce'),
            spec: 'Unholy Death Knight',
            cds: [
              {
                spellId: '48707',
                spellName: 'Anti-Magic Shell',
                tag: 'Defensive',
                cooldownSeconds: 60,
                maxChargesDetected: 1,
                casts: [{ timeSeconds: 108 }],
                availableWindows: [],
                neverUsed: false,
              },
            ],
          },
        ],
      }),
    );
    expect(result).toContain('[TEAMMATE CD]');
    expect(result).toContain('Simplesauce (Unholy Death Knight): Anti-Magic Shell');
    expect(result).toContain('1:48');
  });

  it('emits [ENEMY CD] for individual enemy casts (not grouped)', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        enemyCDTimeline: makeEnemyTimeline([
          {
            playerName: 'Dzinked',
            specName: 'Holy Paladin',
            offensiveCDs: [
              {
                spellId: '31884',
                spellName: 'Avenging Crusader',
                castTimeSeconds: 33,
                cooldownSeconds: 120,
                availableAgainAtSeconds: 153,
                buffEndSeconds: 51,
              },
              {
                spellId: '31884',
                spellName: 'Avenging Crusader',
                castTimeSeconds: 153,
                cooldownSeconds: 120,
                availableAgainAtSeconds: 273,
                buffEndSeconds: 171,
              },
            ],
          },
        ]),
      }),
    );
    // Both casts should appear individually
    const matches = result.match(/\[ENEMY CD\]/g) ?? [];
    expect(matches.length).toBe(2);
    expect(result).toContain('Dzinked (Holy Paladin): Avenging Crusader');
    expect(result).toContain('0:33');
    expect(result).toContain('2:33');
  });

  it('sorts all CD events chronologically', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        ownerCDs: [
          {
            spellId: '1',
            spellName: 'Life Cocoon',
            tag: 'Defensive',
            cooldownSeconds: 120,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 55 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
        enemyCDTimeline: makeEnemyTimeline([
          {
            playerName: 'Dzinked',
            specName: 'Holy Paladin',
            offensiveCDs: [
              {
                spellId: '31884',
                spellName: 'Avenging Crusader',
                castTimeSeconds: 33,
                cooldownSeconds: 120,
                availableAgainAtSeconds: 153,
                buffEndSeconds: 51,
              },
            ],
          },
        ]),
      }),
    );
    const acPos = result.indexOf('Avenging Crusader');
    const lcPos = result.indexOf('Life Cocoon');
    expect(acPos).toBeLessThan(lcPos); // 0:33 before 0:55
  });
});

describe('buildMatchTimeline — CC, dispel, pressure, healing gap events', () => {
  it('emits [CC ON TEAM] with trinket: available, not used when trinket was available', () => {
    const cc: ICCInstance = {
      atSeconds: 37,
      durationSeconds: 4,
      spellId: '853',
      spellName: 'Hammer of Justice',
      sourceName: 'Dzinked',
      sourceSpec: 'Holy Paladin',
      damageTakenDuring: 50_000,
      trinketState: 'available_unused',
      drInfo: null,
      distanceYards: null,
      losBlocked: null,
    };
    const result = buildMatchTimeline(
      makeBaseParams({
        ccTrinketSummaries: [{ ...makeEmptyCCTrinketSummary('Feramonk'), ccInstances: [cc] }],
      }),
    );
    expect(result).toContain('[CC ON TEAM]');
    expect(result).toContain('Feramonk ← Hammer of Justice (Dzinked)');
    expect(result).toContain('trinket: available, not used');
    expect(result).toContain('0:37');
  });

  it('emits [CC ON TEAM] with trinket: used when trinket was consumed', () => {
    const cc: ICCInstance = {
      atSeconds: 15,
      durationSeconds: 6,
      spellId: '853',
      spellName: 'Hammer of Justice',
      sourceName: 'Dzinked',
      sourceSpec: 'Holy Paladin',
      damageTakenDuring: 30_000,
      trinketState: 'used',
      drInfo: null,
      distanceYards: null,
      losBlocked: null,
    };
    const result = buildMatchTimeline(
      makeBaseParams({
        ccTrinketSummaries: [{ ...makeEmptyCCTrinketSummary('Feramonk'), ccInstances: [cc] }],
      }),
    );
    expect(result).toContain('trinket: used');
  });

  it('emits [TRINKET] events for trinket uses', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        ccTrinketSummaries: [{ ...makeEmptyCCTrinketSummary('Feramonk'), trinketUseTimes: [68] }],
      }),
    );
    expect(result).toContain('[TRINKET]');
    expect(result).toContain('Feramonk used PvP trinket');
    expect(result).toContain('1:08');
  });

  it('emits [MISSED CLEANSE] with damage amount and dispel type', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        dispelSummary: {
          ...makeEmptyDispelSummary(),
          missedCleanseWindows: [
            {
              timeSeconds: 134,
              durationSeconds: 30,
              targetName: 'Simplesauce',
              targetSpec: 'Unholy Death Knight',
              spellName: 'Vampiric Touch',
              spellId: '34914',
              priority: 'High',
              dispelType: 'Magic' as any,
              postCcDamage: 212_000,
              cleanseWasOnCD: false,
            },
          ],
        },
      }),
    );
    expect(result).toContain('[MISSED CLEANSE]');
    expect(result).toContain('Vampiric Touch on Simplesauce');
    expect(result).toContain('212k');
    expect(result).toContain('dispel: Magic');
  });

  it('emits [CLEANSE] for successful dispels', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        dispelSummary: {
          ...makeEmptyDispelSummary(),
          allyCleanse: [
            {
              timeSeconds: 44,
              dispelSpellId: '115450',
              dispelSpellName: 'Detox',
              removedSpellId: '34914',
              removedSpellName: 'Vampiric Touch',
              sourceName: 'Feramonk',
              sourceSpec: 'Mistweaver Monk',
              targetName: 'Simplesauce',
              targetSpec: 'Unholy Death Knight',
              priority: 'High',
              hasDispelPenalty: false,
              isSpellSteal: false,
            },
          ],
        },
      }),
    );
    expect(result).toContain('[CLEANSE]');
    expect(result).toContain('Feramonk dispelled Vampiric Touch off Simplesauce');
  });

  it('emits [DMG SPIKE] only for windows ≥300k', () => {
    const windows: IDamageBucket[] = [
      {
        fromSeconds: 19,
        toSeconds: 24,
        totalDamage: 1_240_000,
        targetName: 'Gardianmini',
        targetSpec: 'Shadow Priest',
      },
      { fromSeconds: 50, toSeconds: 55, totalDamage: 200_000, targetName: 'Feramonk', targetSpec: 'Mistweaver Monk' },
    ];
    const result = buildMatchTimeline(makeBaseParams({ pressureWindows: windows }));
    expect(result).toContain('[DMG SPIKE]');
    expect(result).toContain('1.24M');
    // 200k window should NOT appear
    const spikeCount = (result.match(/\[DMG SPIKE\]/g) ?? []).length;
    expect(spikeCount).toBe(1);
  });

  it('emits [HEALING GAP] only when isHealer is true', () => {
    const gap: IHealingGap = {
      fromSeconds: 82,
      toSeconds: 86.2,
      durationSeconds: 4.2,
      freeCastSeconds: 2.1,
      mostDamagedSpec: 'Unholy Death Knight',
      mostDamagedName: 'Simplesauce',
      mostDamagedAmount: 400_000,
    };
    const healerResult = buildMatchTimeline(makeBaseParams({ healingGaps: [gap], isHealer: true }));
    const dpsResult = buildMatchTimeline(makeBaseParams({ healingGaps: [gap], isHealer: false }));

    expect(healerResult).toContain('[HEALING GAP]');
    expect(healerResult).toContain('Feramonk inactive 4.2s');
    expect(dpsResult).not.toContain('[HEALING GAP]');
  });

  it('emits [HP] ticks every 3s when friends have HP data', () => {
    const unit = makeUnit('unit-1', {
      name: 'Feramonk',
      advancedActions: [
        makeAdvancedAction(3_000, 0, 0, 500_000, 420_000), // t=3s → 84%
        makeAdvancedAction(6_000, 0, 0, 500_000, 250_000), // t=6s → 50%
      ],
    }) as ICombatUnit;
    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [unit],
        matchStartMs: 0,
        matchEndMs: 9_000,
      }),
    );
    expect(result).toContain('[HP]');
    expect(result).toContain('Feramonk:84%');
    expect(result).toContain('Feramonk:50%');
  });

  it('emits [HP] for multiple friends on the same tick', () => {
    const unit1 = makeUnit('unit-1', {
      name: 'Healer',
      advancedActions: [makeAdvancedAction(3_000, 0, 0, 500_000, 400_000)], // 80%
    }) as ICombatUnit;
    const unit2 = makeUnit('unit-2', {
      name: 'DPS',
      advancedActions: [makeAdvancedAction(3_000, 0, 0, 500_000, 500_000)], // 100%
    }) as ICombatUnit;
    // Override advancedActorId so getUnitHpAtTimestamp finds the right unit
    (unit2 as any).advancedActions[0].advancedActorId = 'unit-2';
    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [unit1, unit2],
        matchStartMs: 0,
        matchEndMs: 6_000,
      }),
    );
    expect(result).toContain('Healer:80%');
    expect(result).toContain('DPS:100%');
    // Both should be on the same [HP] line
    const hpLine = result.split('\n').find((l) => l.includes('[HP]') && l.includes('Healer'));
    expect(hpLine).toContain('DPS');
  });

  it('omits [HP] ticks when no friends have advanced action data', () => {
    const unit = makeUnit('unit-1', { name: 'Feramonk', advancedActions: [] }) as ICombatUnit;
    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [unit],
        matchStartMs: 0,
        matchEndMs: 9_000,
      }),
    );
    expect(result).not.toContain('[HP]');
  });
});

describe('buildMatchTimeline — [OWNER CAST] (F61 healer gap-filler)', () => {
  it('emits [OWNER CAST] for healer spell not tracked in ownerCDs when isHealer=true', () => {
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('108280', 30_000, 'team-1')], // HTT at T=30s
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: true,
        ownerCDs: [],
        matchStartMs: 0,
        matchEndMs: 60_000,
      }),
    );
    expect(result).toContain('[OWNER CAST]');
    expect(result).toContain('Healing Tide Totem');
    expect(result).toContain('0:30');
  });

  it('does not emit [OWNER CAST] when spell is already tracked in ownerCDs within ±1s', () => {
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('10060', 20_000, 'team-1')], // PI at T=20s
    });
    const piCD: IMajorCooldownInfo = {
      spellId: '10060',
      spellName: 'Power Infusion',
      tag: 'External',
      cooldownSeconds: 120,
      maxChargesDetected: 1,
      casts: [{ timeSeconds: 20 }],
      availableWindows: [],
      neverUsed: false,
    };
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: true,
        ownerCDs: [piCD],
        matchStartMs: 0,
        matchEndMs: 60_000,
      }),
    );
    expect(result).not.toContain('[OWNER CAST]');
  });

  it('does not emit [OWNER CAST] when isHealer is false', () => {
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('108280', 30_000, 'team-1')], // HTT at T=30s
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: false,
        ownerCDs: [],
        matchStartMs: 0,
        matchEndMs: 60_000,
      }),
    );
    expect(result).not.toContain('[OWNER CAST]');
  });

  it('emits [OWNER CAST] for any spell the owner casts, not just the healer whitelist', () => {
    // Spell ID '9999' is not in HEALER_CAST_SPELL_ID_TO_NAME — after F65 it must still appear.
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('9999', 30_000, 'player-2', 'Simplesauce')],
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: true,
        ownerCDs: [],
        matchStartMs: 0,
        matchEndMs: 60_000,
      }),
    );
    expect(result).toContain('[OWNER CAST]');
    // spellName echoes spellId in the mock (makeSpellCastEvent sets spellName = spellId)
    expect(result).toContain('9999');
  });
});

describe('buildMatchTimeline — F65 [OWNER CAST] target labels', () => {
  it('appends "self" when the owner targets themselves', () => {
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('1', 30_000, 'unit-1', 'Feramonk')],
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: true,
        ownerCDs: [],
        matchStartMs: 0,
        matchEndMs: 60_000,
      }),
    );
    expect(result).toContain('[OWNER CAST]');
    expect(result).toContain('→ self');
  });

  it('appends a numeric ID when the target is a known friendly player', () => {
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('1', 30_000, 'unit-2', 'Simplesauce')],
    });
    const playerIdMap = new Map<string, number>([
      ['Feramonk', 1],
      ['Simplesauce', 2],
    ]);
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: true,
        ownerCDs: [],
        matchStartMs: 0,
        matchEndMs: 60_000,
        playerIdMap,
      }),
    );
    expect(result).toContain('→ 2');
  });

  it('appends a numeric ID when the target is a known enemy player', () => {
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('1', 30_000, 'enemy-1', 'Natjkis')],
    });
    const enemyIdMap = new Map<string, number>([['Natjkis', 3]]);
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: true,
        ownerCDs: [],
        matchStartMs: 0,
        matchEndMs: 60_000,
        enemyIdMap,
      }),
    );
    expect(result).toContain('→ 3');
  });

  it('appends raw target name when the target is not in any ID map', () => {
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('1', 30_000, 'npc-99', 'SomeNPC')],
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: true,
        ownerCDs: [],
        matchStartMs: 0,
        matchEndMs: 60_000,
      }),
    );
    expect(result).toContain('→ SomeNPC');
  });

  it('omits the target arrow when destUnitName is the literal string "nil" (WoW log convention for untargeted spells)', () => {
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('1', 30_000, 'nil', 'nil')],
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: true,
        ownerCDs: [],
        matchStartMs: 0,
        matchEndMs: 60_000,
      }),
    );
    expect(result).toContain('[OWNER CAST]');
    expect(result).not.toContain('→');
  });

  it('omits the target arrow when destUnitName is empty', () => {
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('1', 30_000, '', '')],
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: true,
        ownerCDs: [],
        matchStartMs: 0,
        matchEndMs: 60_000,
      }),
    );
    expect(result).toContain('[OWNER CAST]');
    expect(result).not.toContain('→');
  });

  it('uses the canonical spell name from HEALER_CAST_SPELL_ID_TO_NAME when available', () => {
    // spellId '108280' = Healing Tide Totem — makeSpellCastEvent sets spellName='108280',
    // but the canonical map overrides display to 'Healing Tide Totem'.
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('108280', 30_000, 'unit-1', 'Feramonk')],
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: true,
        ownerCDs: [],
        matchStartMs: 0,
        matchEndMs: 60_000,
      }),
    );
    expect(result).toContain('Healing Tide Totem');
  });

  it('suppresses trinket cast from [OWNER CAST] when the same timestamp is already tracked by [TRINKET]', () => {
    // Trinket use at T=64s — should appear as [TRINKET] only, not also as [OWNER CAST].
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('42292', 64_000, '', 'nil')], // PvP trinket spell ID
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: true,
        ownerCDs: [],
        matchStartMs: 0,
        matchEndMs: 120_000,
        ccTrinketSummaries: [{ ...makeEmptyCCTrinketSummary('Feramonk'), trinketUseTimes: [64] }],
      }),
    );
    expect(result).toContain('[TRINKET]');
    expect(result).not.toContain('[OWNER CAST]');
  });

  it('still deduplicates against ownerCDs (does not double-emit spells tracked as [OWNER CD])', () => {
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('108280', 30_000, 'unit-1', 'Feramonk')],
    });
    const httCD: IMajorCooldownInfo = {
      spellId: '108280',
      spellName: 'Healing Tide Totem',
      tag: 'Defensive',
      cooldownSeconds: 180,
      maxChargesDetected: 1,
      casts: [{ timeSeconds: 30 }],
      availableWindows: [],
      neverUsed: false,
    };
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: true,
        ownerCDs: [httCD],
        matchStartMs: 0,
        matchEndMs: 60_000,
      }),
    );
    expect(result).toContain('[OWNER CD]');
    expect(result).not.toContain('[OWNER CAST]');
  });
});

describe('buildMatchTimeline — F62 dense HP ticks in critical windows', () => {
  function makeUnitWithHp(
    id: string,
    name: string,
    matchStartMs: number,
    hpReadings: Array<[number, number]>,
  ): ICombatUnit {
    return makeUnit(id, {
      name,
      advancedActions: hpReadings.map(([offsetMs, currentHp]) =>
        makeAdvancedAction(offsetMs, 0, 0, 500_000, currentHp),
      ),
    }) as ICombatUnit;
  }

  it('emits 1s HP ticks in [T-10, T] window before a friendly DEATH', () => {
    // Death at T=30s; match 0–45s. Dense window: [20, 30].
    const unit = makeUnitWithHp('unit-1', 'Feramonk', 0, [
      [1_000, 400_000], // t=1s
      [20_000, 350_000], // t=20s → covers t=19–21
      [22_000, 300_000], // t=22s → covers t=21–23
      [24_000, 250_000], // t=24s → covers t=23–25
      [25_000, 200_000], // t=25s
      [30_000, 50_000], // t=30s → covers t=29–31
    ]);
    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [unit],
        friendlyDeaths: [{ spec: 'Mistweaver Monk', name: 'Feramonk', atSeconds: 30 }],
        matchStartMs: 0,
        matchEndMs: 45_000,
      }),
    );
    // Should have 1s ticks in [20, 30]
    expect(result).toContain('0:21');
    expect(result).toContain('0:22');
    expect(result).toContain('0:23');
    // T=19 is NOT in the dense window (window starts at 20) — should NOT appear as an [HP] tick
    // (T=18 would be a 3s baseline tick, T=19 should not)
    const lines = result.split('\n');
    const hp19Line = lines.find((l) => l.startsWith('0:19') && l.includes('[HP]'));
    expect(hp19Line).toBeUndefined();
  });

  it('emits 1s HP ticks centered around a DMG SPIKE (±5s)', () => {
    // Spike at T=20s (fromSeconds=20); dense window: [15, 25].
    const unit = makeUnitWithHp('unit-1', 'Feramonk', 0, [
      [12_000, 480_000], // t=12s
      [15_000, 430_000], // t=15s → covers t=14–16
      [18_000, 350_000], // t=18s → covers t=17–19
      [22_000, 250_000], // t=22s
    ]);
    const spike: IDamageBucket = {
      fromSeconds: 20,
      toSeconds: 25,
      totalDamage: 400_000,
      targetName: 'Feramonk',
      targetSpec: 'Mistweaver Monk',
    };
    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [unit],
        pressureWindows: [spike],
        matchStartMs: 0,
        matchEndMs: 45_000,
      }),
    );
    // Should have 1s ticks in [15, 25]
    expect(result).toContain('0:15');
    expect(result).toContain('0:16');
    expect(result).toContain('0:17');
    expect(result).toContain('0:18');
    // T=14 should NOT be a 1s tick (it's not at a 3s multiple either: 14 % 3 ≠ 0)
    const lines = result.split('\n');
    const hp14Line = lines.find((l) => l.startsWith('0:14') && l.includes('[HP]'));
    expect(hp14Line).toBeUndefined();
    // T=12 IS a 3s baseline tick
    const hp12Line = lines.find((l) => l.startsWith('0:12') && l.includes('[HP]'));
    expect(hp12Line).toBeDefined();
  });

  it('emits 1s HP ticks in [T, T+10] lookahead window after CC ON TEAM', () => {
    // CC at T=15s; dense window: [15, 25].
    const unit = makeUnitWithHp('unit-1', 'Feramonk', 0, [
      [12_000, 480_000],
      [15_000, 430_000], // t=15s → covers t=14–16
      [18_000, 350_000],
      [24_000, 250_000],
    ]);
    const cc: ICCInstance = {
      atSeconds: 15,
      spellName: 'Cyclone',
      spellId: '33786',
      durationSeconds: 6,
      sourceName: 'Dzinked',
      sourceSpec: 'Balance Druid',
      damageTakenDuring: 0,
      trinketState: 'available_unused',
      drInfo: null,
      distanceYards: null,
      losBlocked: null,
    };
    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [unit],
        ccTrinketSummaries: [{ ...makeEmptyCCTrinketSummary('Feramonk'), ccInstances: [cc] }],
        matchStartMs: 0,
        matchEndMs: 45_000,
      }),
    );
    // Should have 1s ticks in [15, 25]
    expect(result).toContain('0:15');
    expect(result).toContain('0:16');
    expect(result).toContain('0:17');
    // T=14 is not in window and not a 3s multiple
    const lines = result.split('\n');
    const hp14Line = lines.find((l) => l.startsWith('0:14') && l.includes('[HP]'));
    expect(hp14Line).toBeUndefined();
  });

  it('does not emit duplicate HP ticks when windows overlap', () => {
    // DEATH at T=30, DMG SPIKE at T=26 → windows [20,30] and [21,31] overlap in [21,30].
    const unit = makeUnitWithHp('unit-1', 'Feramonk', 0, [
      [20_000, 350_000],
      [26_000, 200_000],
      [30_000, 50_000],
    ]);
    const spike: IDamageBucket = {
      fromSeconds: 26,
      toSeconds: 31,
      totalDamage: 500_000,
      targetName: 'Feramonk',
      targetSpec: 'Mistweaver Monk',
    };
    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [unit],
        friendlyDeaths: [{ spec: 'Mistweaver Monk', name: 'Feramonk', atSeconds: 30 }],
        pressureWindows: [spike],
        matchStartMs: 0,
        matchEndMs: 45_000,
      }),
    );
    // Count occurrences of '0:25' in [HP] lines — should be exactly 1
    const lines = result.split('\n').filter((l) => l.includes('[HP]') && l.startsWith('0:25'));
    expect(lines.length).toBe(1);
  });

  it('outside all critical windows, only emits HP ticks at 3s multiples', () => {
    // Match 0–45s, no deaths/spikes/CC. Only 3s ticks should appear.
    const unit = makeUnitWithHp('unit-1', 'Feramonk', 0, [
      [3_000, 480_000],
      [6_000, 460_000],
      [9_000, 440_000],
      [12_000, 420_000],
    ]);
    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [unit],
        matchStartMs: 0,
        matchEndMs: 15_000,
      }),
    );
    // T=1,2,4,5,7,8,10,11 should NOT have [HP] lines
    const lines = result.split('\n');
    for (const nonMultiple of [1, 2, 4, 5, 7, 8, 10, 11]) {
      const ts = `0:0${nonMultiple}`;
      const found = lines.find((l) => l.startsWith(ts) && l.includes('[HP]'));
      expect(found).toBeUndefined();
    }
    // T=3,6,9,12 SHOULD have [HP] lines
    expect(result).toContain('0:03');
    expect(result).toContain('0:06');
    expect(result).toContain('0:09');
    expect(result).toContain('0:12');
  });
});

describe('buildMatchTimeline — F64 enemy HP in [HP] ticks', () => {
  it('includes enemy HP on the same [HP] line as friendly HP', () => {
    const matchStartMs = 0;

    const friend = makeUnit('unit-1', {
      name: 'Feramonk',
      advancedActions: [
        makeAdvancedAction(6_000, 0, 0, 500_000, 450_000), // 90% at t=6s
      ],
    }) as ICombatUnit;

    // advancedActorId must match the unit's id for getUnitHpAtTimestamp to pick it up
    const enemy = makeUnit('enemy-1', {
      name: 'Natjkis',
      advancedActions: [
        { ...makeAdvancedAction(6_000, 0, 0, 500_000, 175_000), advancedActorId: 'enemy-1' }, // 35% at t=6s
      ],
    }) as ICombatUnit;

    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [friend],
        enemies: [enemy],
        matchStartMs,
        matchEndMs: 9_000,
      }),
    );

    // Both HP readings should appear on the same [HP] line at t=6s
    const hpLines = result.split('\n').filter((l) => l.includes('[HP]'));
    expect(hpLines.length).toBeGreaterThan(0);
    const sixSecondLine = hpLines.find((l) => l.startsWith('0:06'));
    expect(sixSecondLine).toBeDefined();
    expect(sixSecondLine).toContain('Feramonk:90%');
    expect(sixSecondLine).toContain('Natjkis:35%');
  });

  it('adds 1s dense ticks in [T-10, T] window before an enemy death', () => {
    const matchStartMs = 0;

    const enemy = makeUnit('enemy-1', {
      name: 'Natjkis',
      advancedActions: [
        { ...makeAdvancedAction(51_000, 0, 0, 500_000, 100_000), advancedActorId: 'enemy-1' }, // 20% at t=51s
        { ...makeAdvancedAction(53_000, 0, 0, 500_000, 65_000), advancedActorId: 'enemy-1' }, // 13% at t=53s
        { ...makeAdvancedAction(55_000, 0, 0, 500_000, 25_000), advancedActorId: 'enemy-1' }, // 5% at t=55s
      ],
    }) as ICombatUnit;

    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        enemyDeaths: [{ spec: 'Affliction Warlock', name: 'Natjkis', atSeconds: 60 }],
        matchStartMs,
        matchEndMs: 65_000,
      }),
    );

    // Dense window [50, 60] — expect consecutive 1s ticks (not just 3s multiples like 51, 54, 57, 60)
    const hpLines = result.split('\n').filter((l) => l.includes('[HP]'));
    const tickSeconds = hpLines
      .map((l) => {
        const m = l.match(/^(\d+):(\d+)/);
        return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
      })
      .filter((t): t is number => t !== null);
    const inDenseWindow = tickSeconds.filter((t) => t >= 50 && t <= 60);
    // At minimum 5 of the 11 possible 1s ticks should appear (accounting for sparse advanced data)
    expect(inDenseWindow.length).toBeGreaterThanOrEqual(5);
    // Specifically, t=52 and t=53 are NOT 3s multiples — they should appear only because of the dense window
    expect(inDenseWindow).toContain(52);
    expect(inDenseWindow).toContain(53);
  });
});

// ── buildMatchTimeline — [CC CAST] events ─────────────────────────────────────

describe('buildMatchTimeline — [CC CAST] events', () => {
  function makeAoeCCChain(
    targetName: string,
    casterName: string,
    spellId: string,
    spellName: string,
    atSeconds: number,
    durationSeconds: number,
  ): IOutgoingCCChain {
    return {
      targetName,
      targetSpec: 'Shadow Priest',
      applications: [
        {
          atSeconds,
          durationSeconds,
          spellId,
          spellName,
          casterName,
          casterSpec: 'Holy Priest',
          drInfo: { category: 'Disorient', level: 'Full' as const, sequenceIndex: 0 },
        },
      ],
      hasWastedApplications: false,
    };
  }

  it('emits nothing when outgoingCCChains is not provided', () => {
    const result = buildMatchTimeline(makeBaseParams());
    expect(result).not.toContain('[CC CAST]');
  });

  it('emits nothing when outgoingCCChains is empty', () => {
    const result = buildMatchTimeline(makeBaseParams({ outgoingCCChains: [] }));
    expect(result).not.toContain('[CC CAST]');
  });

  it('does not emit [CC CAST] for single-target CC (Cyclone 33786)', () => {
    const chains: IOutgoingCCChain[] = [makeAoeCCChain('EnemyA', 'Feramonk', '33786', 'Cyclone', 21, 6)];
    const result = buildMatchTimeline(makeBaseParams({ outgoingCCChains: chains }));
    expect(result).not.toContain('[CC CAST]');
  });

  it('emits [CC CAST] for Psychic Scream hitting 1 enemy', () => {
    const chains: IOutgoingCCChain[] = [makeAoeCCChain('EnemyA', 'Feramonk', '8122', 'Psychic Scream', 21, 8)];
    const result = buildMatchTimeline(makeBaseParams({ outgoingCCChains: chains }));
    expect(result).toContain('[CC CAST]');
    expect(result).toContain('Psychic Scream');
    expect(result).toContain('0:21');
  });

  it('emits [CC CAST] for Psychic Scream hitting 2 enemies, listing both targets and count', () => {
    const chains: IOutgoingCCChain[] = [
      makeAoeCCChain('EnemyA', 'Feramonk', '8122', 'Psychic Scream', 21, 8),
      makeAoeCCChain('EnemyB', 'Feramonk', '8122', 'Psychic Scream', 21, 8),
    ];
    const result = buildMatchTimeline(makeBaseParams({ outgoingCCChains: chains }));
    expect(result).toContain('[CC CAST]');
    expect(result).toContain('EnemyA');
    expect(result).toContain('EnemyB');
    expect(result).toContain('[2 enemies]');
  });

  it('emits one [CC CAST] line per cast event, not per target', () => {
    const chains: IOutgoingCCChain[] = [
      makeAoeCCChain('EnemyA', 'Feramonk', '8122', 'Psychic Scream', 21, 8),
      makeAoeCCChain('EnemyB', 'Feramonk', '8122', 'Psychic Scream', 21, 8),
      makeAoeCCChain('EnemyC', 'Feramonk', '8122', 'Psychic Scream', 21, 8),
    ];
    const result = buildMatchTimeline(makeBaseParams({ outgoingCCChains: chains }));
    const castLines = result.split('\n').filter((l) => l.includes('[CC CAST]'));
    expect(castLines).toHaveLength(1);
    expect(result).toContain('[3 enemies]');
  });

  it('uses enemyPid to compress enemy target names when idMaps are provided', () => {
    const chains: IOutgoingCCChain[] = [makeAoeCCChain('EnemyA', 'Feramonk', '8122', 'Psychic Scream', 21, 8)];
    const playerIdMap = new Map([['Feramonk', 1]]);
    const enemyIdMap = new Map([['EnemyA', 4]]);
    const result = buildMatchTimeline(makeBaseParams({ outgoingCCChains: chains, playerIdMap, enemyIdMap }));
    expect(result).toContain('[CC CAST]');
    expect(result).toContain('4');
  });

  it('emits separate [CC CAST] lines for separate casts of same spell (> 0.5s apart)', () => {
    const chains: IOutgoingCCChain[] = [
      makeAoeCCChain('EnemyA', 'Feramonk', '8122', 'Psychic Scream', 21, 8),
      makeAoeCCChain('EnemyA', 'Feramonk', '8122', 'Psychic Scream', 45, 8),
    ];
    const result = buildMatchTimeline(makeBaseParams({ outgoingCCChains: chains }));
    const castLines = result.split('\n').filter((l) => l.includes('[CC CAST]'));
    expect(castLines).toHaveLength(2);
  });
});

// ── buildMatchTimeline — F67 [ENEMY BUFFS] line ──────────────────────────────

describe('buildMatchTimeline — F67 [ENEMY BUFFS]', () => {
  function makeEnemyWithAura(
    id: string,
    name: string,
    spellId: string,
    appliedMs: number,
    removedMs: number,
  ): ICombatUnit {
    return makeUnit(id, {
      name,
      reaction: CombatUnitReaction.Hostile,
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, spellId, appliedMs, 'src-1', id),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, spellId, removedMs, 'src-1', id),
      ],
    });
  }

  it('emits [ENEMY BUFFS] line on [OWNER CD] when enemy has Power Infusion active', () => {
    // PI active on Natjkis from 20s to 40s; owner CD cast at 30s
    const enemy = makeEnemyWithAura('enemy-1', 'Natjkis', '10060', 20_000, 40_000);
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        matchStartMs: 0,
        matchEndMs: 60_000,
        ownerCDs: [
          {
            spellId: '33206',
            spellName: 'Pain Suppression',
            tag: 'Defensive',
            cooldownSeconds: 180,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 30 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).toContain('[ENEMY BUFFS]');
    expect(result).toContain('Power Infusion');
  });

  it('marks Power Infusion as [PURGEABLE]', () => {
    const enemy = makeEnemyWithAura('enemy-1', 'Natjkis', '10060', 20_000, 40_000);
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        matchStartMs: 0,
        matchEndMs: 60_000,
        ownerCDs: [
          {
            spellId: '33206',
            spellName: 'Pain Suppression',
            tag: 'Defensive',
            cooldownSeconds: 180,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 30 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).toContain('[PURGEABLE]');
  });

  it('emits [ENEMY BUFFS] on [TEAMMATE CD] too', () => {
    const enemy = makeEnemyWithAura('enemy-1', 'Natjkis', '10060', 20_000, 40_000);
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        matchStartMs: 0,
        matchEndMs: 60_000,
        teammateCDs: [
          {
            player: makeOwner('Simplesauce'),
            spec: 'Unholy Death Knight',
            cds: [
              {
                spellId: '48707',
                spellName: 'Anti-Magic Shell',
                tag: 'Defensive',
                cooldownSeconds: 60,
                maxChargesDetected: 1,
                casts: [{ timeSeconds: 25 }],
                availableWindows: [],
                neverUsed: false,
              },
            ],
          },
        ],
      }),
    );
    expect(result).toContain('[ENEMY BUFFS]');
    expect(result).toContain('Power Infusion');
  });

  it('does NOT emit [ENEMY BUFFS] when no tracked buff is active at snapshot time', () => {
    // PI active 20–40s, owner CD at 50s (after PI expired)
    const enemy = makeEnemyWithAura('enemy-1', 'Natjkis', '10060', 20_000, 40_000);
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        matchStartMs: 0,
        matchEndMs: 60_000,
        ownerCDs: [
          {
            spellId: '33206',
            spellName: 'Pain Suppression',
            tag: 'Defensive',
            cooldownSeconds: 180,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 50 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).not.toContain('[ENEMY BUFFS]');
  });

  it('does NOT emit [ENEMY BUFFS] when enemies array is empty', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [],
        matchStartMs: 0,
        matchEndMs: 60_000,
        ownerCDs: [
          {
            spellId: '33206',
            spellName: 'Pain Suppression',
            tag: 'Defensive',
            cooldownSeconds: 180,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 30 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).not.toContain('[ENEMY BUFFS]');
  });

  it('does NOT emit [ENEMY BUFFS] for untracked spell IDs (e.g. Bloodlust 2825 is not logged as aura on enemies)', () => {
    // Bloodlust (2825) and other mass-buff effects do not generate SPELL_AURA_APPLIED on
    // enemy team members in WoW combat logs — only targeted externals like PI do.
    const enemy = makeEnemyWithAura('enemy-1', 'Natjkis', '2825', 20_000, 40_000);
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        matchStartMs: 0,
        matchEndMs: 60_000,
        ownerCDs: [
          {
            spellId: '33206',
            spellName: 'Pain Suppression',
            tag: 'Defensive',
            cooldownSeconds: 180,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 30 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).not.toContain('[ENEMY BUFFS]');
  });

  it('shows remaining seconds for active buff', () => {
    // PI active 20–50s, owner CD at 30s → 20s remaining
    const enemy = makeEnemyWithAura('enemy-1', 'Natjkis', '10060', 20_000, 50_000);
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        matchStartMs: 0,
        matchEndMs: 60_000,
        ownerCDs: [
          {
            spellId: '33206',
            spellName: 'Pain Suppression',
            tag: 'Defensive',
            cooldownSeconds: 180,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 30 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).toContain('20s left');
  });

  it('uses numeric enemy ID when enemyIdMap is provided', () => {
    const enemy = makeEnemyWithAura('enemy-1', 'Natjkis', '10060', 20_000, 40_000);
    const playerIdMap = new Map([['Feramonk', 1]]);
    const enemyIdMap = new Map([['Natjkis', 3]]);
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        matchStartMs: 0,
        matchEndMs: 60_000,
        playerIdMap,
        enemyIdMap,
        ownerCDs: [
          {
            spellId: '33206',
            spellName: 'Pain Suppression',
            tag: 'Defensive',
            cooldownSeconds: 180,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 30 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).toContain('[ENEMY BUFFS]');
    // numeric ID '3' should appear in the buff line
    const buffLine = result.split('\n').find((l) => l.includes('[ENEMY BUFFS]'));
    expect(buffLine).toBeDefined();
    expect(buffLine).toContain('3');
  });
});
