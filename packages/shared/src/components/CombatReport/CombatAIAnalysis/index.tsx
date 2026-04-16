import { CombatUnitReaction, CombatUnitType, ICombatUnit } from '@wowarenalogs/parser';
import { useEffect, useState } from 'react';

import { analyzePlayerCCAndTrinket, formatCCTrinketForContext } from '../../../utils/ccTrinketAnalysis';
import {
  annotateDefensiveTimings,
  computePressureWindows,
  detectOverlappedDefensives,
  detectPanicDefensives,
  extractMajorCooldowns,
  fmtTime,
  formatOverlappedDefensivesForContext,
  formatPanicDefensivesForContext,
  IEnemyCDTimelineForTiming,
  isHealerSpec,
  specToString,
} from '../../../utils/cooldowns';
import { formatDampeningForContext } from '../../../utils/dampening';
import { canOffensivePurge, formatDispelContextForAI, reconstructDispelSummary } from '../../../utils/dispelAnalysis';
import { analyzeOutgoingCCChains, formatOutgoingCCChainsForContext } from '../../../utils/drAnalysis';
import { formatEnemyCDTimelineForContext, reconstructEnemyCDTimeline } from '../../../utils/enemyCDs';
import { analyzeHealerExposureAtBurst, formatHealerExposureForContext } from '../../../utils/healerExposureAnalysis';
import { detectHealingGaps, formatHealingGapsForContext } from '../../../utils/healingGaps';
import {
  analyzeKillWindowTargetSelection,
  formatKillWindowTargetSelectionForContext,
} from '../../../utils/killWindowTargetSelection';
import { computeMatchArchetype, formatMatchArchetypeForContext } from '../../../utils/matchArchetype';
import { computeOffensiveWindows, formatOffensiveWindowsForContext } from '../../../utils/offensiveWindows';
import { useCombatReportContext } from '../CombatReportContext';
import { buildMatchFlow, identifyCriticalMoments } from './utils';

// re-export pure helpers so existing imports from this file continue to work
export type { CriticalMoment, MomentRole } from './utils';
export {
  buildDeathRootCauseTrace,
  buildKillMomentFields,
  buildMatchFlow,
  findContributingDeath,
  getEnemyStateAtTime,
  getOwnerCDsAvailable,
  identifyCriticalMoments,
} from './utils';

// ──────────────────────────────────────────────────────────────────────────────

