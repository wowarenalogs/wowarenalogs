import { CombatUnitType, getUnitType, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { getEnglishSpellName, spellEffectData } from '../../../data/spellEffectData';
import { ccSpellIds } from '../../../data/spellTags';
import { IPlayerCCTrinketSummary } from '../../../utils/ccTrinketAnalysis';
import { fmtTime, getUnitHpAtTimestamp, IDamageBucket, IMajorCooldownInfo } from '../../../utils/cooldowns';
import { getDampeningPercentage } from '../../../utils/dampening';
import { canDefensiveCleanse, IDispelEvent, IDispelSummary } from '../../../utils/dispelAnalysis';
import { extractAoeCCEvents, IOutgoingCCChain } from '../../../utils/drAnalysis';
import { IEnemyCDTimeline } from '../../../utils/enemyCDs';
import { IHealingGap } from '../../../utils/healingGaps';
import { getHpPercentAtTime } from '../../../utils/killWindowTargetSelection';
import {
  buildResourceSnapshot,
  computeOnCDDisplayNames,
  computeReadyNames,
  ResourceSnapshotParams,
} from './resourceSnapshot';
import {
  computeHealingInWindow,
  DMG_SPIKE_THRESHOLD,
  extractEnemyMajorBuffIntervals,
  extractOwnerCDBuffExpiry,
  getTopDamageSourcesInWindow,
  HEALER_CAST_SPELL_ID_TO_NAME,
  HEALING_AMPLIFIER_SPELL_IDS,
  HEALING_WINDOW_EARLY_CD_SECONDS,
  HEALING_WINDOW_MIN_HPS,
  PASSIVE_SPELL_BLOCKLIST,
} from './timelineHelpers';

// ── buildMatchTimeline ─────────────────────────────────────────────────────

export interface BuildMatchTimelineParams {
  owner: ICombatUnit;
  ownerSpec: string;
  ownerCDs: IMajorCooldownInfo[];
  teammateCDs: Array<{ player: ICombatUnit; spec: string; cds: IMajorCooldownInfo[] }>;
  enemyCDTimeline: IEnemyCDTimeline;
  ccTrinketSummaries: IPlayerCCTrinketSummary[];
  dispelSummary: IDispelSummary;
  friendlyDeaths: Array<{ spec: string; name: string; atSeconds: number; note?: string }>;
  enemyDeaths: Array<{ spec: string; name: string; atSeconds: number }>;
  pressureWindows: IDamageBucket[];
  healingGaps: IHealingGap[];
  friends: ICombatUnit[];
  /**
   * Enemy player units. When provided, their HP is included in [STATE] ticks
   * alongside friendly HP, referenced by enemyPid() numeric ID.
   */
  enemies?: ICombatUnit[];
  matchStartMs: number;
  matchEndMs: number;
  isHealer: boolean;
  /**
   * Arena bracket string (e.g. '3v3', '2v2'). When provided, final dampening %
   * is included in the [MATCH END] block.
   */
  bracket?: string;
  /**
   * Friendly player name → numeric ID mapping from buildPlayerLoadout.
   * When provided, friendly names are compressed to short IDs in the timeline.
   */
  playerIdMap?: Map<string, number>;
  /**
   * Enemy player name → numeric ID mapping from buildPlayerLoadout.
   * Required alongside playerIdMap to avoid collision when a friendly and enemy
   * share the same display name.
   */
  enemyIdMap?: Map<string, number>;
  /**
   * AoE CC chains cast by friendly players on enemies. When provided,
   * [CC CAST] events are emitted for AoE spells (non-single-target spells).
   */
  outgoingCCChains?: IOutgoingCCChain[];
  /**
   * Override the resource snapshot function injected after each [OWNER CD] and [TEAMMATE CD] event.
   * Defaults to buildResourceSnapshot (text format). Pass buildJsonSituationSnapshot for JSON format.
   */
  resourceSnapshotFn?: (params: ResourceSnapshotParams) => string;
}

export function buildMatchTimeline(params: BuildMatchTimelineParams): string {
  const {
    owner,
    ownerSpec,
    ownerCDs,
    teammateCDs,
    enemyCDTimeline,
    ccTrinketSummaries,
    dispelSummary,
    friendlyDeaths,
    enemyDeaths,
    pressureWindows,
    healingGaps,
    friends,
    enemies,
    matchStartMs,
    matchEndMs,
    isHealer,
    playerIdMap,
    enemyIdMap,
    outgoingCCChains,
    resourceSnapshotFn,
    bracket,
  } = params;

  const enemyBuffIntervals = extractEnemyMajorBuffIntervals(enemies ?? [], matchStartMs, matchEndMs);

  /**
   * Returns the short numeric ID for a friendly player name, or the raw name
   * if no mapping exists.  Enemy names must be resolved via enemyPid() to avoid
   * ID collision when a friendly and enemy share a display name.
   */
  function pid(name: string): string {
    if (!playerIdMap) return name;
    const id = playerIdMap.get(name);
    return id !== undefined ? String(id) : name;
  }

  /** Returns the short numeric ID for an *enemy* player name, falling back to name. */
  function enemyPid(name: string): string {
    if (!enemyIdMap) return name;
    const id = enemyIdMap.get(name);
    return id !== undefined ? String(id) : name;
  }

  /**
   * Resolves a cast's destUnitName to a display label for [OWNER CAST] entries.
   * Returns "self" for self-casts, a numeric ID for known players, or the raw name.
   * Returns "" when destUnitName is empty (AoE spells with no specific log target).
   */
  function resolveTarget(destUnitName: string | null | undefined): string {
    if (!destUnitName || destUnitName === 'nil') return '';
    if (destUnitName === owner.name) return 'self';
    if (playerIdMap) {
      const id = playerIdMap.get(destUnitName);
      if (id !== undefined) return String(id);
    }
    if (enemyIdMap) {
      const id = enemyIdMap.get(destUnitName);
      if (id !== undefined) return String(id);
    }
    return destUnitName;
  }

  const snapshotFn = resourceSnapshotFn ?? buildResourceSnapshot;

  let prevReadyNamesState: string[] | null = null;
  let prevOnCDNamesState: string[] | null = null;

  function resourceSnapshot(timeSeconds: number): string {
    // B34: compute attributed names (pid:SpellName for teammates)
    const teammateCDsWithLabel = teammateCDs.map(({ player, cds, spec }) => ({
      cds,
      spec,
      player,
      playerLabel: playerIdMap ? String(playerIdMap.get(player.name) ?? player.name) : player.name,
    }));
    const currentReadyNames = computeReadyNames(timeSeconds, ownerCDs, teammateCDsWithLabel);
    const currentOnCDNames = computeOnCDDisplayNames(timeSeconds, ownerCDs, teammateCDsWithLabel);
    const prevReadyNames = prevReadyNamesState ?? undefined;
    const prevOnCDNames = prevOnCDNamesState ?? undefined;
    prevReadyNamesState = currentReadyNames;
    prevOnCDNamesState = currentOnCDNames;
    return snapshotFn({
      timeSeconds,
      ownerCDs,
      ownerName: owner.name,
      ownerSpec,
      isOwnerHealer: isHealer,
      teammateCDs,
      ccTrinketSummaries,
      enemyCDTimeline,
      playerIdMap,
      prevReadyNames,
      prevOnCDNames,
    });
  }

  const entries: Array<{ timeSeconds: number; lines: string[] }> = [];

  function addEntry(timeSeconds: number, ...lines: string[]) {
    entries.push({ timeSeconds, lines: lines.filter(Boolean) });
  }

  // ── [OFFENSIVE WINDOW] synthesized headers ─────────────────────────────────

  for (const burst of enemyCDTimeline.alignedBurstWindows) {
    const overlappingSpike = pressureWindows.find(
      (pw) =>
        pw.totalDamage >= DMG_SPIKE_THRESHOLD &&
        pw.fromSeconds >= burst.fromSeconds - 5 &&
        pw.fromSeconds <= burst.toSeconds + 5,
    );
    if (!overlappingSpike) continue;
    const dmgM = (overlappingSpike.totalDamage / 1_000_000).toFixed(2);
    const cdNames = burst.activeCDs.map((c) => c.spellName).join(' + ');
    addEntry(
      burst.fromSeconds,
      `${fmtTime(burst.fromSeconds)}  [OFFENSIVE WINDOW]   ${fmtTime(burst.fromSeconds)}–${fmtTime(burst.toSeconds)} | ${burst.dangerLabel} | ${dmgM}M on ${pid(overlappingSpike.targetName)} (${overlappingSpike.targetSpec}) | CDs: ${cdNames}`,
    );
  }

  // ── [DEATH] events ────────────────────────────────────────────────────────

  const unitsByName = new Map(friends.map((u) => [u.name, u]));

  for (const death of friendlyDeaths) {
    const notePart = death.note ? ` [${death.note}]` : '';
    const deathLines: string[] = [
      `${fmtTime(death.atSeconds)}  [DEATH]  ${pid(death.name)} (${death.spec} — friendly)${notePart}`,
    ];

    const dyingUnit = unitsByName.get(death.name);
    if (dyingUnit) {
      // HP trajectory
      const checkpoints = [15, 10, 5, 3];
      const trajectory: string[] = [];
      for (const secondsBefore of checkpoints) {
        const pct = getHpPercentAtTime(dyingUnit, death.atSeconds - secondsBefore, matchStartMs);
        if (pct !== null) trajectory.push(`${Math.round(pct)}% at T-${secondsBefore}s`);
      }
      if (trajectory.length > 0) {
        deathLines.push(`               HP: ${trajectory.join(' → ')} → dead`);
      }

      // Top damage sources in final 10s — uses shared helper to avoid duplication
      const deathMs = matchStartMs + death.atSeconds * 1000;
      const topSources = getTopDamageSourcesInWindow(dyingUnit, deathMs, 10_000);
      if (topSources.length > 0) {
        deathLines.push(`               Top damage in final 10s: ${topSources.join(', ')}`);
      }
    }

    addEntry(death.atSeconds, ...deathLines);
  }

  for (const death of enemyDeaths) {
    addEntry(
      death.atSeconds,
      `${fmtTime(death.atSeconds)}  [DEATH]  ${enemyPid(death.name)} (${death.spec} — enemy)`,
      `${fmtTime(death.atSeconds)}  [ROSTER]  enemy ${enemyPid(death.name)} removed (dead)`,
    );
  }

  // ── [OWNER CD] events ───────────────────────────────────────────────────────

  for (const cd of ownerCDs) {
    for (const cast of cd.casts) {
      const targetPart =
        cast.targetName !== undefined
          ? ` → ${pid(cast.targetName)}${cast.targetHpPct !== undefined ? ` (${cast.targetHpPct}% HP)` : ''}`
          : '';

      const extraLines: string[] = [resourceSnapshot(cast.timeSeconds)];

      if (HEALING_AMPLIFIER_SPELL_IDS.has(cd.spellId)) {
        const duration = spellEffectData[cd.spellId]?.durationSeconds;
        if (duration) {
          const fromMs = matchStartMs + cast.timeSeconds * 1000;
          const toMs = fromMs + duration * 1000;
          const healStats = computeHealingInWindow(owner.healOut, fromMs, toMs);
          const maxBucketHps = healStats ? Math.max(...healStats.buckets.map((b) => b.hps)) : 0;
          const isEarlyLowActivity =
            cast.timeSeconds < HEALING_WINDOW_EARLY_CD_SECONDS && maxBucketHps < HEALING_WINDOW_MIN_HPS;
          if (!isEarlyLowActivity) {
            if (healStats) {
              const bucketParts = healStats.buckets.map(
                (b) => `${b.fromSeconds}–${b.toSeconds}s: ${(b.hps / 1000).toFixed(1)}k HPS`,
              );
              extraLines.push(`      [HEALING]    ${bucketParts.join(' | ')} | Overheal: ${healStats.overhealPct}%`);
            } else {
              extraLines.push(`      [HEALING]    No healing logged during this window`);
            }
          }
        }
      }

      addEntry(
        cast.timeSeconds,
        `${fmtTime(cast.timeSeconds)}  [OWNER CD]   ${cd.spellName}${targetPart}`,
        ...extraLines,
      );
    }
  }

  // ── [BUFF FADED] events (F70, B31: renamed from [CD EXPIRED]) ──────────────

  const matchDurationSEarly = (matchEndMs - matchStartMs) / 1000;
  const cdExpiryEvents = extractOwnerCDBuffExpiry(ownerCDs, owner.id, friends, matchStartMs);
  for (const expiry of cdExpiryEvents) {
    // B33: skip estimated expiry events that fall past match end — they're irrelevant post-game
    // and would appear chronologically after [MATCH END] confusing the timeline ordering.
    if (expiry.expiresAtSeconds > matchDurationSEarly) continue;
    const estimatedNote = expiry.isEstimated ? ' (estimated)' : '';
    addEntry(
      expiry.expiresAtSeconds,
      `${fmtTime(expiry.expiresAtSeconds)}  [BUFF FADED]   ${expiry.spellName}${estimatedNote}`,
    );
  }

  // ── [OWNER CAST] healer gap-filler (F61) ────────────────────────────────────

  if (isHealer) {
    const trackedCastsBySpellId = new Map<string, Set<number>>();
    for (const cd of ownerCDs) {
      trackedCastsBySpellId.set(
        cd.spellId,
        new Set(cd.casts.map((c) => matchStartMs + Math.round(c.timeSeconds * 1000))),
      );
    }
    const trinketUseTimesMs = new Set(
      ccTrinketSummaries.flatMap((s) => s.trinketUseTimes.map((t) => Math.round(matchStartMs + t * 1000))),
    );

    // F68/B32: flat list of CC events targeting the owner only (not teammates).
    // B32 fix: restrict disambiguation annotations to CCs that hit the caster,
    // not CCs that hit teammates at a similar timestamp.
    const ownerCCMsTimestamps: number[] = ccTrinketSummaries
      .filter((s) => s.playerName === owner.name)
      .flatMap((s) => s.ccInstances.map((cc) => Math.round(matchStartMs + cc.atSeconds * 1000)));

    for (const e of owner.spellCastEvents ?? []) {
      if (e.logLine.event !== LogEvent.SPELL_CAST_SUCCESS) continue;
      if (!e.spellId) continue;
      const englishName = getEnglishSpellName(e.spellId) ?? e.spellName;
      if (e.spellName && PASSIVE_SPELL_BLOCKLIST.has(e.spellName)) continue;

      const displayName = HEALER_CAST_SPELL_ID_TO_NAME[e.spellId] ?? englishName;
      if (!displayName) continue;
      const tsMs = e.logLine.timestamp;
      const trackedSet = trackedCastsBySpellId.get(e.spellId);
      if (trackedSet && (trackedSet.has(tsMs) || trackedSet.has(tsMs - 1000) || trackedSet.has(tsMs + 1000))) continue;
      if (trinketUseTimesMs.has(tsMs) || trinketUseTimesMs.has(tsMs - 1000) || trinketUseTimesMs.has(tsMs + 1000))
        continue;
      const timeSeconds = (tsMs - matchStartMs) / 1000;

      // F68/F89/B32: find nearest CC *on the owner* within 1s — annotate ordering
      // so Claude knows the cast completed before or after incoming CC.
      // B32: only match CCs targeting the log owner, not teammates.
      const CC_PROXIMITY_MS = 1000;
      const nearestCC = ownerCCMsTimestamps
        .filter((ccMs) => Math.abs(ccMs - tsMs) <= CC_PROXIMITY_MS)
        .sort((a, b) => Math.abs(a - tsMs) - Math.abs(b - tsMs))[0];
      let orderNote = '';
      if (nearestCC !== undefined) {
        if (tsMs < nearestCC) {
          orderNote = ' [completed before CC landed]';
        } else if (tsMs > nearestCC) {
          orderNote = ' [succeeded after CC arrived — within 1s in log]';
        } else {
          orderNote = ' [same server tick as CC — cast succeeded per log]';
        }
      }

      const targetLabel = resolveTarget(e.destUnitName);
      const targetPart = targetLabel ? ` → ${targetLabel}` : '';
      const destType = getUnitType(e.destUnitFlags ?? 0);
      let totemNote = '';
      if (destType === CombatUnitType.Guardian || destType === CombatUnitType.Pet) {
        // B44: distinguish Grounding Totem absorption (wasted cast) from other totem/pet targets
        totemNote =
          (e.destUnitName?.toLowerCase().includes('grounding totem') ?? false)
            ? ' [absorbed: Grounding Totem]'
            : ' [totem/pet]';
      }

      // B38: promote major-CD spells (CD ≥ 30s) to [OWNER CD] format when extractMajorCooldowns
      // missed them (e.g. missing talent data). This keeps Avenging Crusader etc. from appearing
      // as filler casts when they are significant cooldown activations.
      const effectData = spellEffectData[e.spellId];
      const cdSeconds = effectData?.cooldownSeconds ?? effectData?.charges?.chargeCooldownSeconds ?? 0;
      if (cdSeconds >= 30) {
        addEntry(
          timeSeconds,
          `${fmtTime(timeSeconds)}  [OWNER CD]   ${displayName}${targetPart}${totemNote}`,
          resourceSnapshot(timeSeconds),
        );
        continue;
      }

      addEntry(
        timeSeconds,
        `${fmtTime(timeSeconds)}  [OWNER CAST]   ${displayName}${targetPart}${totemNote}${orderNote}`,
      );
    }
  }

  // ── [TEAMMATE CD] events ────────────────────────────────────────────────────

  for (const { player, spec, cds } of teammateCDs) {
    for (const cd of cds) {
      for (const cast of cd.casts) {
        addEntry(
          cast.timeSeconds,
          `${fmtTime(cast.timeSeconds)}  [TEAMMATE CD]   ${pid(player.name)} (${spec}): ${cd.spellName}`,
          resourceSnapshot(cast.timeSeconds),
        );
      }
    }
  }

  // ── [CC CAST] events — AoE CC cast by friendly players on enemies ──────────

  if (outgoingCCChains && outgoingCCChains.length > 0) {
    for (const event of extractAoeCCEvents(outgoingCCChains)) {
      const casterLabel = pid(event.casterName);
      const targetLabels = event.targets.map((t) => enemyPid(t.name)).join(', ');
      const countNote = event.targets.length > 1 ? ` [${event.targets.length} enemies]` : '';
      addEntry(
        event.atSeconds,
        `${fmtTime(event.atSeconds)}  [CC CAST]   ${event.spellName} (by ${casterLabel}) → ${targetLabels}${countNote}`,
      );
    }
  }

  // ── B46: [CC CAST] on non-player units (e.g. Tremor Totem) ─────────────────
  // Friendly players may CC a totem/pet/NPC instead of an enemy player — these
  // casts are invisible to outgoingCCChains (which only tracks enemy players).
  {
    const friendlyIds = new Set([owner.id, ...friends.map((f) => f.id)]);
    for (const player of [owner, ...friends.filter((f) => f.id !== owner.id)]) {
      for (const cast of player.spellCastEvents ?? []) {
        if (cast.logLine.event !== LogEvent.SPELL_CAST_SUCCESS) continue;
        if (!cast.spellId || !ccSpellIds.has(cast.spellId)) continue;
        const castType = getUnitType(cast.destUnitFlags ?? 0);
        if (castType === CombatUnitType.Player) continue; // handled by outgoingCCChains
        if (friendlyIds.has(cast.destUnitId ?? '')) continue; // CC on own team — ignore
        const timeSeconds = (cast.logLine.timestamp - matchStartMs) / 1000;
        const spellLabel = getEnglishSpellName(cast.spellId, cast.spellName ?? '');
        const targetLabel = cast.destUnitName || 'Unknown';
        addEntry(
          timeSeconds,
          `${fmtTime(timeSeconds)}  [CC CAST]   ${spellLabel} (by ${pid(player.name)}) → ${targetLabel} [non-player target]`,
        );
      }
    }
  }

  // ── [ENEMY BUFF] / [ENEMY BUFF END] events (F67b) ─────────────────────────

  for (const [enemyName, intervals] of enemyBuffIntervals) {
    for (const interval of intervals) {
      const purgeNote = interval.purgeable ? ' (purgeable)' : '';
      addEntry(
        interval.startSeconds,
        `${fmtTime(interval.startSeconds)}  [ENEMY BUFF]   ${enemyPid(enemyName)}: ${interval.spellName}${purgeNote}`,
      );
      addEntry(
        interval.endSeconds,
        `${fmtTime(interval.endSeconds)}  [ENEMY BUFF END]   ${enemyPid(enemyName)}: ${interval.spellName}`,
      );
    }
  }

  // ── [ENEMY CD] events ──────────────────────────────────────────────────────

  for (const player of enemyCDTimeline.players) {
    for (const cd of player.offensiveCDs) {
      addEntry(
        cd.castTimeSeconds,
        `${fmtTime(cd.castTimeSeconds)}  [ENEMY CD]   ${enemyPid(player.playerName)} (${player.specName}): ${cd.spellName}`,
      );
    }
  }

  // ── [TRINKET] and [CC ON TEAM] events ──────────────────────────────────────

  for (const summary of ccTrinketSummaries) {
    for (const t of summary.trinketUseTimes) {
      addEntry(t, `${fmtTime(t)}  [TRINKET]   ${pid(summary.playerName)} used PvP trinket`);
    }

    for (const cc of summary.ccInstances) {
      if (cc.durationSeconds === 0) continue;
      let trinketNote = '';
      if (cc.trinketState === 'used') {
        trinketNote = ' | trinket: used';
      } else if (cc.trinketState === 'on_cooldown') {
        const cdLeft = cc.trinketCDSecondsLeft !== undefined ? `${cc.trinketCDSecondsLeft}s left` : 'on CD';
        trinketNote = ` | trinket: ON CD (${cdLeft})`;
      }
      // available_unused → implicit default, no annotation
      // passive_trinket → player has no active trinket, no annotation
      addEntry(
        cc.atSeconds,
        `${fmtTime(cc.atSeconds)}  [CC ON TEAM]   ${pid(summary.playerName)} ← ${cc.spellName} (${pid(cc.sourceName)}) | ${cc.durationSeconds.toFixed(0)}s${trinketNote}`,
      );
    }
  }

  // ── [MISSED CLEANSE] and [CLEANSE] events ──────────────────────────────────

  for (const miss of dispelSummary.missedCleanseWindows) {
    // B16: only emit if the log owner's spec can actually remove this debuff type
    if (!canDefensiveCleanse(owner, miss.dispelType)) continue;
    const dmgK = Math.round(miss.postCcDamage / 1000);
    addEntry(
      miss.timeSeconds,
      `${fmtTime(miss.timeSeconds)}  [MISSED CLEANSE]   ${miss.spellName} on ${pid(miss.targetName)} | ${miss.durationSeconds.toFixed(0)}s | ${dmgK}k taken during | dispel: ${miss.dispelType}`,
    );
  }

  // B14: Consolidate same-second same-source cleanses (e.g. Mass Dispel) into one line.
  {
    const cleanseGroups = new Map<string, IDispelEvent[]>();
    for (const cleanse of dispelSummary.allyCleanse) {
      const key = `${Math.round(cleanse.timeSeconds)}|${cleanse.sourceName}`;
      const group = cleanseGroups.get(key) ?? [];
      group.push(cleanse);
      cleanseGroups.set(key, group);
    }
    for (const group of cleanseGroups.values()) {
      const first = group[0];
      const petTag = group.some((c) => c.isPetDispel) ? ' (pet)' : '';
      if (group.length === 1) {
        addEntry(
          first.timeSeconds,
          `${fmtTime(first.timeSeconds)}  [CLEANSE]   ${pid(first.sourceName)} dispelled ${first.removedSpellName} off ${pid(first.targetName)}${petTag}`,
        );
      } else {
        const effects = group.map((c) => `${c.removedSpellName} off ${pid(c.targetName)}`).join(', ');
        addEntry(
          first.timeSeconds,
          `${fmtTime(first.timeSeconds)}  [CLEANSE]   ${pid(first.sourceName)} dispelled ${group.length} effects: ${effects}${petTag}`,
        );
      }
    }
  }

  // ── [DMG SPIKE] events ─────────────────────────────────────────────────────

  for (const pw of pressureWindows) {
    if (pw.totalDamage < DMG_SPIKE_THRESHOLD) continue;
    const dmgM = (pw.totalDamage / 1_000_000).toFixed(2);
    const windowSec = Math.round(pw.toSeconds - pw.fromSeconds);
    addEntry(
      pw.fromSeconds,
      `${fmtTime(pw.fromSeconds)}  [DMG SPIKE]   ${pid(pw.targetName)} (${pw.targetSpec}): ${dmgM}M in ${windowSec}s`,
    );
  }

  // ── [HEALING GAP] events (healer only) ────────────────────────────────────

  if (isHealer) {
    for (const gap of healingGaps) {
      addEntry(
        gap.fromSeconds,
        `${fmtTime(gap.fromSeconds)}  [HEALING GAP]   ${pid(owner.name)} inactive ${gap.durationSeconds.toFixed(1)}s (${gap.freeCastSeconds.toFixed(1)}s free) while ${pid(gap.mostDamagedName)} under pressure`,
      );
    }
  }

  // ── [STATE] ticks — 1s resolution in critical windows, 3s elsewhere (F62) ──────

  const matchDurationS = (matchEndMs - matchStartMs) / 1000;

  const criticalWindowSet = new Set<number>(); // which tick-seconds are in a critical window
  for (const d of friendlyDeaths) {
    // [T-10, T] window before death
    for (let t = Math.max(0, Math.ceil(d.atSeconds - 10)); t <= Math.floor(d.atSeconds); t++) {
      criticalWindowSet.add(t);
    }
  }
  for (const d of enemyDeaths) {
    for (let t = Math.max(0, Math.ceil(d.atSeconds - 10)); t <= Math.floor(d.atSeconds); t++) {
      criticalWindowSet.add(t);
    }
  }
  for (const pw of pressureWindows) {
    if (pw.totalDamage >= DMG_SPIKE_THRESHOLD) {
      // ±5s centred on the spike start — clamp both edges
      const from = Math.max(0, Math.ceil(pw.fromSeconds - 5));
      const to = Math.min(Math.floor(matchDurationS), Math.floor(pw.fromSeconds + 5));
      for (let t = from; t <= to; t++) criticalWindowSet.add(t);
    }
  }
  for (const summary of ccTrinketSummaries) {
    for (const cc of summary.ccInstances) {
      // [cc.atSeconds, cc.atSeconds + 10] look-ahead — clamp right edge
      const from = Math.max(0, Math.ceil(cc.atSeconds));
      const to = Math.min(Math.floor(matchDurationS), Math.floor(cc.atSeconds + 10));
      for (let t = from; t <= to; t++) criticalWindowSet.add(t);
    }
  }

  const tickSet = new Set<number>();
  // B33: use Math.floor so ticks never exceed matchEnd (Math.ceil could emit a tick 1s past end).
  for (let t = 0; t <= Math.floor(matchDurationS); t++) {
    if (criticalWindowSet.has(t) || t % 3 === 0) {
      tickSet.add(t);
    }
  }

  // Emit HP ticks — use a narrower sample window inside critical windows so adjacent
  // 1-second ticks cannot both claim the same underlying reading (which would give a
  // misleadingly flat HP line during a fast drop).
  const HP_SAMPLE_WINDOW_CRITICAL_MS = 1_500; // ±1.5s for 1s dense ticks
  const HP_SAMPLE_WINDOW_BASELINE_MS = 3_000; // ±3s for 3s baseline ticks

  const friendlyHpUnits: Array<{ unit: ICombatUnit; label: (name: string) => string }> = [
    ...friends.filter((u) => u.name === owner.name),
    ...friends.filter((u) => u.name !== owner.name),
  ].map((u) => ({ unit: u, label: (name: string) => pid(name) }));

  const enemyHpUnits: Array<{ unit: ICombatUnit; label: (name: string) => string }> = (enemies ?? []).map((u) => ({
    unit: u,
    label: (name: string) => enemyPid(name),
  }));

  // B15: Track previous HP readings to suppress unchanged [STATE] ticks.
  // Only emit when at least one unit's HP% changed, OR on 5s anchor ticks.
  let prevHpKey = '';

  // B42: Build death-time lookup so [STATE] ticks show :dead instead of silently omitting dead players.
  const friendlyDeathAtByName = new Map<string, number>(friendlyDeaths.map((d) => [d.name, d.atSeconds]));
  const enemyDeathAtByName = new Map<string, number>(enemyDeaths.map((d) => [d.name, d.atSeconds]));

  for (const t of [...tickSet].sort((a, b) => a - b)) {
    const tsMs = matchStartMs + t * 1000;
    const sampleWindowMs = criticalWindowSet.has(t) ? HP_SAMPLE_WINDOW_CRITICAL_MS : HP_SAMPLE_WINDOW_BASELINE_MS;

    const friendlyParts = friendlyHpUnits
      .map(({ unit, label }) => {
        const deathAt = friendlyDeathAtByName.get(unit.name);
        if (deathAt !== undefined && t >= Math.floor(deathAt)) {
          return `${label(unit.name)}:dead`;
        }
        const pct = getUnitHpAtTimestamp(unit, tsMs, sampleWindowMs);
        // B18/B23: clamp to 100% — absorb shields can push HP readings over max
        const clamped = pct !== null ? Math.min(pct, 100) : null;
        return clamped !== null ? `${label(unit.name)}:${clamped}` : null;
      })
      .filter((s): s is string => s !== null);

    const enemyParts: string[] =
      criticalWindowSet.has(t) && enemyHpUnits.length > 0
        ? enemyHpUnits
            .map(({ unit, label }) => {
              const deathAt = enemyDeathAtByName.get(unit.name);
              if (deathAt !== undefined && t >= Math.floor(deathAt)) {
                return `${label(unit.name)}:dead`;
              }
              const pct = getUnitHpAtTimestamp(unit, tsMs, sampleWindowMs);
              // B18: clamp enemy HP to 100% too
              const clamped = pct !== null ? Math.min(pct, 100) : null;
              return clamped !== null ? `${label(unit.name)}:${clamped}` : null;
            })
            .filter((s): s is string => s !== null)
        : [];

    if (friendlyParts.length === 0 && enemyParts.length === 0) continue;

    // B15: deduplicate — suppress tick if HP readings are identical to previous AND
    // this is not an anchor. In critical windows always emit (1s dense ticks are the point);
    // outside critical windows use the 3s baseline interval as the anchor.
    const currentHpKey = `${friendlyParts.join('|')}||${enemyParts.join('|')}`;
    const isInCritical = criticalWindowSet.has(t);
    const isAnchorTick = isInCritical || t % 3 === 0;
    if (currentHpKey === prevHpKey && !isAnchorTick) continue;
    prevHpKey = currentHpKey;

    let stateParts: string;
    if (friendlyParts.length > 0 && enemyParts.length > 0) {
      stateParts = `friends ${friendlyParts.join(' ')} / enemies ${enemyParts.join(' ')}`;
    } else if (friendlyParts.length > 0) {
      stateParts = `friends ${friendlyParts.join(' ')}`;
    } else {
      stateParts = `enemies ${enemyParts.join(' ')}`;
    }

    addEntry(t, `${fmtTime(t)}  [STATE]   ${stateParts}`);
  }

  // ── Sort and format ───────────────────────────────────────────────────────

  entries.sort((a, b) => a.timeSeconds - b.timeSeconds);

  const outputLines: string[] = ['MATCH TIMELINE', ''];
  for (const entry of entries) {
    outputLines.push(...entry.lines);
  }

  // ── [MATCH END] block ─────────────────────────────────────────────────────

  const matchEndSeconds = (matchEndMs - matchStartMs) / 1000;

  // Final dampening — only when bracket is available
  const finalDampPct = bracket ? getDampeningPercentage(bracket, [...friends, ...(enemies ?? [])], matchEndMs) : null;
  const dampStr = finalDampPct !== null ? `   damp: ${Math.round(finalDampPct)}%` : '';

  outputLines.push('');
  outputLines.push(`${fmtTime(matchEndSeconds)}  [MATCH END]${dampStr}`);

  // Build sets of dead players for quick lookup
  const deadFriendlyNames = new Set(friendlyDeaths.map((d) => d.name));
  const deadEnemyNames = new Set(enemyDeaths.map((d) => d.name));
  // For players who died multiple times, use the last death timestamp
  const friendDeathTimeByName = new Map<string, number>();
  for (const d of friendlyDeaths) friendDeathTimeByName.set(d.name, d.atSeconds);
  const enemyDeathTimeByName = new Map<string, number>();
  for (const d of enemyDeaths) enemyDeathTimeByName.set(d.name, d.atSeconds);

  // B36: stable ordering — log owner always first, then other friendlies in their original order.
  const orderedFriendsForEnd = [owner, ...friends.filter((u) => u.id !== owner.id)];
  const friendParts = orderedFriendsForEnd.map((u) => {
    if (deadFriendlyNames.has(u.name)) {
      const deathAt = friendDeathTimeByName.get(u.name) ?? 0;
      return `${pid(u.name)}:dead(${fmtTime(deathAt)})`;
    }
    const pct = getHpPercentAtTime(u, matchEndSeconds, matchStartMs);
    // B18/B23: clamp to 100%
    const clamped = pct !== null ? Math.min(Math.round(pct), 100) : null;
    return `${pid(u.name)}:${clamped !== null ? `${clamped}%` : '?'}`;
  });

  const enemyParts = (enemies ?? []).map((u) => {
    if (deadEnemyNames.has(u.name)) {
      const deathAt = enemyDeathTimeByName.get(u.name) ?? 0;
      return `${enemyPid(u.name)}:dead(${fmtTime(deathAt)})`;
    }
    const pct = getHpPercentAtTime(u, matchEndSeconds, matchStartMs);
    // B18: clamp to 100%
    const clamped = pct !== null ? Math.min(Math.round(pct), 100) : null;
    return `${enemyPid(u.name)}:${clamped !== null ? `${clamped}%` : '?'}`;
  });

  const stateParts: string[] = [];
  if (friendParts.length > 0) stateParts.push(`friends ${friendParts.join(' ')}`);
  if (enemyParts.length > 0) stateParts.push(`enemies ${enemyParts.join(' ')}`);
  if (stateParts.length > 0) {
    outputLines.push(`  ${stateParts.join(' / ')}`);
  }

  return outputLines.join('\n');
}
