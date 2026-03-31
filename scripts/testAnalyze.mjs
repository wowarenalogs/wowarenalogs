/**
 * Standalone test script: parse a WoW combat log and run AI cooldown analysis.
 * Usage: node scripts/testAnalyze.mjs <path-to-log> [match-index]
 *   match-index defaults to 0 (first match)
 */

import { createReadStream, existsSync, readdirSync, statSync } from 'fs';
import { readFile } from 'fs/promises';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import os from 'os';
import Anthropic from '../node_modules/@anthropic-ai/sdk/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// ---- Load static data -------------------------------------------------------

const spellEffects = JSON.parse(
  await readFile(join(repoRoot, 'packages/shared/src/data/spellEffects.json'), 'utf8'),
);

const spellsJson = JSON.parse(
  await readFile(join(repoRoot, 'packages/shared/src/data/spells.json'), 'utf8'),
);

// CombatUnitSpec mapping (spec numeric ID → readable name)
const SPEC_NAMES = {
  250: 'Blood Death Knight', 251: 'Frost Death Knight', 252: 'Unholy Death Knight',
  577: 'Havoc Demon Hunter', 581: 'Vengeance Demon Hunter', 1480: 'Devoker Demon Hunter',
  102: 'Balance Druid', 103: 'Feral Druid', 104: 'Guardian Druid', 105: 'Restoration Druid',
  253: 'Beast Mastery Hunter', 254: 'Marksmanship Hunter', 255: 'Survival Hunter',
  62: 'Arcane Mage', 63: 'Fire Mage', 64: 'Frost Mage',
  268: 'Brewmaster Monk', 269: 'Windwalker Monk', 270: 'Mistweaver Monk',
  65: 'Holy Paladin', 66: 'Protection Paladin', 70: 'Retribution Paladin',
  256: 'Discipline Priest', 257: 'Holy Priest', 258: 'Shadow Priest',
  259: 'Assassination Rogue', 260: 'Outlaw Rogue', 261: 'Subtlety Rogue',
  262: 'Elemental Shaman', 263: 'Enhancement Shaman', 264: 'Restoration Shaman',
  265: 'Affliction Warlock', 266: 'Demonology Warlock', 267: 'Destruction Warlock',
  71: 'Arms Warrior', 72: 'Fury Warrior', 73: 'Protection Warrior',
  1467: 'Devastation Evoker', 1468: 'Preservation Evoker', 1473: 'Augmentation Evoker',
};

const HEALER_SPECS = new Set([105, 270, 65, 256, 257, 264, 1468]);

// ---- Spell classification (mirrors spellDanger.ts) --------------------------

const MAX_CD_SECONDS = 360;

// Offensive spells: sourced from spells.json (buffs_offensive / debuffs_offensive),
// excluding nounitFrames/nonameplates entries (passive/hidden procs).
function isOffensiveSpell(spellId) {
  const entry = spellsJson[spellId];
  return (
    entry &&
    (entry.type === 'buffs_offensive' || entry.type === 'debuffs_offensive') &&
    !entry.nounitFrames &&
    !entry.nonameplates
  );
}

// Effect type overrides for spells with non-DamageAmp danger (mirrors SPELL_EFFECT_OVERRIDES in spellDanger.ts)
const SPELL_EFFECT_OVERRIDES = {
  '79140':  ['DamageAmp', 'HealReduction'], // Vendetta/Deathmark (Assassination Rogue)
  '375901': ['HealReduction'],              // Mindgames (Shadow Priest) — reverses heals into damage
  '386997': ['HealReduction'],              // Soul Rot (Affliction Warlock) — heal-to-damage debuff
  '207736': ['Vulnerability'],              // Shadowy Duel (Subtlety Rogue) — isolates + increases damage taken
};

// ---- Danger scoring helpers -------------------------------------------------

const EFFECT_TYPE_WEIGHTS = { DamageAmp: 1.0, HealReduction: 1.5, Vulnerability: 1.2, Execution: 0.8 };

function cdTierWeight(cooldownSeconds) {
  if (cooldownSeconds < 30) return 0;
  return Math.log(cooldownSeconds / 30);
}

function spellDangerWeight(spellId, cooldownSeconds) {
  const effects = SPELL_EFFECT_OVERRIDES[spellId] ?? ['DamageAmp'];
  const effectWeight = effects.reduce((sum, e) => sum + (EFFECT_TYPE_WEIGHTS[e] ?? 1.0), 0);
  return cdTierWeight(cooldownSeconds) * effectWeight;
}

