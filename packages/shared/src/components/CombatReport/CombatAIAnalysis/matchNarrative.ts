import { ICombatUnit } from '@wowarenalogs/parser';

import { fmtTime, IMajorCooldownInfo, specToString } from '../../../utils/cooldowns';
import { IEnemyCDTimeline } from '../../../utils/enemyCDs';
import { lastCastBefore } from './timelineHelpers';

// ──────────────────────────────────────────────────────────────────────────────

/**
 * Builds a brief event-driven Match Flow narrative from burst windows and CD trades.
 * Segments are defined by burst windows (not time slices) so the LLM sees
 * Opening Burst → Post-Trade Window → Final Burst/Phase in causal order.
 *
 * @deprecated Replaced by `buildMatchArc` in production. Retained for test coverage only.
 * @internal Do not use in production prompt builders. Not exported from the public surface.
 */
export function buildMatchFlow(
  enemyCDTimeline: IEnemyCDTimeline,
  ownerCooldowns: IMajorCooldownInfo[],
  allTeamCooldownsWithPlayer: Array<{ player: ICombatUnit; cd: IMajorCooldownInfo }>,
  friendlyDeaths: Array<{ spec: string; atSeconds: number }>,
  durationSeconds: number,
): string[] {
  const lines: string[] = [];
  const bursts = [...enemyCDTimeline.alignedBurstWindows].sort((a, b) => a.fromSeconds - b.fromSeconds);
  const firstDeath = friendlyDeaths[0];

  lines.push('MATCH FLOW:');
  lines.push('');

  if (bursts.length === 0) {
    lines.push('  No coordinated enemy bursts detected — match resolved through sustained pressure.');
    if (firstDeath) lines.push(`  → ${firstDeath.spec} died at ${fmtTime(firstDeath.atSeconds)}.`);
    lines.push('');
    return lines;
  }

  const firstBurst = bursts[0];

  // Segment 1: Opening burst
  lines.push(`  Opening Burst (${fmtTime(firstBurst.fromSeconds)}–${fmtTime(firstBurst.toSeconds)}):`);
  const burstCDNames = firstBurst.activeCDs.map((c) => c.spellName).join(' + ');
  lines.push(`    - Enemy aligned burst (${firstBurst.dangerLabel} — ${burstCDNames})`);

  // Defensive CDs traded into this burst (owner + teammates)
  const tradedDefItems: Array<{ spec: string; spellName: string; cooldownSeconds: number }> = [];
  for (const { player, cd } of allTeamCooldownsWithPlayer) {
    if (cd.tag !== 'Defensive') continue;
    const traded = cd.casts.find(
      (c) => c.timeSeconds >= firstBurst.fromSeconds - 5 && c.timeSeconds <= firstBurst.toSeconds + 5,
    );
    if (traded) {
      tradedDefItems.push({
        spec: specToString(player.spec),
        spellName: cd.spellName,
        cooldownSeconds: cd.cooldownSeconds,
      });
    }
  }

  if (tradedDefItems.length > 0) {
    const formatted = tradedDefItems.map((item) => `${item.spec}'s ${item.spellName}`).join(' + ');
    lines.push(`    - Team responded: ${formatted} committed`);
  } else {
    lines.push(`    - No major defensive CDs traded into this burst`);
  }

  // Check if match duration is shorter than the shortest traded team defensive CD's cooldown
  if (tradedDefItems.length > 0) {
    const minCooldown = Math.min(...tradedDefItems.map((item) => item.cooldownSeconds));
    if (durationSeconds < minCooldown) {
      lines.push(
        `    - Match duration (${fmtTime(durationSeconds)}) did not allow recovery of these major cooldowns after this trade`,
      );
      lines.push(`    - This match contained only one full cooldown cycle for the committed defensive abilities`);
    }
  }
  lines.push('');

  // Segment 2: Post-trade window (between first and second burst, or first burst and death)
  const secondBurst = bursts[1];
  const midEnd = secondBurst ? secondBurst.fromSeconds : firstDeath ? firstDeath.atSeconds - 5 : durationSeconds - 5;
  if (midEnd - firstBurst.toSeconds > 5) {
    lines.push(`  Post-Trade Window (${fmtTime(firstBurst.toSeconds)}–${fmtTime(midEnd)}):`);
    const ownerDefsAvailableInWindow = ownerCooldowns.filter((cd) => {
      if (cd.tag !== 'Defensive') return false;
      const lastCast = lastCastBefore(cd, firstBurst.toSeconds);
      if (!lastCast) return true; // never-used or not yet cast — still available
      return lastCast.timeSeconds + cd.cooldownSeconds <= midEnd;
    });
    if (ownerDefsAvailableInWindow.length === 0) {
      lines.push(`    - No major defensive CDs available on owner during this window`);
    }
    if (!secondBurst) {
      lines.push(`    - No coordinated enemy burst — both sides recovering CDs`);
    }
    lines.push('');
  }

  // Segment 3: Final burst or final phase
  const finalBurst = bursts.length >= 2 ? bursts[bursts.length - 1] : undefined;
  const finalEndTime = firstDeath?.atSeconds ?? durationSeconds;

  if (finalBurst) {
    lines.push(`  Final Burst (${fmtTime(finalBurst.fromSeconds)}–${fmtTime(finalEndTime)}):`);
    const finalCDNames = finalBurst.activeCDs.map((c) => c.spellName).join(' + ');
    lines.push(`    - Enemy burst (${finalBurst.dangerLabel} — ${finalCDNames})`);
  } else {
    lines.push(`  Final Phase (${fmtTime(firstBurst.toSeconds)}–${fmtTime(finalEndTime)}):`);
  }

  // Owner defensive CD state at death / match end
  const spentAtEnd = ownerCooldowns
    .filter((cd) => cd.tag === 'Defensive')
    .filter((cd) => {
      const lastCast = lastCastBefore(cd, finalEndTime);
      if (!lastCast) return false;
      return lastCast.timeSeconds + cd.cooldownSeconds > finalEndTime;
    })
    .map((cd) => cd.spellName);
  if (spentAtEnd.length > 0) {
    lines.push(`    - ${firstDeath ? 'At death' : 'At match end'}: ${spentAtEnd.join(', ')} on cooldown`);
  }
  if (firstDeath) {
    lines.push(`    - → ${firstDeath.spec} died at ${fmtTime(firstDeath.atSeconds)}`);
  } else {
    lines.push(`    - → No friendly deaths — match ended in a win`);
  }
  lines.push('');

  return lines;
}