export function buildMatchContext(
  combat: NonNullable<ReturnType<typeof useCombatReportContext>['combat']>,
  friends: ReturnType<typeof useCombatReportContext>['friends'],
  enemies: ReturnType<typeof useCombatReportContext>['enemies'],
): string {
  const durationSeconds = (combat.endTime - combat.startTime) / 1000;

  // Find the log owner (the player who recorded the log)
  const owner = friends.find((p) => p.id === combat.playerId) ?? friends[0];
  if (!owner) return '';

  const ownerSpec = specToString(owner.spec);
  const healer = isHealerSpec(owner.spec);

  const myTeam = friends.map((p) => specToString(p.spec)).join(', ');
  const enemyTeam = enemies.map((p) => specToString(p.spec)).join(', ');

  // Match result
  const combatAny = combat as unknown as Record<string, unknown>;
  const playerWon =
    typeof combatAny['winningTeamId'] === 'string' ? combatAny['winningTeamId'] === combat.playerTeamId : null;
  const resultStr = playerWon === true ? 'Win' : playerWon === false ? 'Loss' : 'Unknown';

  // Deaths
  const friendlyDeaths = friends
    .filter((p) => p.deathRecords.length > 0)
    .flatMap((p) =>
      p.deathRecords.map((d) => ({
        spec: specToString(p.spec),
        name: p.name,
        atSeconds: (d.timestamp - combat.startTime) / 1000,
      })),
    )
    .sort((a, b) => a.atSeconds - b.atSeconds);

  const enemyDeaths = enemies
    .filter((p) => p.deathRecords.length > 0)
    .flatMap((p) =>
      p.deathRecords.map((d) => ({
        spec: specToString(p.spec),
        name: p.name,
        atSeconds: (d.timestamp - combat.startTime) / 1000,
      })),
    )
    .sort((a, b) => a.atSeconds - b.atSeconds);

  // Compute all feature data upfront
  const cooldowns = extractMajorCooldowns(owner, combat);
  const teammateCooldowns = friends
    .filter((p) => p.id !== owner.id)
    .map((p) => ({ player: p, cds: extractMajorCooldowns(p, combat) }));
  const enemyCDTimeline = reconstructEnemyCDTimeline(enemies, combat, owner, friends);
  // Annotate defensive timing labels now that we have the enemy CD timeline
  annotateDefensiveTimings(cooldowns, owner, combat, enemyCDTimeline as IEnemyCDTimelineForTiming);
  teammateCooldowns.forEach(({ player, cds }) =>
    annotateDefensiveTimings(cds, player, combat, enemyCDTimeline as IEnemyCDTimelineForTiming),
  );
  const pressureWindows = computePressureWindows(friends, combat);
  const overlappedDefensives = detectOverlappedDefensives(friends, combat);
  const panicDefensives = detectPanicDefensives(friends, enemies, combat);
  const healingGaps = healer ? detectHealingGaps(owner, friends, enemies, combat) : [];
  const offensiveWindows = computeOffensiveWindows(enemies, friends, combat);
  const killWindowTargetEvals = analyzeKillWindowTargetSelection(offensiveWindows, enemies as ICombatUnit[], combat);
  const dispelSummary = reconstructDispelSummary(friends, enemies, combat);
  const ccTrinketSummaries = friends.map((p) => analyzePlayerCCAndTrinket(p, enemies, combat));
  const outgoingCCChains = analyzeOutgoingCCChains(friends as ICombatUnit[], enemies as ICombatUnit[], combat);
  const healerUnit = friends.find((p) => isHealerSpec(p.spec)) as ICombatUnit | undefined;
  const healerCCSummary = healerUnit ? ccTrinketSummaries.find((s) => s.playerName === healerUnit.name) : undefined;
  const healerExposures =
    healerUnit && healerCCSummary
      ? analyzeHealerExposureAtBurst(
          enemyCDTimeline.alignedBurstWindows,
          enemies as ICombatUnit[],
          healerUnit,
          healerCCSummary,
          ccTrinketSummaries,
          combat.startInfo.zoneId,
          combat.startTime,
        )
      : [];

  const matchArchetype = computeMatchArchetype(
    friends as ICombatUnit[],
    enemies as ICombatUnit[],
    combat,
    ccTrinketSummaries,
    enemyCDTimeline.alignedBurstWindows,
    healerExposures,
  );

  // Identify top critical moments; constrainedTrade flag reused for CC section framing
  const { moments: criticalMoments, constrainedTrade: hasConstrainedTrade } = identifyCriticalMoments(
    healer,
    cooldowns,
    enemyCDTimeline,
    friendlyDeaths,
    healingGaps,
    panicDefensives,
    overlappedDefensives,
    ccTrinketSummaries,
    matchArchetype.peakDamagePressure5s,
    durationSeconds,
    friends as ICombatUnit[],
    combat.startTime,
  );

  // Purge responsibility attribution
  const ownerCanPurge = canOffensivePurge(owner as ICombatUnit);
  const teamPurgers = friends
    .filter((p) => p.id !== owner.id && canOffensivePurge(p as ICombatUnit))
    .map((p) => specToString(p.spec));

  const lines: string[] = [];

  // ── MATCH SUMMARY ──────────────────────────────────────────────────────────
  lines.push('ARENA MATCH — DECISION ANALYSIS REQUEST');
  lines.push('');
  lines.push('MATCH SUMMARY');
  lines.push(
    `  Spec: ${ownerSpec}${healer ? ' (Healer)' : ''}  |  Bracket: ${combat.startInfo.bracket}  |  Result: ${resultStr}  |  Duration: ${fmtTime(durationSeconds)}`,
  );
  lines.push(`  My team: ${myTeam}`);
  lines.push(`  Enemy team: ${enemyTeam}`);
  const deathParts = [
    ...friendlyDeaths.map((d) => `${d.spec} (my team, ${fmtTime(d.atSeconds)})`),
    ...enemyDeaths.map((d) => `${d.spec} (enemy, ${fmtTime(d.atSeconds)})`),
  ];
  lines.push(`  Deaths: ${deathParts.length > 0 ? deathParts.join(', ') : 'None'}`);
  lines.push('');
  formatMatchArchetypeForContext(matchArchetype).forEach((l) => lines.push(l));

  // ── MATCH FLOW ─────────────────────────────────────────────────────────────
  lines.push('');
  const allTeamCooldownsWithPlayer = [
    ...cooldowns.map((cd) => ({ player: owner as ICombatUnit, cd })),
    ...teammateCooldowns.flatMap(({ player, cds }) => cds.map((cd) => ({ player: player as ICombatUnit, cd }))),
  ];
  buildMatchFlow(enemyCDTimeline, cooldowns, allTeamCooldownsWithPlayer, friendlyDeaths, durationSeconds).forEach((l) =>
    lines.push(l),
  );

  // ── CRITICAL MOMENTS ───────────────────────────────────────────────────────
  lines.push('CRITICAL MOMENTS (interpret as a sequence where earlier events constrain later options):');
  lines.push('');

  if (criticalMoments.length === 0) {
    lines.push('  No critical moments identified from available data.');
  } else {
    criticalMoments.forEach((m, i) => {
      const impactStr = m.roleLabel === 'Constraint' ? 'Context-setting — not a mistake' : m.impactLabel;
      lines.push(`--- MOMENT ${i + 1} (${m.roleLabel}) (impact: ${impactStr}) ---`);
      lines.push(`${fmtTime(m.timeSeconds)} — ${m.title}`);
      lines.push(`  Enemy state: ${m.enemyState}`);

      if (m.roleLabel === 'Constraint') {
        lines.push(
          `  NOTE: This moment is not a mistake. It defines the resource constraints for the rest of the match.`,
        );
        lines.push(`  What happened:`);
        lines.push(`  What happened: ${m.whatHappened}`);
        if (m.implication && m.implication.length > 0) {
          lines.push(`  Implication:`);
          m.implication.forEach((l) => lines.push(`    - ${l}`));
        }
      } else {
        if (m.roleLabel !== 'Kill') {
          lines.push(`  Friendly state: ${m.friendlyState}`);
          if (!m.isDeath && m.contributingDeathSpec !== undefined && m.contributingDeathAtSeconds !== undefined) {
            const deltaSeconds = Math.round(m.contributingDeathAtSeconds - m.timeSeconds);
            lines.push(
              `  ⚠ Contributing factor: ${m.contributingDeathSpec} died ${deltaSeconds}s later at ${fmtTime(m.contributingDeathAtSeconds)}`,
            );
          }
        }
        lines.push(`  What happened: ${m.whatHappened}`);
        if (m.rootCauseTrace && m.rootCauseTrace.length > 0) {
          lines.push(`  Root cause trace (why the death happened — trace back from here):`);
          m.rootCauseTrace.forEach((t) => lines.push(`    - ${t}`));
        }
      }

      // Kill moments: use three-tier options; others: flat list or legacy availableOptions
      if (m.roleLabel === 'Kill' && m.tieredOptions) {
        const { realistic, limited, unavailable } = m.tieredOptions;
        if (realistic.length > 0 || limited.length > 0 || unavailable.length > 0) {
          lines.push(`  Possible responses (given constraints from earlier moments):`);
          if (realistic.length > 0) {
            lines.push(`    Realistic options:`);
            realistic.forEach((o) => lines.push(`      - ${o}`));
          }
          if (limited.length > 0) {
            lines.push(`    Limited options:`);
            limited.forEach((o) => lines.push(`      - ${o}`));
          }
          if (unavailable.length > 0) {
            lines.push(`    Unavailable:`);
            unavailable.forEach((o) => lines.push(`      - ${o}`));
          }
        }
      } else if (m.mechanicalAvailability.length > 0 || m.interpretation.length > 0) {
        lines.push(`  Possible responses at this moment (given constraints from earlier moments):`);
        if (m.mechanicalAvailability.length > 0) {
          lines.push(`    Mechanical availability:`);
          m.mechanicalAvailability.forEach((a) => lines.push(`      - ${a}`));
        }
        if (m.interpretation.length > 0) {
          lines.push(`    Interpretation:`);
          m.interpretation.forEach((interp) => lines.push(`      - ${interp}`));
        }
      } else if (m.roleLabel !== 'Constraint' && m.roleLabel !== 'Kill') {
        lines.push(`  Available options: ${m.availableOptions}`);
      }

      if (m.finalAssessment) {
        lines.push(`  Structural context:`);
        lines.push(`    - ${m.finalAssessment.macroOutcome}`);
        if (m.finalAssessment.microMistakes.length > 0) {
          lines.push(`    Micro-level opportunities:`);
          m.finalAssessment.microMistakes.forEach((mm) => lines.push(`      - ${mm}`));
        }
      }

      lines.push(`  Uncertainty: ${m.uncertainty}`);
      lines.push('');
    });
  }

  // ── SUPPORTING DATA ────────────────────────────────────────────────────────
  lines.push('SUPPORTING DATA (for reference when evaluating moments above):');

  // Purge responsibility — explicit attribution so Claude doesn't blame wrong player
  lines.push('');
  lines.push('PURGE RESPONSIBILITY:');
  if (ownerCanPurge) {
    lines.push(`  Log owner (${ownerSpec}): CAN offensive purge`);
  } else {
    lines.push(`  Log owner (${ownerSpec}): CANNOT offensive purge — do not attribute missed purges to the log owner`);
  }
  lines.push(
    teamPurgers.length > 0
      ? `  Team offensive purgers: ${teamPurgers.join(', ')}`
      : '  Team offensive purgers: None (no teammate has an offensive purge ability)',
  );

  // Owner cooldowns
  lines.push('');
  lines.push(`COOLDOWN USAGE — LOG OWNER (${ownerSpec}) — major CDs ≥30s:`);
  if (cooldowns.length === 0) {
    lines.push('  No major cooldown data found for this spec.');
  } else {
    cooldowns.forEach((cd) => {
      lines.push('');
      lines.push(`  ${cd.spellName} [${cd.tag}, ${cd.cooldownSeconds}s CD]:`);
      if (cd.neverUsed) {
        lines.push(`    STATUS: NEVER USED`);
      } else {
        cd.casts.forEach((c) => {
          const timing =
            c.timingLabel && c.timingLabel !== 'Unknown'
              ? ` [${c.timingLabel.toUpperCase()}${c.timingContext ? ` — ${c.timingContext}` : ''}]`
              : '';
          lines.push(`    Cast at: ${fmtTime(c.timeSeconds)}${timing}`);
        });
      }
      if (cd.availableWindows.length > 0) {
        lines.push(`    Idle windows:`);
        cd.availableWindows.forEach((w) => {
          const overlapping = pressureWindows.filter((p) => p.fromSeconds < w.toSeconds && p.toSeconds > w.fromSeconds);
          const pressureNote =
            overlapping.length > 0
              ? ` — pressure during idle: ${overlapping.map((p) => `${fmtTime(p.fromSeconds)} (${(p.totalDamage / 1_000_000).toFixed(2)}M on ${p.targetSpec})`).join(', ')}`
              : '';
          lines.push(
            `      ${fmtTime(w.fromSeconds)}–${fmtTime(w.toSeconds)} (${Math.round(w.durationSeconds)}s)${pressureNote}`,
          );
        });
      }
    });
  }

  // Teammate cooldowns
  if (teammateCooldowns.length > 0) {
    lines.push('');
    lines.push('TEAMMATE COOLDOWNS:');
    for (const { player, cds } of teammateCooldowns) {
      const spec = specToString(player.spec);
      if (cds.length === 0) {
        lines.push(`  ${spec} (${player.name}): No major CD data.`);
        continue;
      }
      lines.push(`  ${spec} (${player.name}):`);
      for (const cd of cds) {
        if (cd.neverUsed) {
          lines.push(`    ${cd.spellName} [${cd.cooldownSeconds}s CD]: NEVER USED`);
        } else {
          const castStr = cd.casts.map((c) => fmtTime(c.timeSeconds)).join(', ');
          const idleStr =
            cd.availableWindows.length > 0
              ? ` | idle: ${cd.availableWindows.map((w) => `${fmtTime(w.fromSeconds)}–${fmtTime(w.toSeconds)}`).join(', ')}`
              : '';
          lines.push(`    ${cd.spellName} [${cd.cooldownSeconds}s CD]: cast at ${castStr}${idleStr}`);
        }
      }
    }
  }

  lines.push('');
  formatEnemyCDTimelineForContext(enemyCDTimeline, durationSeconds).forEach((l) => lines.push(l));

  lines.push('');
  formatOverlappedDefensivesForContext(overlappedDefensives).forEach((l) => lines.push(l));

  lines.push('');
  formatPanicDefensivesForContext(panicDefensives).forEach((l) => lines.push(l));

  lines.push('');
  formatDispelContextForAI(dispelSummary).forEach((l) => lines.push(l));

  if (healer) {
    lines.push('');
    formatHealingGapsForContext(healingGaps).forEach((l) => lines.push(l));
  }

  lines.push('');
  formatOffensiveWindowsForContext(offensiveWindows).forEach((l) => lines.push(l));

  const targetSelectionLines = formatKillWindowTargetSelectionForContext(killWindowTargetEvals);
  if (targetSelectionLines.length > 0) {
    lines.push('');
    targetSelectionLines.forEach((l) => lines.push(l));
  }

  lines.push('');
  formatCCTrinketForContext(ccTrinketSummaries).forEach((l) => lines.push(l));

  const healerExposureLines = formatHealerExposureForContext(healerExposures);
  if (healerExposureLines.length > 0) {
    lines.push('');
    healerExposureLines.forEach((l) => lines.push(l));
  }

  const outgoingCCLines = formatOutgoingCCChainsForContext(outgoingCCChains);
  if (outgoingCCLines.length > 0) {
    lines.push('');
    outgoingCCLines.forEach((l) => lines.push(l));
    if (hasConstrainedTrade && friendlyDeaths.length > 0) {
      lines.push(
        `  Note: CC casts in the final phase of this match had limited follow-up potential — major defensive resources were exhausted.`,
      );
    }
  }

  lines.push('');
  formatDampeningForContext(
    combat.startInfo.bracket,
    [...friends, ...enemies],
    combat.startTime,
    combat.endTime,
  ).forEach((l) => lines.push(l));

  return lines.join('\n');
}

