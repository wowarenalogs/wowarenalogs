import { CombatUnitReaction, CombatUnitType } from '@wowarenalogs/parser';
import { useEffect, useState } from 'react';

import { analyzePlayerCCAndTrinket, formatCCTrinketForContext } from '../../../utils/ccTrinketAnalysis';
import {
  computePressureWindows,
  detectOverlappedDefensives,
  detectPanicDefensives,
  extractMajorCooldowns,
  fmtTime,
  formatOverlappedDefensivesForContext,
  formatPanicDefensivesForContext,
  isHealerSpec,
  specToString,
} from '../../../utils/cooldowns';
import { formatDampeningForContext } from '../../../utils/dampening';
import { formatDispelContextForAI, reconstructDispelSummary } from '../../../utils/dispelAnalysis';
import { formatEnemyCDTimelineForContext, reconstructEnemyCDTimeline } from '../../../utils/enemyCDs';
import { detectHealingGaps, formatHealingGapsForContext } from '../../../utils/healingGaps';
import { useCombatReportContext } from '../CombatReportContext';

function buildMatchContext(
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
        atSeconds: (d.timestamp - combat.startTime) / 1000,
      })),
    )
    .sort((a, b) => a.atSeconds - b.atSeconds);

  const enemyDeaths = enemies
    .filter((p) => p.deathRecords.length > 0)
    .flatMap((p) =>
      p.deathRecords.map((d) => ({
        spec: specToString(p.spec),
        atSeconds: (d.timestamp - combat.startTime) / 1000,
      })),
    )
    .sort((a, b) => a.atSeconds - b.atSeconds);

  // Owner cooldowns
  const cooldowns = extractMajorCooldowns(owner, combat);

  // Teammate cooldowns (non-owner friendly players)
  const teammateCooldowns = friends
    .filter((p) => p.id !== owner.id)
    .map((p) => ({ player: p, cds: extractMajorCooldowns(p, combat) }));

  // Enemy offensive CD timeline
  const enemyCDTimeline = reconstructEnemyCDTimeline(enemies, combat, owner, friends);

  // Pressure windows — damage on friendly team
  const pressureWindows = computePressureWindows(friends, combat);

  // Friendly defensive CD overlaps
  const overlappedDefensives = detectOverlappedDefensives(friends, combat);
  const panicDefensives = detectPanicDefensives(friends, enemies, combat);

  // Build readable text for Claude
  const lines: string[] = [];

  lines.push(`ARENA MATCH ANALYSIS REQUEST`);
  lines.push('');
  lines.push(`Spec: ${ownerSpec}${healer ? ' (Healer)' : ''}`);
  lines.push(`Bracket: ${combat.startInfo.bracket}`);
  lines.push(`Result: ${resultStr}`);
  lines.push(`Duration: ${fmtTime(durationSeconds)}`);
  lines.push(`My team: ${myTeam}`);
  lines.push(`Enemy team: ${enemyTeam}`);

  lines.push('');
  lines.push('DEATHS:');
  if (friendlyDeaths.length === 0) {
    lines.push('  My team: No deaths');
  } else {
    friendlyDeaths.forEach((d) => lines.push(`  My team: ${d.spec} died at ${fmtTime(d.atSeconds)}`));
  }
  if (enemyDeaths.length === 0) {
    lines.push('  Enemy team: No deaths');
  } else {
    enemyDeaths.forEach((d) => lines.push(`  Enemy team: ${d.spec} died at ${fmtTime(d.atSeconds)}`));
  }

  lines.push('');
  lines.push('TOP DAMAGE PRESSURE WINDOWS ON MY TEAM (highest 15-second damage buckets):');
  if (pressureWindows.length === 0) {
    lines.push('  No significant pressure windows detected');
  } else {
    pressureWindows.forEach((w) => {
      const dmgM = (w.totalDamage / 1_000_000).toFixed(2);
      lines.push(
        `  ${fmtTime(w.fromSeconds)}-${fmtTime(w.toSeconds)}: ${w.targetSpec} (${w.targetName}) took ${dmgM}M damage`,
      );
    });
  }

  lines.push('');
  lines.push('COOLDOWN USAGE (major cooldowns >= 30s):');
  if (cooldowns.length === 0) {
    lines.push('  No major cooldown data found for this spec.');
  } else {
    cooldowns.forEach((cd) => {
      lines.push('');
      const cdLine = `  ${cd.spellName} [${cd.tag}, ${cd.cooldownSeconds}s CD]:`;
      lines.push(cdLine);

      if (cd.neverUsed) {
        lines.push(`    STATUS: NEVER USED (available entire match)`);
        const duringPressure = pressureWindows;
        if (duringPressure.length > 0) {
          lines.push(`    Missed pressure windows while idle:`);
          duringPressure.forEach((w) => {
            const dmgM = (w.totalDamage / 1_000_000).toFixed(2);
            lines.push(
              `      - ${fmtTime(w.fromSeconds)}-${fmtTime(w.toSeconds)}: ${w.targetSpec} took ${dmgM}M — CD was available`,
            );
          });
        }
      } else {
        cd.casts.forEach((c) => lines.push(`    Cast at: ${fmtTime(c.timeSeconds)}`));
      }

      if (cd.availableWindows.length > 0) {
        lines.push(`    Available but unused windows:`);
        cd.availableWindows.forEach((w) => {
          // Cross-reference: did any pressure window overlap with this idle period?
          const overlapping = pressureWindows.filter((p) => p.fromSeconds < w.toSeconds && p.toSeconds > w.fromSeconds);
          const pressureNote =
            overlapping.length > 0
              ? ` — PRESSURE DURING IDLE: ${overlapping.map((p) => `${fmtTime(p.fromSeconds)} (${(p.totalDamage / 1_000_000).toFixed(2)}M on ${p.targetSpec})`).join(', ')}`
              : '';
          lines.push(
            `      - ${fmtTime(w.fromSeconds)} to ${fmtTime(w.toSeconds)} (${Math.round(w.durationSeconds)}s idle)${pressureNote}`,
          );
        });
      } else if (!cd.neverUsed) {
        lines.push(`    No significant idle windows (CD used efficiently or match ended before it came back up)`);
      }
    });
  }

  if (teammateCooldowns.length > 0) {
    lines.push('');
    lines.push('TEAMMATE COOLDOWN USAGE:');
    for (const { player, cds } of teammateCooldowns) {
      const spec = specToString(player.spec);
      if (cds.length === 0) {
        lines.push(`  ${spec} (${player.name}): No major CD data found.`);
        continue;
      }
      lines.push(`  ${spec} (${player.name}):`);
      for (const cd of cds) {
        if (cd.neverUsed) {
          lines.push(`    ${cd.spellName} [${cd.tag}, ${cd.cooldownSeconds}s CD]: NEVER USED`);
        } else {
          const castStr = cd.casts.map((c) => fmtTime(c.timeSeconds)).join(', ');
          const idleStr =
            cd.availableWindows.length > 0
              ? ` | idle windows: ${cd.availableWindows.map((w) => `${fmtTime(w.fromSeconds)}-${fmtTime(w.toSeconds)}`).join(', ')}`
              : '';
          lines.push(`    ${cd.spellName} [${cd.tag}, ${cd.cooldownSeconds}s CD]: cast at ${castStr}${idleStr}`);
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
  formatDispelContextForAI(reconstructDispelSummary(friends, enemies, combat)).forEach((l) => lines.push(l));

  if (healer) {
    const healingGaps = detectHealingGaps(owner, friends, enemies, combat);
    lines.push('');
    formatHealingGapsForContext(healingGaps).forEach((l) => lines.push(l));
  }

  const ccTrinketSummaries = friends.map((p) => analyzePlayerCCAndTrinket(p, enemies, combat));
  lines.push('');
  formatCCTrinketForContext(ccTrinketSummaries).forEach((l) => lines.push(l));

  const allPlayers = [...friends, ...enemies];
  lines.push('');
  formatDampeningForContext(combat.startInfo.bracket, allPlayers, combat.startTime, combat.endTime).forEach((l) =>
    lines.push(l),
  );

  lines.push('');
  lines.push(
    healer
      ? "Focus your analysis on: external defensive timing, big healing CD usage relative to pressure windows, whether the healer survived, and any missed opportunities to save teammates. Cross-reference the enemy offensive CD timeline — did your defensive CDs land during aligned enemy burst windows? For FRIENDLY CD OVERLAPS: evaluate whether each overlap was justified (e.g. full enemy burst window, near-death) or wasteful (moderate pressure, staggering would have provided better coverage across multiple pushes). Name the specific spells and explain the consequence of the staging choice. For HEALING GAPS: identify the cause of each gap (repositioning, crowd control chain, mana management, or genuine lapse) and assess the consequence. For MISSED CLEANSE WINDOWS: call out every entry by name — which ally was in which CC/debuff, for how long, how much damage followed, and whether it was a true miss (you were free to cast) or excusable (you were CC'd or no one on the team could remove that debuff type). For MISSED PURGE WINDOWS: call out enemy buffs that sat unpurged when you had a free purger — name the buff, the enemy, and how long it ran. For CC & TRINKET: identify any CCs where the trinket was available but unused and significant damage was taken — was the player tunnelled, confused, or holding trinket for a specific CC type? Flag any trinket uses outside of CC windows as potentially wasteful. For DAMPENING: note the point where healing could no longer sustain pressure and whether the losing team was playing into the dampening clock or fighting it — did kills happen before or after healing became critically impaired?"
      : 'Focus your analysis on: offensive CD windows relative to enemy vulnerability, defensive CD usage during high-damage incoming windows, and kill window timing. Cross-reference your offensive CDs against the enemy aligned burst windows. For MISSED CLEANSE WINDOWS: call out every entry — which teammate was locked in which CC/debuff, for how long, and how much damage followed. Note whether your team had someone capable of cleansing it and whether they were free to act. For MISSED PURGE WINDOWS: name each enemy buff that sat unpurged and how long it ran. For enemy purges (hostile strips): note if enemies consistently stripped key buffs from your team at critical moments. For CC & TRINKET: evaluate whether each player used their trinket appropriately — flag missed windows where the trinket was available during a high-damage CC, and identify any off-CC uses that may have wasted it. For DAMPENING: note whether the match went deep enough into dampening that the healer was significantly impaired — and whether your team capitalised on or missed that window.',
  );

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
