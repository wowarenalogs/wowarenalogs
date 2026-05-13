// ── Barrel re-export ───────────────────────────────────────────────────────
// utils.ts is kept as the public surface for backward compatibility.
// All implementation has moved to focused modules.

export {
  computeHealingInWindow,
  DMG_SPIKE_THRESHOLD,
  extractEnemyMajorBuffIntervals,
  extractOwnerCDBuffExpiry,
  getTopDamageSourcesInWindow,
  HEALER_CAST_SPELL_ID_TO_NAME,
  HEALING_AMPLIFIER_SPELL_IDS,
  lastCastBefore,
  PASSIVE_SPELL_BLOCKLIST,
  type ICDExpiryEvent,
  type IEnemyBuffInterval,
} from './timelineHelpers';

export {
  buildDeathRootCauseTrace,
  buildKillMomentFields,
  findContributingDeath,
  getEnemyStateAtTime,
  getOwnerCDsAvailable,
  identifyCriticalMoments,
  type CriticalMoment,
  type MomentRole,
} from './criticalMoments';

export { buildMatchArc, buildMatchFlow } from './matchNarrative';

export {
  buildJsonSituationSnapshot,
  buildPlayerLoadout,
  buildResourceSnapshot,
  computeOnCDDisplayNames,
  computeReadyNames,
  type ResourceSnapshotParams,
} from './resourceSnapshot';

export { buildMatchTimeline, type BuildMatchTimelineParams } from './matchTimeline';
