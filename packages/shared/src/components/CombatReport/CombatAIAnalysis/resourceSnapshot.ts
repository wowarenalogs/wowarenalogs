import { ICombatUnit } from '@wowarenalogs/parser';

import { IPlayerCCTrinketSummary } from '../../../utils/ccTrinketAnalysis';
import { IMajorCooldownInfo, isHealerSpec, specToString } from '../../../utils/cooldowns';
import { IEnemyCDTimeline } from '../../../utils/enemyCDs';

// ── Timeline prompt builders ───────────────────────────────────────────────

/**
 * Formats the PLAYER LOADOUT section for the raw timeline prompt.
 * Lists all major CDs (≥30s) available to each player — no usage annotations,
 * no NEVER USED labeling. Absence from the timeline is the signal.
 *
 * Returns both the formatted text and a playerIdMap (name → numeric ID, 1-based)
 * for use in buildMatchTimeline to compress player names to short IDs.
 */
export function buildPlayerLoadout(
  owner: ICombatUnit,
  ownerSpec: string,
  ownerCDs: IMajorCooldownInfo[],
  teammateCDs: Array<{ player: ICombatUnit; spec: string; cds: IMajorCooldownInfo[] }>,
  enemyCDTimeline: IEnemyCDTimeline,
  enemies?: ICombatUnit[],
): {
  text: string;
  playerIdMap: Map<string, number>;
  friendlyIdMap: Map<string, number>;
  enemyIdMap: Map<string, number>;
} {
  const lines: string[] = [];
  lines.push('PLAYER LOADOUT (major CDs ≥30s available this match)');

  // Use separate maps to prevent a friendly and enemy sharing a display name from
  // overwriting each other's ID entry.  The combined playerIdMap returned uses a
  // "friendly:name" / "enemy:name" internal key that pid() resolves correctly.
  const friendlyIdMap = new Map<string, number>();
  const enemyIdMap = new Map<string, number>();
  let nextId = 1;

  const fmtCDLabel = (cd: IMajorCooldownInfo) =>
    `${cd.spellName} [${cd.cooldownSeconds}s${cd.maxChargesDetected > 1 ? `, ${cd.maxChargesDetected} Charges` : ''}]`;
  const ownerCDStr = ownerCDs.length > 0 ? ownerCDs.map(fmtCDLabel).join(', ') : 'none tracked';
  const ownerId = nextId++;
  friendlyIdMap.set(owner.name, ownerId);
  lines.push(`  ${ownerId}: ${owner.name} (${ownerSpec} — log owner):`);
  lines.push(`    ${ownerCDStr}`);

  for (const { player, spec, cds } of teammateCDs) {
    const cdStr = cds.length > 0 ? cds.map(fmtCDLabel).join(', ') : 'none tracked';
    const pid = nextId++;
    friendlyIdMap.set(player.name, pid);
    lines.push(`  ${pid}: ${player.name} (${spec}):`);
    lines.push(`    ${cdStr}`);
  }

  for (const player of enemyCDTimeline.players) {
    const pid = nextId++;
    enemyIdMap.set(player.playerName, pid);
    const seen = new Set<string>();
    const uniqueCDs: string[] = [];
    for (const cd of player.offensiveCDs) {
      const key = `${cd.spellName}|${cd.cooldownSeconds}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueCDs.push(`${cd.spellName} [${cd.cooldownSeconds}s]`);
      }
    }
    lines.push(`  ${pid}: ${player.playerName} (${player.specName} — enemy):`);
    lines.push(`    ${uniqueCDs.length > 0 ? uniqueCDs.join(', ') : 'none tracked'}`);
  }

  // Assign IDs to any enemy units not already covered by enemyCDTimeline.players
  // (enemies who never cast a tracked offensive CD are absent from the timeline).
  for (const enemy of enemies ?? []) {
    if (enemyIdMap.has(enemy.name)) continue;
    const pid = nextId++;
    enemyIdMap.set(enemy.name, pid);
    lines.push(`  ${pid}: ${enemy.name} (${specToString(enemy.spec)} — enemy):`);
    lines.push(`    none tracked`);
  }

  // Build a combined playerIdMap that encodes side to avoid key collision.
  // buildMatchTimeline's pid() function uses this map; friendly names are tried
  // first (covering owner + teammates), then enemy names.
  const playerIdMap = new Map<string, number>();
  for (const [name, id] of friendlyIdMap) playerIdMap.set(name, id);
  // Enemy names are added with a sentinel suffix internally so that a name collision
  // does not silently overwrite the friendly entry.  We store them under
  // "\x00enemy:name" — a key that normal lookups by display name will never hit.
  // The buildMatchTimeline pid() helper resolves enemy names via enemyIdMap which
  // is included in the returned object.
  for (const [name, id] of enemyIdMap) playerIdMap.set('\x00enemy:' + name, id);

  return { text: lines.join('\n'), playerIdMap, friendlyIdMap, enemyIdMap };
}

// ── buildResourceSnapshot ──────────────────────────────────────────────────

/**
 * Returns the names of all friendly major CDs that are ready (available to cast)
 * at the given timeSeconds. Shared between buildResourceSnapshot and the delta
 * state tracker in buildMatchTimeline.
 */
/**
 * Returns attributed ready CD names: owner CDs as "SpellName", teammate CDs as "pid:SpellName".
 * The `playerLabel` field on each teammateCDs entry supplies the display prefix (numeric pid).
 * B34: attributed names disambiguate same-spec teammates who share spell names.
 */
export function computeReadyNames(
  timeSeconds: number,
  ownerCDs: IMajorCooldownInfo[],
  teammateCDs: Array<{ cds: IMajorCooldownInfo[]; playerLabel?: string }>,
): string[] {
  const readyNames: string[] = [];
  const allFriendlyCDs: Array<{ displayName: string; cd: IMajorCooldownInfo }> = [
    ...ownerCDs.map((cd) => ({ displayName: cd.spellName, cd })),
    ...teammateCDs.flatMap(({ cds, playerLabel }) =>
      cds.map((cd) => ({
        displayName: playerLabel ? `${playerLabel}:${cd.spellName}` : cd.spellName,
        cd,
      })),
    ),
  ];
  for (const { displayName, cd } of allFriendlyCDs) {
    const priorCasts = cd.casts.filter((c) => c.timeSeconds < timeSeconds - 0.5);
    if (priorCasts.length === 0) {
      if (timeSeconds > 5) readyNames.push(displayName);
      continue;
    }
    const charges = cd.maxChargesDetected > 1 ? cd.maxChargesDetected : 1;
    const relevantCasts = priorCasts.slice(-charges);
    const earliestSlotReady = relevantCasts[0].timeSeconds + cd.cooldownSeconds;
    if (earliestSlotReady <= timeSeconds + 0.5) readyNames.push(displayName);
  }
  return readyNames;
}

/**
 * Returns attributed display names for all CDs currently on cooldown.
 * Mirrors computeReadyNames but returns on-CD entries. Used by the resourceSnapshot
 * closure in buildMatchTimeline to track prevOnCDNamesState for B35 delta suppression.
 */
export function computeOnCDDisplayNames(
  timeSeconds: number,
  ownerCDs: IMajorCooldownInfo[],
  teammateCDs: Array<{ cds: IMajorCooldownInfo[]; playerLabel?: string }>,
): string[] {
  const onCDNames: string[] = [];
  const allFriendlyCDs: Array<{ displayName: string; cd: IMajorCooldownInfo }> = [
    ...ownerCDs.map((cd) => ({ displayName: cd.spellName, cd })),
    ...teammateCDs.flatMap(({ cds, playerLabel }) =>
      cds.map((cd) => ({
        displayName: playerLabel ? `${playerLabel}:${cd.spellName}` : cd.spellName,
        cd,
      })),
    ),
  ];
  for (const { displayName, cd } of allFriendlyCDs) {
    const priorCasts = cd.casts.filter((c) => c.timeSeconds < timeSeconds - 0.5);
    if (priorCasts.length === 0) continue;
    const charges = cd.maxChargesDetected > 1 ? cd.maxChargesDetected : 1;
    const relevantCasts = priorCasts.slice(-charges);
    const earliestSlotReady = relevantCasts[0].timeSeconds + cd.cooldownSeconds;
    if (earliestSlotReady > timeSeconds + 0.5) onCDNames.push(displayName);
  }
  return onCDNames;
}

export interface ResourceSnapshotParams {
  timeSeconds: number;
  ownerCDs: IMajorCooldownInfo[];
  ownerName: string;
  ownerSpec: string;
  /** True when the log owner is a healer spec — used by buildJsonSituationSnapshot to derive healer_free. */
  isOwnerHealer?: boolean;
  teammateCDs: Array<{ player: ICombatUnit; spec: string; cds: IMajorCooldownInfo[] }>;
  ccTrinketSummaries: IPlayerCCTrinketSummary[];
  enemyCDTimeline: IEnemyCDTimeline;
  playerIdMap?: Map<string, number>;
  /**
   * Ready CD names from the previous snapshot (attributed: "SpellName" for owner, "pid:SpellName" for
   * teammates). When provided, the [RES] line emits a delta form (rdy:Δ+Added,-Removed).
   */
  prevReadyNames?: string[];
  /**
   * On-CD spell display names from the previous snapshot. When provided, [RES] only shows cd: entries
   * for CDs that are NEWLY on cooldown (not present in prevOnCDNames). B35: reduces token bloat.
   */
  prevOnCDNames?: string[];
}

export function buildResourceSnapshot({
  timeSeconds,
  ownerCDs,
  ownerName,
  ownerSpec: _ownerSpec,
  teammateCDs,
  ccTrinketSummaries,
  enemyCDTimeline,
  playerIdMap,
  prevReadyNames,
  prevOnCDNames,
}: ResourceSnapshotParams): string {
  function pid(name: string): string {
    if (!playerIdMap) return name;
    const id = playerIdMap.get(name);
    return id !== undefined ? String(id) : name;
  }

  // ── rdy / cd — B34: attribute teammate CDs with player pid prefix ──────────
  // Owner CDs: plain "SpellName"; teammate CDs: "pid:SpellName"
  const readyNames = computeReadyNames(
    timeSeconds,
    ownerCDs,
    teammateCDs.map(({ player, cds }) => ({ cds, playerLabel: pid(player.name) })),
  );

  // Build on-CD display list with player attribution (B34) and delta filtering (B35).
  const onCDParts: string[] = [];
  const prevOnCDSet = prevOnCDNames !== undefined ? new Set(prevOnCDNames) : null;

  const allFriendlyCDs: Array<{ displayName: string; cd: IMajorCooldownInfo }> = [
    ...ownerCDs.map((cd) => ({ displayName: cd.spellName, cd })),
    ...teammateCDs.flatMap(({ player, cds }) =>
      cds.map((cd) => ({ displayName: `${pid(player.name)}:${cd.spellName}`, cd })),
    ),
  ];

  const currentOnCDNames: string[] = [];
  for (const { displayName, cd } of allFriendlyCDs) {
    const priorCasts = cd.casts.filter((c) => c.timeSeconds < timeSeconds - 0.5);
    if (priorCasts.length === 0) continue;
    const charges = cd.maxChargesDetected > 1 ? cd.maxChargesDetected : 1;
    const relevantCasts = priorCasts.slice(-charges);
    const earliestSlotReady = relevantCasts[0].timeSeconds + cd.cooldownSeconds;
    if (earliestSlotReady > timeSeconds + 0.5) {
      const remaining = Math.round(earliestSlotReady - timeSeconds);
      currentOnCDNames.push(displayName);
      // B35: in delta mode only show CDs that newly went on cooldown (not in previous snapshot).
      if (prevOnCDSet === null || !prevOnCDSet.has(displayName)) {
        onCDParts.push(`${displayName}(${remaining}s)`);
      }
    }
  }

  // ── rdy: — full form first time, delta form on subsequent calls ─────────────
  let rdyPart: string;
  if (prevReadyNames !== undefined) {
    const prevSet = new Set(prevReadyNames);
    const currentSet = new Set(readyNames);
    const added = readyNames.filter((n) => !prevSet.has(n));
    const removed = prevReadyNames.filter((n) => !currentSet.has(n));
    const parts: string[] = [];
    if (added.length > 0) parts.push(`+${added.join(',')}`);
    if (removed.length > 0) parts.push(`-${removed.join(',')}`);
    rdyPart = parts.length > 0 ? `rdy:Δ${parts.join('')}` : 'rdy:Δ';
  } else {
    rdyPart = `rdy:${readyNames.length > 0 ? readyNames.join(',') : '—'}`;
  }

  let line = `      [RES] ${rdyPart}  cd:${onCDParts.length > 0 ? onCDParts.join(',') : '—'}`;

  // ── enemy: (omit when empty) ───────────────────────────────────────────────
  const enemyActiveParts: string[] = [];
  for (const player of enemyCDTimeline.players) {
    for (const cd of player.offensiveCDs) {
      const agoSeconds = timeSeconds - cd.castTimeSeconds;
      if (agoSeconds >= 0 && agoSeconds <= 30) {
        enemyActiveParts.push(`${cd.spellName}/${player.specName}(${Math.round(agoSeconds)}s)`);
      }
    }
  }
  if (enemyActiveParts.length > 0) {
    line += `  enemy:${enemyActiveParts.join(',')}`;
  }

  // ── cc: (omit when empty) ──────────────────────────────────────────────────
  const summaryByName = new Map(ccTrinketSummaries.map((s) => [s.playerName, s]));

  const allFriendlyPlayers: Array<{ name: string }> = [
    { name: ownerName },
    ...teammateCDs.map(({ player }) => ({ name: player.name })),
  ];

  const ccParts: string[] = [];
  for (const { name } of allFriendlyPlayers) {
    const summary = summaryByName.get(name);

    // Hard CC (existing)
    const activeCC = summary?.ccInstances.find(
      (cc) => cc.atSeconds <= timeSeconds && timeSeconds < cc.atSeconds + cc.durationSeconds,
    );
    if (activeCC) {
      const remaining = Math.round(activeCC.atSeconds + activeCC.durationSeconds - timeSeconds);
      const isStun = activeCC.drInfo?.category === 'Stun';
      const stunTag = isStun ? '[stun]' : '';
      const trinketUsedNow = summary?.trinketUseTimes.some((t) => Math.abs(t - timeSeconds) <= 1) ?? false;
      const trinketTag = isStun && trinketUsedNow ? '[trinketed]' : '';
      ccParts.push(`${pid(name)}/${activeCC.spellName}-${remaining}s${stunTag}${trinketTag}`);
    }

    // Root
    const activeRoot = summary?.rootInstances?.find(
      (r) => r.atSeconds <= timeSeconds && timeSeconds < r.atSeconds + r.durationSeconds,
    );
    if (activeRoot) {
      const remaining = Math.round(activeRoot.atSeconds + activeRoot.durationSeconds - timeSeconds);
      ccParts.push(`${pid(name)}/${activeRoot.spellName}-${remaining}s[root]`);
    }

    // Disarm
    const activeDisarm = summary?.disarmInstances?.find(
      (d) => d.atSeconds <= timeSeconds && timeSeconds < d.atSeconds + d.durationSeconds,
    );
    if (activeDisarm) {
      const remaining = Math.round(activeDisarm.atSeconds + activeDisarm.durationSeconds - timeSeconds);
      ccParts.push(`${pid(name)}/${activeDisarm.spellName}-${remaining}s[disarm]`);
    }

    // Kick lockout
    const activeKick = summary?.interruptInstances?.find(
      (k) => k.atSeconds <= timeSeconds && timeSeconds < k.atSeconds + k.lockoutDurationSeconds,
    );
    if (activeKick) {
      const remaining = Math.round(activeKick.atSeconds + activeKick.lockoutDurationSeconds - timeSeconds);
      ccParts.push(`${pid(name)}/${activeKick.kickSpellName}-${remaining}s[kick]`);
    }
  }

  if (ccParts.length > 0) {
    line += `  cc:${ccParts.join(',')}`;
  }

  // Suppress empty lines that contribute no information
  if (readyNames.length === 0 && onCDParts.length === 0 && enemyActiveParts.length === 0 && ccParts.length === 0) {
    return '';
  }

  return line;
}

/**
 * JSON-format alternative to buildResourceSnapshot().
 * Emits a compact [SIT] JSON object with derived boolean fields:
 *   enemy_burst_active — true when any enemy offensive CD was cast in the last 30s
 *   healer_free        — true when the team healer has no active CC
 *
 * Used for A/B testing (F73) to evaluate whether structured JSON gives
 * Claude more reliable counterfactual reasoning than the [RES] text format.
 */
export function buildJsonSituationSnapshot({
  timeSeconds,
  ownerCDs,
  ownerName,
  isOwnerHealer = false,
  teammateCDs,
  ccTrinketSummaries,
  enemyCDTimeline,
  playerIdMap,
}: ResourceSnapshotParams): string {
  function pid(name: string): string {
    if (!playerIdMap) return name;
    const id = playerIdMap.get(name);
    return id !== undefined ? String(id) : name;
  }

  // ── rdy / cd ────────────────────────────────────────────────────────────
  const rdy: string[] = [];
  const cd: Array<{ name: string; remaining: number }> = [];

  const allFriendlyCDs: Array<{ spellName: string; info: IMajorCooldownInfo }> = [
    ...ownerCDs.map((c) => ({ spellName: c.spellName, info: c })),
    ...teammateCDs.flatMap(({ cds }) => cds.map((c) => ({ spellName: c.spellName, info: c }))),
  ];

  for (const { spellName, info } of allFriendlyCDs) {
    const priorCasts = info.casts.filter((c) => c.timeSeconds < timeSeconds - 0.5);
    if (priorCasts.length === 0) {
      if (timeSeconds > 5) rdy.push(spellName);
      continue;
    }
    const charges = info.maxChargesDetected > 1 ? info.maxChargesDetected : 1;
    const relevantCasts = priorCasts.slice(-charges);
    const earliestSlotReady = relevantCasts[0].timeSeconds + info.cooldownSeconds;
    if (earliestSlotReady <= timeSeconds + 0.5) {
      rdy.push(spellName);
    } else {
      cd.push({ name: spellName, remaining: Math.round(earliestSlotReady - timeSeconds) });
    }
  }

  // ── enemy CDs ───────────────────────────────────────────────────────────
  const enemyCDs: Array<{ spell: string; spec: string; ago_s: number }> = [];
  for (const player of enemyCDTimeline.players) {
    for (const enemyCd of player.offensiveCDs) {
      const agoSeconds = timeSeconds - enemyCd.castTimeSeconds;
      if (agoSeconds >= 0 && agoSeconds <= 30) {
        enemyCDs.push({ spell: enemyCd.spellName, spec: player.specName, ago_s: Math.round(agoSeconds) });
      }
    }
  }

  // ── healer_free + cc ────────────────────────────────────────────────────
  const summaryByName = new Map(ccTrinketSummaries.map((s) => [s.playerName, s]));
  const allFriendlyPlayers = [{ name: ownerName }, ...teammateCDs.map(({ player }) => ({ name: player.name }))];

  const healerName = isOwnerHealer
    ? ownerName
    : teammateCDs.find(({ player }) => isHealerSpec(player.spec))?.player.name;

  const ccList: Array<{
    player: string;
    spell: string;
    remaining_s: number;
    stun?: true;
    trinketed?: true;
    root?: true;
    disarm?: true;
    kick?: true;
  }> = [];

  for (const { name } of allFriendlyPlayers) {
    const summary = summaryByName.get(name);

    // Hard CC (existing)
    const activeCC = summary?.ccInstances.find(
      (cc) => cc.atSeconds <= timeSeconds && timeSeconds < cc.atSeconds + cc.durationSeconds,
    );
    if (activeCC) {
      const remaining = Math.round(activeCC.atSeconds + activeCC.durationSeconds - timeSeconds);
      const isStun = activeCC.drInfo?.category === 'Stun';
      const trinketUsedNow = summary?.trinketUseTimes.some((t) => Math.abs(t - timeSeconds) <= 1) ?? false;
      const entry: (typeof ccList)[number] = { player: pid(name), spell: activeCC.spellName, remaining_s: remaining };
      if (isStun) entry.stun = true;
      if (isStun && trinketUsedNow) entry.trinketed = true;
      ccList.push(entry);
    }

    // Root
    const activeRoot = summary?.rootInstances?.find(
      (r) => r.atSeconds <= timeSeconds && timeSeconds < r.atSeconds + r.durationSeconds,
    );
    if (activeRoot) {
      const remaining = Math.round(activeRoot.atSeconds + activeRoot.durationSeconds - timeSeconds);
      ccList.push({ player: pid(name), spell: activeRoot.spellName, remaining_s: remaining, root: true });
    }

    // Disarm
    const activeDisarm = summary?.disarmInstances?.find(
      (d) => d.atSeconds <= timeSeconds && timeSeconds < d.atSeconds + d.durationSeconds,
    );
    if (activeDisarm) {
      const remaining = Math.round(activeDisarm.atSeconds + activeDisarm.durationSeconds - timeSeconds);
      ccList.push({ player: pid(name), spell: activeDisarm.spellName, remaining_s: remaining, disarm: true });
    }

    // Kick lockout
    const activeKick = summary?.interruptInstances?.find(
      (k) => k.atSeconds <= timeSeconds && timeSeconds < k.atSeconds + k.lockoutDurationSeconds,
    );
    if (activeKick) {
      const remaining = Math.round(activeKick.atSeconds + activeKick.lockoutDurationSeconds - timeSeconds);
      ccList.push({ player: pid(name), spell: activeKick.kickSpellName, remaining_s: remaining, kick: true });
    }
  }

  const healerSummary = healerName ? summaryByName.get(healerName) : undefined;
  const healerInCC =
    healerSummary?.ccInstances.some(
      (cc) => cc.atSeconds <= timeSeconds && timeSeconds < cc.atSeconds + cc.durationSeconds,
    ) ?? false;

  // ── assemble ─────────────────────────────────────────────────────────────
  const sit: Record<string, unknown> = {
    rdy,
    cd,
    enemy_burst_active: enemyCDs.length > 0,
  };
  if (enemyCDs.length > 0) sit.enemy_cds = enemyCDs;
  sit.healer_free = !healerInCC;
  if (ccList.length > 0) sit.cc = ccList;

  return `      [SIT] ${JSON.stringify(sit)}`;
}