function computeDampening(matchTimeSeconds) {
  if (matchTimeSeconds <= 120) return 0;
  return Math.min((matchTimeSeconds - 120) * (0.1 / 60), 1.0);
}

function dangerLabel(score) {
  if (score >= 7) return 'CRITICAL';
  if (score >= 4) return 'High';
  if (score >= 2) return 'Moderate';
  return 'Low';
}

// ---- Log parsing ------------------------------------------------------------

function parseTimestamp(dateStr, timeStr) {
  // e.g. "3/29/2026" "00:02:46.981-7"
  const tzMatch = timeStr.match(/^(.+?)([-+]\d+)$/);
  if (!tzMatch) return 0;
  const [, time] = tzMatch;
  return new Date(`${dateStr} ${time}`).getTime();
}

function parseLogLine(raw) {
  // "3/29/2026 00:02:46.981-7  EVENT,..."
  const headerMatch = raw.match(/^(\S+)\s+(\S+)\s+(\S+(?:,.*)?)$/);
  if (!headerMatch) return null;
  const [, date, time, rest] = headerMatch;
  const ts = parseTimestamp(date, time);
  const commaIdx = rest.indexOf(',');
  const event = commaIdx >= 0 ? rest.slice(0, commaIdx) : rest;
  const paramStr = commaIdx >= 0 ? rest.slice(commaIdx + 1) : '';

  // Parse CSV respecting nested parens/brackets
  const params = [];
  let cur = '';
  let depth = 0;
  for (const ch of paramStr) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      params.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) params.push(cur);

  return { timestamp: ts, event, params };
}

// Affiliation is in the low nibble: 0x1=Mine, 0x2=Party, 0x4=Raid, 0x8=Outsider
function isMineFlag(flagHex) {
  const flags = parseInt(flagHex, 16);
  return (flags & 0xF) === 0x1;
}

// Reaction is in the second nibble: 0x10=Friendly, 0x40=Hostile
function isFriendlyFlag(flagHex) {
  const flags = parseInt(flagHex, 16);
  return (flags & 0xF0) === 0x10;
}

function isHostileFlag(flagHex) {
  const flags = parseInt(flagHex, 16);
  return (flags & 0xF0) === 0x40;
}

// ---- Parse matches from file ------------------------------------------------