// Minimal markdown renderer (bold, bullets, headers)
function MarkdownBlock({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <h3 key={i} className="text-base font-bold mt-4 mb-1">
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={i} className="flex gap-2 my-0.5">
              <span className="text-primary mt-0.5">•</span>
              <span dangerouslySetInnerHTML={{ __html: renderInline(line.slice(2)) }} />
            </div>
          );
        }
        if (/^\d+\. /.test(line)) {
          const num = line.match(/^(\d+)\. /)?.[1];
          return (
            <div key={i} className="flex gap-2 my-0.5">
              <span className="text-primary font-bold min-w-[1.2rem]">{num}.</span>
              <span dangerouslySetInnerHTML={{ __html: renderInline(line.replace(/^\d+\. /, '')) }} />
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1" />;
        return <p key={i} className="my-0.5" dangerouslySetInnerHTML={{ __html: renderInline(line) }} />;
      })}
    </div>
  );
}

function renderInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="text-xs bg-base-300 px-1 rounded">$1</code>');
}

// Session-level cache: persists across tab switches and match switches without a server round-trip.
const analysisCache = new Map<string, string>();
// In-flight requests: allows re-attaching to an ongoing fetch after a tab switch.
const inFlightRequests = new Map<string, Promise<string>>();

export function CombatAIAnalysis() {
  const { combat, friends, enemies } = useCombatReportContext();
  const [analysis, setAnalysis] = useState<string | null>(() => analysisCache.get(combat?.id ?? '') ?? null);
  const [loading, setLoading] = useState(() => inFlightRequests.has(combat?.id ?? ''));
  const [error, setError] = useState<string | null>(null);

  // When the combat changes (or on mount): sync cached result or re-attach to an in-flight request.
  useEffect(() => {
    if (!combat) return;

    const cached = analysisCache.get(combat.id);
    if (cached) {
      setAnalysis(cached);
      setLoading(false);
      setError(null);
      return;
    }

    const inFlight = inFlightRequests.get(combat.id);
    if (inFlight) {
      setAnalysis(null);
      setLoading(true);
      setError(null);
      inFlight
        .then((result) => {
          setAnalysis(result);
          setLoading(false);
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : 'Analysis failed');
          setLoading(false);
        });
      return;
    }

    setAnalysis(null);
    setLoading(false);
    setError(null);
  }, [combat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!combat) return null;

  const allPlayers = [...friends, ...enemies];
  const hasPlayers = allPlayers.some(
    (p) => p.type === CombatUnitType.Player && p.reaction === CombatUnitReaction.Friendly,
  );
  if (!hasPlayers) {
    return <div className="p-4 text-base-content opacity-60">No player data available for analysis.</div>;
  }

  const handleAnalyze = async () => {
    const combatId = combat.id;
    setLoading(true);
    setError(null);
    setAnalysis(null);

    const fetchPromise: Promise<string> = (async () => {
      const matchContext = buildMatchContext(combat, friends, enemies);
      const apiKey = (await window.wowarenalogs?.settings?.getAnthropicApiKey?.()) ?? undefined;
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchContext, apiKey }),
      });
      const data = (await res.json()) as { analysis?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Analysis failed');
      const result = data.analysis ?? '';
      analysisCache.set(combatId, result);
      return result;
    })();

    inFlightRequests.set(combatId, fetchPromise);
    fetchPromise.finally(() => inFlightRequests.delete(combatId));

    try {
      const result = await fetchPromise;
      // Ignore result if the user switched to a different match while this was in flight
      if (combat.id !== combatId) return;
      setAnalysis(result);
    } catch (e) {
      if (combat.id !== combatId) return;
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      if (combat.id === combatId) setLoading(false);
    }
  };

  const owner = friends.find((p) => p.id === combat.playerId) ?? friends[0];
  const ownerSpec = owner ? specToString(owner.spec) : 'Unknown';

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold">AI Cooldown Analysis</h3>
        <p className="text-sm opacity-60">
          Analyzing <span className="font-semibold">{ownerSpec}</span> — reviews your major cooldown usage and gives
          specific recommendations.
        </p>
      </div>

      {!analysis && !loading && (
        <button className="btn btn-primary w-fit" onClick={handleAnalyze} disabled={loading}>
          Analyse this match
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-3">
          <span className="loading loading-spinner loading-sm text-primary" />
          <span className="text-sm opacity-60">Analysing your cooldown usage…</span>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button className="btn btn-sm btn-ghost ml-auto" onClick={handleAnalyze}>
            Retry
          </button>
        </div>
      )}

      {analysis && (
        <div className="flex flex-col gap-3">
          <div className="card bg-base-200 p-4">
            <MarkdownBlock text={analysis} />
          </div>
          <button className="btn btn-ghost btn-sm w-fit" onClick={handleAnalyze}>
            Re-analyse
          </button>
        </div>
      )}
    </div>
  );
}