// ──────────────────────────────────────────────────────────────────────────────

/**
 * Builds a compact 3-sentence match arc (Early / Mid / Late) before the CRITICAL MOMENTS
 * section, so the LLM understands match flow before evaluating individual moments.
 *
 * Phase boundaries (per AI_CONTEXT_REFACTOR.md):
 *   Early: match start → first major defensive used by either team
 *   Mid:   first defensive → first friendly death OR first burst window resolved
 *   Late:  that boundary → match end
 *
 * Edge cases:
 *   - Match < 90s: collapse to two phases (Pressure / Death or Resolution)
 *   - 3v3 + duration > 180s + no deaths: Late = "dampening reached"
 *   - Win with no friendly deaths: three phases still emitted; Late describes kill finish
 */
export function buildMatchArc(
  enemyCDTimeline: IEnemyCDTimeline,
  allTeamCooldownsWithPlayer: Array<{ player: ICombatUnit; cd: IMajorCooldownInfo }>,
  friendlyDeaths: Array<{ spec: string; atSeconds: number }>,
  durationSeconds: number,
  bracket: string,
): string[] {
  const lines: string[] = [];
  lines.push('MATCH ARC:');

  // Edge case: very short match — collapse to two phases
  if (durationSeconds < 90) {
    const mid = Math.round(durationSeconds / 2);
    lines.push(`  Pressure (0:00–${fmtTime(mid)}): Early pressure established — no recovery window.`);
    if (friendlyDeaths.length > 0) {
      const d = friendlyDeaths[0];
      lines.push(
        `  Death (${fmtTime(mid)}–${fmtTime(durationSeconds)}): ${d.spec} died at ${fmtTime(d.atSeconds)} — speed kill.`,
      );
    } else {
      lines.push(
        `  Resolution (${fmtTime(mid)}–${fmtTime(durationSeconds)}): Match resolved quickly — no friendly deaths.`,
      );
    }
    return lines;
  }

  const burstsSorted = [...enemyCDTimeline.alignedBurstWindows].sort((a, b) => a.fromSeconds - b.fromSeconds);
  const firstBurst = burstsSorted[0] ?? null;
  const firstDeath = friendlyDeaths[0];

  // Find first defensive cast from either team
  let firstDefensiveSeconds = Infinity;
  let firstDefensiveName = '';
  let firstDefensiveSpec = '';
  for (const { player, cd } of allTeamCooldownsWithPlayer) {
    if (cd.tag !== 'Defensive' || cd.neverUsed || cd.casts.length === 0) continue;
    const cast = cd.casts[0];
    if (cast.timeSeconds < firstDefensiveSeconds) {
      firstDefensiveSeconds = cast.timeSeconds;
      firstDefensiveName = cd.spellName;
      firstDefensiveSpec = specToString(player.spec);
    }
  }

  // Phase boundaries
  const earlyEnd = firstDefensiveSeconds < Infinity ? firstDefensiveSeconds : durationSeconds / 2;
  const firstBurstResolved = firstBurst !== null ? firstBurst.toSeconds : Infinity;
  const firstFriendlyDeathSeconds = firstDeath?.atSeconds ?? Infinity;
  const midEnd = Math.min(firstFriendlyDeathSeconds, firstBurstResolved);
  // Clamp lateStart >= earlyEnd to prevent inverted phase ranges (e.g. "Mid (1:11–0:53)")
  // when a death/burst occurs before the first defensive is spent.
  const rawLateStart = midEnd < Infinity ? midEnd : earlyEnd + (durationSeconds - earlyEnd) / 2;
  const lateStart = Math.max(earlyEnd, rawLateStart);

  // Early phase prose
  const earlyBursts = burstsSorted.filter((b) => b.fromSeconds < earlyEnd);
  let earlyProse: string;
  if (earlyBursts.length > 0) {
    const burst = earlyBursts[0];
    const cdNames = burst.activeCDs.map((c) => c.spellName).join(' + ');
    earlyProse = `Enemy aligned burst established pressure (${burst.dangerLabel} — ${cdNames}); no major defensives spent.`;
  } else if (firstDefensiveSeconds === Infinity) {
    earlyProse = 'No coordinated burst; match opened with sustained pressure and no defensive CDs committed.';
  } else {
    earlyProse = 'No coordinated enemy burst in opening phase; sustained/DoT pressure building.';
  }
  lines.push(`  Early (0:00–${fmtTime(earlyEnd)}): ${earlyProse}`);

  // Mid phase prose — skip if zero-duration (earlyEnd === lateStart, e.g. first death/burst before first defensive)
  if (earlyEnd < lateStart) {
    let midProse: string;
    if (firstDefensiveSeconds < Infinity) {
      const midBursts = burstsSorted.filter((b) => b.fromSeconds >= earlyEnd && b.fromSeconds < lateStart);
      const burstNote =
        midBursts.length > 0
          ? ` in response to ${midBursts[0].dangerLabel} burst at ${fmtTime(midBursts[0].fromSeconds)}`
          : '';
      midProse = `${firstDefensiveSpec}'s ${firstDefensiveName} committed${burstNote} — limited major CD coverage remaining.`;
    } else {
      midProse = 'No major defensive CDs committed; match progressed through sustained pressure.';
    }
    lines.push(`  Mid (${fmtTime(earlyEnd)}–${fmtTime(lateStart)}): ${midProse}`);
  }

  // Late phase prose
  let lateProse: string;
  const lateBursts = burstsSorted.filter((b) => b.fromSeconds >= lateStart);
  const lateBurstNote =
    lateBursts.length > 0 ? `Second burst (${lateBursts[0].dangerLabel}) aligned with` : 'Pressure continued with';
  if (firstDeath) {
    lateProse = `${lateBurstNote} limited defensive options → ${firstDeath.spec} died at ${fmtTime(firstDeath.atSeconds)}.`;
  } else if (bracket === '3v3' && durationSeconds > 180) {
    lateProse = 'Dampening reached — healing reduced; match extended to kill window.';
  } else {
    lateProse = 'Match concluded — no friendly deaths; pressure neutralized.';
  }
  lines.push(`  Late (${fmtTime(lateStart)}–${fmtTime(durationSeconds)}): ${lateProse}`);

  return lines;
}