async function parseMatches(logPath) {
  const matches = [];
  let current = null;

  const rl = createInterface({ input: createReadStream(logPath), crlfDelay: Infinity });

  for await (const rawLine of rl) {
    const line = parseLogLine(rawLine.trim());
    if (!line) continue;

    const { timestamp, event, params } = line;

    if (event === 'ARENA_MATCH_START') {
      current = {
        startTime: timestamp,
        endTime: null,
        bracket: params[2]?.replace(/"/g, '') ?? 'Unknown',
        winningTeamId: null,
        ownerGuid: null,
        ownerTeamId: null,
        players: {}, // guid → { name, specId, teamId, flags, damageIn: [] }
        spellCasts: {}, // guid → [ { timestamp, spellId } ]
        deaths: [], // { guid, timestamp }
      };
    } else if (event === 'ARENA_MATCH_END' && current) {
      current.endTime = timestamp;
      current.winningTeamId = parseInt(params[0]) || 0;
      matches.push(current);
      current = null;
    } else if (event === 'COMBATANT_INFO' && current) {
      const guid = params[0]?.replace(/"/g, '');
      const specId = parseInt(params[24]) || 0;
      const teamId = parseInt(params[params.length - 3]) || 0; // near end of params
      if (guid) {
        current.players[guid] = { name: '', specId, teamId, isMine: false };
      }
    } else if (current) {
      // Most combat events: srcGUID, srcName, srcFlags, srcFlags2, dstGUID, dstName, dstFlags, dstFlags2, ...
      const srcGuid = params[0]?.replace(/"/g, '');
      const srcName = params[1]?.replace(/"/g, '');
      const srcFlagHex = params[2];
      const dstGuid = params[4]?.replace(/"/g, '');
      const dstFlagHex = params[6];

      // Detect log owner from MINE affiliation flag
      if (srcGuid && srcFlagHex && isMineFlag(srcFlagHex)) {
        if (!current.ownerGuid) current.ownerGuid = srcGuid;
        if (current.players[srcGuid]) current.players[srcGuid].isMine = true;
      }

      // Track player names and reaction from events
      if (srcGuid && srcName && current.players[srcGuid]) {
        current.players[srcGuid].name = srcName;
        if (srcFlagHex) {
          if (isFriendlyFlag(srcFlagHex)) current.players[srcGuid].isFriendly = true;
          if (isHostileFlag(srcFlagHex)) current.players[srcGuid].isHostile = true;
        }
      }
      if (dstGuid && params[5] && current.players[dstGuid]) {
        current.players[dstGuid].name = params[5].replace(/"/g, '');
        if (dstFlagHex) {
          if (isFriendlyFlag(dstFlagHex)) current.players[dstGuid].isFriendly = true;
          if (isHostileFlag(dstFlagHex)) current.players[dstGuid].isHostile = true;
        }
      }

      if (event === 'SPELL_CAST_SUCCESS') {
        const spellId = params[8]?.replace(/"/g, '');
        if (srcGuid && spellId && spellEffects[spellId]) {
          if (!current.spellCasts[srcGuid]) current.spellCasts[srcGuid] = [];
          current.spellCasts[srcGuid].push({ timestamp, spellId });
        }
        // Track player positions from advanced logging data
        if (srcGuid && params[25] && params[26]) {
          const x = parseFloat(params[25]);
          const y = parseFloat(params[26]);
          if (!isNaN(x) && !isNaN(y)) {
            if (!current.playerPositions) current.playerPositions = {};
            if (!current.playerPositions[srcGuid]) current.playerPositions[srcGuid] = [];
            current.playerPositions[srcGuid].push({ t: timestamp, x, y });
          }
        }
      } else if (event === 'SPELL_DAMAGE' && srcGuid && params[25] && params[26]) {
        const x = parseFloat(params[25]);
        const y = parseFloat(params[26]);
        if (!isNaN(x) && !isNaN(y)) {
          if (!current.playerPositions) current.playerPositions = {};
          if (!current.playerPositions[srcGuid]) current.playerPositions[srcGuid] = [];
          current.playerPositions[srcGuid].push({ t: timestamp, x, y });
        }
      } else if (
        (event === 'SPELL_HEAL' || event === 'SPELL_PERIODIC_DAMAGE') &&
        srcGuid && params[25] && params[26]
      ) {
        const x = parseFloat(params[25]);
        const y = parseFloat(params[26]);
        if (!isNaN(x) && !isNaN(y)) {
          if (!current.playerPositions) current.playerPositions = {};
          if (!current.playerPositions[srcGuid]) current.playerPositions[srcGuid] = [];
          current.playerPositions[srcGuid].push({ t: timestamp, x, y });
        }
      } else if (event === 'UNIT_DIED') {
        if (dstGuid) {
          current.deaths.push({ guid: dstGuid, name: params[5]?.replace(/"/g, ''), timestamp });
        }
      } else if (
        (event === 'SPELL_DAMAGE' || event === 'SPELL_PERIODIC_DAMAGE' || event === 'SWING_DAMAGE_LANDED') &&
        dstGuid && current.players[dstGuid]
      ) {
        // Retail offset +2: damage at params[30] for _DAMAGE events, params[27] for SWING
        const isSwing = event === 'SWING_DAMAGE_LANDED';
        const amount = Math.abs(parseFloat(isSwing ? params[27] : params[30]) || 0);
        if (!current.players[dstGuid].damageIn) current.players[dstGuid].damageIn = [];
        current.players[dstGuid].damageIn.push({ timestamp, amount });
      }
    }
  }

  return matches;
}

// ---- Build context text -----------------------------------------------------

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function buildContext(match) {
  const durationMs = (match.endTime ?? match.startTime) - match.startTime;
  const durationSec = durationMs / 1000;

  const ownerGuid = match.ownerGuid ?? Object.keys(match.players).find(g => match.players[g].isMine);
  const owner = ownerGuid ? match.players[ownerGuid] : null;
  if (!owner || !ownerGuid) return null;

  const ownerSpecId = owner.specId;
  const ownerSpecName = SPEC_NAMES[ownerSpecId] ?? `Unknown (spec ${ownerSpecId})`;
  const isHealer = HEALER_SPECS.has(ownerSpecId);

  // Use reaction flags to identify teams (more reliable than COMBATANT_INFO teamId in Solo Shuffle)
  const myPlayers = Object.entries(match.players).filter(([g, p]) =>
    g === ownerGuid || p.isMine || p.isFriendly
  );
  const enemyPlayers = Object.entries(match.players).filter(([g, p]) =>
    g !== ownerGuid && !p.isMine && !p.isFriendly && p.isHostile
  );

  const myTeam = myPlayers.map(([, p]) => SPEC_NAMES[p.specId] ?? `Unknown(${p.specId})`).join(', ');
  const enemyTeam = enemyPlayers.map(([, p]) => SPEC_NAMES[p.specId] ?? `Unknown(${p.specId})`).join(', ');

  // Result — infer from deaths (reliable for most rounds)
  const myGuidsSet = new Set(myPlayers.map(([g]) => g));
  const enemyGuidsSet = new Set(enemyPlayers.map(([g]) => g));
  const myTeamDied = match.deaths.some(d => myGuidsSet.has(d.guid));
  const enemyTeamDied = match.deaths.some(d => enemyGuidsSet.has(d.guid));
  const result = !match.endTime ? 'Incomplete'
    : enemyTeamDied && !myTeamDied ? 'Win'
    : myTeamDied && !enemyTeamDied ? 'Loss'
    : 'Unknown';

  // Deaths
  const friendlyDeaths = match.deaths
    .filter(d => myGuidsSet.has(d.guid))
    .map(d => `${SPEC_NAMES[match.players[d.guid]?.specId] ?? d.name} died at ${fmtTime((d.timestamp - match.startTime) / 1000)}`);
  const enemyDeaths = match.deaths
    .filter(d => enemyGuidsSet.has(d.guid))
    .map(d => `${SPEC_NAMES[match.players[d.guid]?.specId] ?? d.name} died at ${fmtTime((d.timestamp - match.startTime) / 1000)}`);

  // Cooldown analysis for log owner
  const ownerCasts = match.spellCasts[ownerGuid] ?? [];
  const cdMap = {};
  for (const cast of ownerCasts) {
    if (!cdMap[cast.spellId]) cdMap[cast.spellId] = [];
    cdMap[cast.spellId].push((cast.timestamp - match.startTime) / 1000);
  }

  const cooldownLines = [];
  for (const [spellId, castTimes] of Object.entries(cdMap)) {
    if (castTimes.length === 0) continue;
    const effectData = spellEffects[spellId];
    if (!effectData) continue;
    const cooldownSeconds = effectData.cooldownSeconds ?? effectData.charges?.chargeCooldownSeconds ?? 0;
    if (cooldownSeconds < 30 || cooldownSeconds > MAX_CD_SECONDS) continue;
    const name = effectData.name;
    const casts = castTimes;

    cooldownLines.push('');
    cooldownLines.push(`  ${name} [${cooldownSeconds}s CD]:`);
    casts.forEach(t => cooldownLines.push(`    Cast at: ${fmtTime(t)}`));

    // Compute unused windows
    const windows = [];
    const GRACE = 3;
    if (casts[0] > GRACE) windows.push({ from: 0, to: casts[0] });
    for (let i = 0; i < casts.length; i++) {
      const ready = casts[i] + cooldownSeconds;
      const next = i + 1 < casts.length ? casts[i + 1] : durationSec;
      if (ready < durationSec - GRACE && next > ready + GRACE) {
        windows.push({ from: ready, to: next });
      }
    }
    if (windows.length) {
      cooldownLines.push(`    Available but unused:`);
      windows.forEach(w => cooldownLines.push(`      - ${fmtTime(w.from)} to ${fmtTime(w.to)} (${Math.round(w.to - w.from)}s idle)`));
    }
  }

  // Pressure windows: top 5 15s buckets of damage taken by my team
  const BUCKET_SEC = 15;
  const numBuckets = Math.ceil(durationSec / BUCKET_SEC);
  const pressureMap = {};
  for (const [guid] of myPlayers) {
    const player = match.players[guid];
    if (!player.damageIn) continue;
    const buckets = new Array(numBuckets).fill(0);
    for (const { timestamp, amount } of player.damageIn) {
      const t = (timestamp - match.startTime) / 1000;
      const idx = Math.min(Math.floor(t / BUCKET_SEC), numBuckets - 1);
      if (idx >= 0) buckets[idx] += amount;
    }
    buckets.forEach((dmg, i) => {
      if (dmg > 0) pressureMap[`${guid}_${i}`] = { guid, bucket: i, total: dmg };
    });
  }
  const topPressure = Object.values(pressureMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Build text
  const lines = [];
  lines.push('ARENA MATCH ANALYSIS REQUEST');
  lines.push('');
  lines.push(`Spec: ${ownerSpecName}${isHealer ? ' (Healer)' : ''}`);
  lines.push(`Bracket: ${match.bracket}`);
  lines.push(`Result: ${result}`);
  lines.push(`Duration: ${fmtTime(durationSec)}`);
  lines.push(`My team: ${myTeam || '(unknown)'}`);
  lines.push(`Enemy team: ${enemyTeam || '(unknown)'}`);
  lines.push('');
  lines.push('DEATHS:');
  lines.push(friendlyDeaths.length ? friendlyDeaths.map(d => `  My team: ${d}`).join('\n') : '  My team: No deaths');
  lines.push(enemyDeaths.length ? enemyDeaths.map(d => `  Enemy: ${d}`).join('\n') : '  Enemy team: No deaths');
  lines.push('');
  lines.push('TOP DAMAGE PRESSURE ON MY TEAM (15s windows):');
  if (topPressure.length === 0) {
    lines.push('  No significant pressure detected');
  } else {
    for (const p of topPressure) {
      const from = p.bucket * BUCKET_SEC;
      const to = Math.min((p.bucket + 1) * BUCKET_SEC, durationSec);
      const spec = SPEC_NAMES[match.players[p.guid]?.specId] ?? match.players[p.guid]?.name ?? p.guid;
      lines.push(`  ${fmtTime(from)}-${fmtTime(to)}: ${spec} took ${(p.total / 1e6).toFixed(2)}M damage`);
    }
  }
  lines.push('');
  lines.push('COOLDOWN USAGE (only spells actually cast are shown):');
  if (cooldownLines.length === 0) {
    lines.push('  No tagged cooldowns were cast during this match.');
  } else {
    lines.push(...cooldownLines);
  }

  // Enemy offensive CD timeline (scored)
  const BURST_CLUSTER_SEC = 10;
  const enemyPlayerEntries = enemyPlayers.map(([guid, player]) => ({
    guid,
    player,
    specName: SPEC_NAMES[player.specId] ?? `Unknown(${player.specId})`,
    offensiveCasts: (match.spellCasts[guid] ?? []).filter((c) => {
      if (!isOffensiveSpell(c.spellId)) return false;
      const cd = spellEffects[c.spellId];
      if (!cd) return false;
      const cdSec = cd.cooldownSeconds ?? cd.charges?.chargeCooldownSeconds ?? 0;
      return cdSec >= 30 && cdSec <= MAX_CD_SECONDS;
    }),
  })).filter((e) => e.offensiveCasts.length > 0);

  lines.push('');
  lines.push('ENEMY OFFENSIVE COOLDOWN TIMELINE:');

  if (enemyPlayerEntries.length === 0) {
    lines.push('  No enemy offensive cooldown data found.');
  } else {
    for (const entry of enemyPlayerEntries) {
      lines.push('');
      lines.push(`  ${entry.specName} (${entry.player.name || entry.guid}):`);
      for (const cast of entry.offensiveCasts) {
        const effectData = spellEffects[cast.spellId];
        const cooldownSeconds = effectData.cooldownSeconds ?? effectData.charges?.chargeCooldownSeconds ?? 0;
        const castSec = (cast.timestamp - match.startTime) / 1000;
        const backSec = castSec + cooldownSeconds;
        const backStr = backSec <= durationSec
          ? ` → back at ${fmtTime(backSec)}`
          : ' → not available again before match ended';
        const effects = (SPELL_EFFECT_OVERRIDES[cast.spellId] ?? ['DamageAmp']).join(', ');
        lines.push(`    ${effectData.name} [${cooldownSeconds}s CD, ${effects}]: cast at ${fmtTime(castSec)}${backStr}`);
      }
    }

    // Compute total friendly damage for ratio calculation
    const allFriendlyDamage = myPlayers.flatMap(([guid]) => match.players[guid]?.damageIn ?? []);
    const totalFriendlyDamage = allFriendlyDamage.reduce((sum, e) => sum + e.amount, 0);
    const avgWindowDamage = durationSec > 0
      ? totalFriendlyDamage / (durationSec / BURST_CLUSTER_SEC)
      : 0;

    // Aligned burst windows: 2+ offensive CD casts within BURST_CLUSTER_SEC of each other
    const allOffensiveCasts = enemyPlayerEntries.flatMap((e) =>
      e.offensiveCasts.map((c) => ({
        time: (c.timestamp - match.startTime) / 1000,
        playerName: e.player.name || e.guid,
        spellName: spellEffects[c.spellId]?.name ?? c.spellId,
        spellId: c.spellId,
        cooldownSeconds: spellEffects[c.spellId]?.cooldownSeconds ?? spellEffects[c.spellId]?.charges?.chargeCooldownSeconds ?? 0,
      }))
    ).sort((a, b) => a.time - b.time);

    const alignedWindows = [];
    let i = 0;
    while (i < allOffensiveCasts.length) {
      const windowStart = allOffensiveCasts[i].time;
      const inWindow = allOffensiveCasts.filter(
        (c) => c.time >= windowStart && c.time <= windowStart + BURST_CLUSTER_SEC,
      );
      if (inWindow.length >= 2) {
        // Scored burst window
        const cdScore = inWindow.reduce(
          (sum, c) => sum + spellDangerWeight(c.spellId, c.cooldownSeconds),
          0,
        );
        const alignmentMult = inWindow.length >= 3 ? 1.5 : 1.0;

        const dampening = computeDampening(windowStart);
        const dampeningMult = 1 + dampening * 1.5;

        // Damage in ±BURST_CLUSTER_SEC window around burst start
        const windowDamage = allFriendlyDamage
          .filter((e) => {
            const t = (e.timestamp - match.startTime) / 1000;
            return t >= windowStart - BURST_CLUSTER_SEC && t <= windowStart + BURST_CLUSTER_SEC;
          })
          .reduce((sum, e) => sum + e.amount, 0);
        const damageRatio = avgWindowDamage > 0 ? Math.max(windowDamage / avgWindowDamage, 0.5) : 0.5;

        // Healer CC proxy: healer owner made 0 spell casts in the window.
        // Only meaningful when the log owner is a healer — skip for DPS POV logs.
        const windowEnd = inWindow[inWindow.length - 1].time;
        const windowDuration = windowEnd - windowStart;
        let healerCCed = false;
        if (ownerGuid && isHealer && windowDuration >= 5) {
          const ownerCastsInWindow = (match.spellCasts[ownerGuid] ?? []).filter((c) => {
            const t = (c.timestamp - match.startTime) / 1000;
            return t >= windowStart && t <= windowEnd;
          });
          healerCCed = ownerCastsInWindow.length === 0;
        }
        const healerMult = 1.0 + (healerCCed ? 0.8 : 0.0);

        const dangerScore = cdScore * alignmentMult * damageRatio * dampeningMult * healerMult;

        // Position analysis
        let positionMult = 1.0;
        let positionStr = 'in range';
        const posData = match.playerPositions ?? {};

        // Find healer's last position before window
        function lastPosBeforeWindow(guid, windowTs) {
          const positions = posData[guid];
          if (!positions || positions.length === 0) return null;
          const windowMs = match.startTime + windowTs * 1000;
          let best = null;
          for (const p of positions) {
            if (p.t <= windowMs) best = p;
          }
          return best;
        }

        const ownerPos = ownerGuid ? lastPosBeforeWindow(ownerGuid, windowStart) : null;

        if (ownerPos) {
          // Check if healer is within 10 yards of any enemy
          let exposed = false;
          for (const [eguid] of enemyPlayers) {
            const ePos = lastPosBeforeWindow(eguid, windowStart);
            if (ePos) {
              const dx = ownerPos.x - ePos.x;
              const dy = ownerPos.y - ePos.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist <= 10) { exposed = true; break; }
            }
          }

          // Find friendly player who took most damage in window
          let primaryTarget = null, maxDmg = 0;
          for (const [fguid] of myPlayers) {
            const fDmg = (match.players[fguid]?.damageIn ?? [])
              .filter((e) => {
                const t = (e.timestamp - match.startTime) / 1000;
                return t >= windowStart - BURST_CLUSTER_SEC && t <= windowStart + BURST_CLUSTER_SEC;
              })
              .reduce((sum, e) => sum + e.amount, 0);
            if (fDmg > maxDmg) { maxDmg = fDmg; primaryTarget = fguid; }
          }

          let outOfRange = false;
          if (primaryTarget) {
            const targetPos = lastPosBeforeWindow(primaryTarget, windowStart);
            if (targetPos) {
              const dx = ownerPos.x - targetPos.x;
              const dy = ownerPos.y - targetPos.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > 40) outOfRange = true;
            }
          }

          if (exposed && outOfRange) { positionMult = 1.5; positionStr = 'EXPOSED + OUT_OF_RANGE'; }
          else if (outOfRange) { positionMult = 1.3; positionStr = 'OUT_OF_RANGE'; }
          else if (exposed) { positionMult = 1.2; positionStr = 'EXPOSED'; }
        }

        const finalScore = dangerScore * positionMult;

        alignedWindows.push({
          fromSec: windowStart,
          casts: inWindow,
          finalScore,
          dampening,
          windowDamage,
          damageRatio,
          healerCCed,
          positionStr,
        });
        i += inWindow.length;
      } else {
        i++;
      }
    }

    if (alignedWindows.length > 0) {
      lines.push('');
      lines.push('ENEMY ALIGNED BURST WINDOWS:');
      alignedWindows.forEach((w, idx) => {
        const scoreStr = w.finalScore.toFixed(1);
        const label = dangerLabel(w.finalScore);
        const dampPct = Math.round(w.dampening * 100);
        lines.push(`  #${idx + 1} — ${fmtTime(w.fromSec)} | Score: ${scoreStr} [${label}] | Dampening: ${dampPct}%`);
        const cdParts = w.casts.map((c) => {
          const weight = spellDangerWeight(c.spellId, c.cooldownSeconds).toFixed(2);
          return `${c.spellName} (${c.playerName}, ${c.cooldownSeconds}s, weight:${weight})`;
        });
        lines.push(`    ${cdParts.join(' + ')}`);
        const dmgM = (w.windowDamage / 1e6).toFixed(2);
        const ratioStr = `${w.damageRatio.toFixed(1)}× avg`;
        const healerStr = w.healerCCed ? 'Healer: CCed' : 'Healer: free to cast';
        lines.push(`    Damage: ${dmgM}M (${ratioStr}) | ${healerStr} | Position: ${w.positionStr}`);
      });
    }
  }

  lines.push('');
  lines.push(
    isHealer
      ? 'Focus: external defensives timing, big healing CDs vs pressure windows, whether the healer survived, missed teammate saves. Cross-reference the enemy offensive CD timeline — did your defensive CDs land during aligned enemy burst windows?'
      : 'Focus: offensive CD alignment with kill windows, defensive CD usage under pressure, overall CD efficiency. Cross-reference your offensive CDs against the enemy aligned burst windows.',
  );
  return lines.join('\n');
}

// ---- Main -------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert World of Warcraft arena PvP coach with deep knowledge of every spec, major cooldowns, and arena strategy. You analyze arena match data and give specific, actionable feedback focused on cooldown usage.

Your analysis must:
- Be grounded in the actual timestamps and events provided — do not invent events
- Prioritize the most impactful mistakes over minor ones
- For healers: pay extra attention to external defensives (timing and target), big healing cooldowns relative to pressure windows, and survivability
- Use timestamps in m:ss format when referencing events (e.g. "at 1:23")
- Be honest but constructive — point out errors clearly but explain *why* it matters

Format your response in three sections using markdown:

## What went wrong
Bullet-pointed list of issues, most impactful first. For each: what happened, when, and why it hurt.

## What went well
Brief bullets on cooldowns used correctly. Keep this short.

## Top 3 recommendations
Numbered list of the most important changes for next time, each with a concrete action.`;

// ---- Resolve log file -------------------------------------------------------

// WoW log candidates — macOS and Windows
const HOME = os.homedir();
const WOW_LOG_CANDIDATES = os.platform() === 'win32'
  ? [
      // Default Blizzard install locations on Windows
      'C:\\Program Files (x86)\\World of Warcraft\\_retail_\\Logs',
      'C:\\Program Files\\World of Warcraft\\_retail_\\Logs',
      'C:\\Program Files (x86)\\World of Warcraft\\_classic_\\Logs',
      'C:\\Program Files\\World of Warcraft\\_classic_\\Logs',
      `${HOME}\\Downloads`,
      `${HOME}\\Documents`,
    ]
  : [
      // macOS
      `${HOME}/Library/Application Support/World of Warcraft/_retail_/Logs`,
      `${HOME}/Library/Application Support/World of Warcraft/_classic_/Logs`,
      `${HOME}/Downloads`,
      `${HOME}/Documents`,
    ];

let logPath = process.argv[2];
const matchIndex = parseInt(process.argv[3] ?? '-1'); // -1 = auto-pick best match

// Auto-detect log if not provided
if (!logPath) {
  let best = null, bestMtime = 0;
  for (const dir of WOW_LOG_CANDIDATES) {
    if (!existsSync(dir)) continue;
    try {
      const entries = readdirSync(dir).filter(f => /WoW.Combat.Log.*\.txt$/i.test(f));
      for (const e of entries) {
        const full = join(dir, e);
        try {
          const mtime = statSync(full).mtimeMs;
          if (mtime > bestMtime) { bestMtime = mtime; best = full; }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
  if (best) {
    logPath = best;
    console.log(`Auto-detected log: ${logPath}`);
  } else {
    console.error('No WoW combat log found. Pass the path as the first argument.');
    console.error('Usage: node scripts/testAnalyze.mjs [log-file] [match-index]');
    process.exit(1);
  }
}

// ---- Resolve API key --------------------------------------------------------

// Read from env, then fall back to packages/web/.env.local
let apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  try {
    const envLocal = await readFile(join(repoRoot, 'packages/web/.env.local'), 'utf8');
    const match = envLocal.match(/^ANTHROPIC_API_KEY\s*=\s*(.+)$/m);
    if (match) apiKey = match[1].trim();
  } catch { /* file not found */ }
}

console.log(`Parsing log file: ${logPath}`);
const matches = await parseMatches(resolve(logPath));
console.log(`Found ${matches.length} arena matches`);

if (matches.length === 0) {
  console.error('No completed arena matches found in log.');
  process.exit(1);
}

// List all matches
matches.forEach((m, i) => {
  const dur = m.endTime ? fmtTime((m.endTime - m.startTime) / 1000) : '?:??';
  console.log(`  [${i}] ${m.bracket.padEnd(20)} ${dur}`);
});

// Auto-pick: prefer 3v3, then longest Solo Shuffle round
let resolvedIndex = matchIndex;
if (resolvedIndex < 0) {
  const best3v3 = matches.reduce((best, m, i) => {
    if (!m.bracket.toLowerCase().includes('3v3')) return best;
    const dur = m.endTime ? m.endTime - m.startTime : 0;
    return dur > (best.dur ?? 0) ? { i, dur } : best;
  }, {});
  if (best3v3.i !== undefined) {
    resolvedIndex = best3v3.i;
  } else {
    // fallback: longest match
    resolvedIndex = matches.reduce((bestI, m, i) => {
      const dur = m.endTime ? m.endTime - m.startTime : 0;
      const bestDur = matches[bestI].endTime ? matches[bestI].endTime - matches[bestI].startTime : 0;
      return dur > bestDur ? i : bestI;
    }, 0);
  }
  console.log(`\nAuto-selected match [${resolvedIndex}] (pass a number as 2nd arg to override)`);
}

const targetMatch = matches[resolvedIndex];
if (!targetMatch) {
  console.error(`Match index ${resolvedIndex} out of range (0-${matches.length - 1})`);
  process.exit(1);
}

console.log(`\nAnalysing match ${resolvedIndex + 1}/${matches.length}: ${targetMatch.bracket} | ${fmtTime((targetMatch.endTime - targetMatch.startTime) / 1000)}`);

const context = buildContext(targetMatch);
if (!context) {
  console.error('Could not build match context (log owner not identified)');
  process.exit(1);
}

console.log('\n--- CONTEXT SENT TO AI ---\n');
console.log(context);
console.log('\n--- AI ANALYSIS ---\n');

if (!apiKey) {
  console.error('ANTHROPIC_API_KEY not set — skipping AI call. Set it to get the analysis.');
  process.exit(0);
}

const client = new Anthropic({ apiKey });
const message = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: context }],
});

const text = message.content[0]?.text ?? '';
console.log(text);
