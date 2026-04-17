'use client';

import { CombatUnitSpec } from '@wowarenalogs/parser';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { TbChevronDown, TbChevronRight, TbSearch } from 'react-icons/tb';

import spellClassMap from '../../data/spellClassMap.json';
import rawSpellEffects from '../../data/spellEffects.json';
import { Utils } from '../../utils/utils';
import { SpellIcon } from '../CombatReport/SpellIcon';

/** Spell IDs that are known to have icons (present in spellEffects data). */
const KNOWN_ICON_IDS = new Set(Object.keys(rawSpellEffects));

// ── Types ──────────────────────────────────────────────────────────

interface SpellEntry {
  spellId: string;
  name: string;
  specIds?: string[];
}

interface UnresolvedEntry {
  spellId: string;
  name: string;
  category: string;
  talentSpellIds: string[];
  talentSpecIds: string[];
}

interface CategoryDef {
  key: string;
  label: string;
  description: string;
  spells: SpellEntry[];
}

// ── Data ───────────────────────────────────────────────────────────

/** Map specId → class name (e.g. "65" → "Paladin") */
const SPEC_TO_CLASS: Record<string, string> = {};
const SPEC_TO_NAME: Record<string, string> = {};
for (const key of Object.keys(CombatUnitSpec)) {
  const specId = CombatUnitSpec[key as keyof typeof CombatUnitSpec];
  if (specId === '0') continue;
  const parts = key.split('_');
  SPEC_TO_CLASS[specId] = parts[0];
  SPEC_TO_NAME[specId] = parts.reverse().join(' ');
}

/** Ordered categories to display */
const CATEGORIES: CategoryDef[] = [
  {
    key: 'bigDefensive',
    label: 'Major Defensives',
    description: 'Powerful personal defensive cooldowns that significantly reduce incoming damage or prevent death.',
    spells: spellClassMap.bigDefensive,
  },
  {
    key: 'externalDefensive',
    label: 'External Defensives',
    description: 'Defensive abilities that can be cast on allies to protect them.',
    spells: spellClassMap.externalDefensive,
  },
  {
    key: 'important',
    label: 'Important Cooldowns',
    description: 'Major offensive and utility cooldowns that significantly impact the flow of a match.',
    spells: spellClassMap.important,
  },
  {
    key: 'interrupts',
    label: 'Interrupts',
    description: 'Abilities that interrupt enemy spell casts and lock out their spell school.',
    spells: spellClassMap.interrupts,
  },
  {
    key: 'stun',
    label: 'Stuns',
    description: 'Crowd control that completely incapacitates the target. Shares diminishing returns with other stuns.',
    spells: (spellClassMap.diminishingReturns as Record<string, SpellEntry[]>)['stun'] ?? [],
  },
  {
    key: 'incapacitate',
    label: 'Incapacitates',
    description:
      'Crowd control that disables the target but breaks on damage. Shares diminishing returns with other incapacitates.',
    spells: (spellClassMap.diminishingReturns as Record<string, SpellEntry[]>)['incapacitate'] ?? [],
  },
  {
    key: 'disorient',
    label: 'Disorients',
    description:
      'Crowd control that disorients the target, breaking on damage. Shares diminishing returns with other disorients.',
    spells: (spellClassMap.diminishingReturns as Record<string, SpellEntry[]>)['disorient'] ?? [],
  },
  {
    key: 'silence',
    label: 'Silences',
    description: 'Prevents the target from casting spells for a short duration.',
    spells: (spellClassMap.diminishingReturns as Record<string, SpellEntry[]>)['silence'] ?? [],
  },
  {
    key: 'root',
    label: 'Roots',
    description: 'Immobilizes the target in place. The target can still cast spells and attack.',
    spells: (spellClassMap.diminishingReturns as Record<string, SpellEntry[]>)['root'] ?? [],
  },
  {
    key: 'disarm',
    label: 'Disarms',
    description: 'Prevents the target from using their weapon for a short duration.',
    spells: (spellClassMap.diminishingReturns as Record<string, SpellEntry[]>)['disarm'] ?? [],
  },
  {
    key: 'knockback',
    label: 'Knockbacks',
    description: 'Displaces the target from their current position.',
    spells: (spellClassMap.diminishingReturns as Record<string, SpellEntry[]>)['knockback'] ?? [],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────

const VALID_SPEC_IDS = new Set(Object.values(CombatUnitSpec) as string[]);

/** Deduplicate spell entries by name, preferring IDs with known icons. */
function dedupByName(entries: SpellEntry[]): SpellEntry[] {
  const byName = new Map<string, SpellEntry>();
  for (const s of entries) {
    const existing = byName.get(s.name);
    if (!existing) {
      byName.set(s.name, s);
    } else if (KNOWN_ICON_IDS.has(s.spellId) && !KNOWN_ICON_IDS.has(existing.spellId)) {
      byName.set(s.name, s);
    }
  }
  return Array.from(byName.values());
}

interface ClassGroup {
  className: string;
  classWideSpells: SpellEntry[];
  specGroups: { specName: string; specId: string; spells: SpellEntry[] }[];
}

/** Group spells by WoW class from their specIds, deduplicating by name within each spec. */
function groupByClass(spells: SpellEntry[]): ClassGroup[] {
  const classMap = new Map<string, Map<string, SpellEntry[]>>();

  for (const spell of spells) {
    if (!spell.specIds || spell.specIds.length === 0) continue;
    for (const specId of spell.specIds) {
      // Skip hero specs not in our enum — they duplicate base spec spells
      if (!VALID_SPEC_IDS.has(specId)) continue;
      const className = SPEC_TO_CLASS[specId] ?? 'Unknown';
      if (!classMap.has(className)) classMap.set(className, new Map());
      const specMap = classMap.get(className) as Map<string, SpellEntry[]>;
      if (!specMap.has(specId)) specMap.set(specId, []);
      (specMap.get(specId) as SpellEntry[]).push(spell);
    }
  }

  return Array.from(classMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([className, specMap]) => {
      // Determine which spell names appear in every spec represented for this
      // class in the current category. Those bubble up to a class-wide section.
      // Require at least 2 specs to be meaningful — a single-spec class group
      // shouldn't have anything bubbled up.
      const classSpecIds = Array.from(specMap.keys());
      const presenceByName = new Map<string, { spell: SpellEntry; specs: Set<string> }>();
      specMap.forEach((specSpells, specId) => {
        for (const s of specSpells) {
          let entry = presenceByName.get(s.name);
          if (!entry) {
            entry = { spell: s, specs: new Set() };
            presenceByName.set(s.name, entry);
          } else if (KNOWN_ICON_IDS.has(s.spellId) && !KNOWN_ICON_IDS.has(entry.spell.spellId)) {
            entry.spell = s;
          }
          entry.specs.add(specId);
        }
      });

      const sharedNames = new Set<string>();
      const classWideRaw: SpellEntry[] = [];
      if (classSpecIds.length >= 2) {
        presenceByName.forEach((entry, name) => {
          if (entry.specs.size === classSpecIds.length) {
            sharedNames.add(name);
            classWideRaw.push(entry.spell);
          }
        });
      }
      const classWideSpells = dedupByName(classWideRaw).sort((a, b) => a.name.localeCompare(b.name));

      const specGroups = Array.from(specMap.entries())
        .sort(([, a], [, b]) => a[0]?.name.localeCompare(b[0]?.name))
        .map(([specId, specSpells]) => {
          const filtered = specSpells.filter((s) => !sharedNames.has(s.name));
          return {
            specName: SPEC_TO_NAME[specId] ?? specId,
            specId,
            spells: dedupByName(filtered).sort((a, b) => a.name.localeCompare(b.name)),
          };
        })
        .filter((g) => g.spells.length > 0);

      return { className, classWideSpells, specGroups };
    });
}

// ── Components ──────────────────────────────────────────────────────

function SpecIcon({ specId, size }: { specId: string; size: number }) {
  if (!VALID_SPEC_IDS.has(specId)) return null;
  const iconUrl = Utils.getSpecIcon(specId as CombatUnitSpec);
  if (!iconUrl) return null;
  return <Image className="rounded" src={iconUrl} alt={SPEC_TO_NAME[specId] ?? ''} width={size} height={size} />;
}

function SpellRow({ spell }: { spell: SpellEntry }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <SpellIcon spellId={spell.spellId} size={28} />
      <span className="text-sm">{spell.name}</span>
    </div>
  );
}

function CategorySection({ category, searchQuery }: { category: CategoryDef; searchQuery: string }) {
  const [expanded, setExpanded] = useState(false);

  const filteredSpells = useMemo(() => {
    if (!searchQuery) return category.spells;
    const q = searchQuery.toLowerCase();
    return category.spells.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.specIds?.some(
          (id) =>
            (SPEC_TO_NAME[id] ?? '').toLowerCase().includes(q) || (SPEC_TO_CLASS[id] ?? '').toLowerCase().includes(q),
        ),
    );
  }, [category.spells, searchQuery]);

  const grouped = useMemo(() => groupByClass(filteredSpells), [filteredSpells]);
  const hasSpecData = filteredSpells.some((s) => s.specIds && s.specIds.length > 0);

  // Auto-expand when searching
  const isExpanded = expanded || searchQuery.length > 0;

  if (filteredSpells.length === 0) return null;

  return (
    <div className="bg-base-200 rounded-lg">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 hover:bg-base-300/50 rounded-lg transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-base-content/40">
          {isExpanded ? <TbChevronDown size={16} /> : <TbChevronRight size={16} />}
        </span>
        <div className="flex-1 text-left">
          <div className="font-semibold">{category.label}</div>
          <div className="text-xs text-base-content/60">{category.description}</div>
        </div>
        <span className="badge badge-ghost badge-sm">{filteredSpells.length}</span>
      </button>
      {isExpanded && hasSpecData && (
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {grouped.map(({ className, classWideSpells, specGroups }) => (
            <div key={className} className="bg-base-300/40 rounded-lg p-3">
              <div className="font-semibold text-sm mb-2 text-base-content/80">{className}</div>
              {classWideSpells.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs text-base-content/60 mb-1 italic">All specs</div>
                  <div className="pl-1">
                    {classWideSpells.map((spell) => (
                      <SpellRow key={spell.spellId} spell={spell} />
                    ))}
                  </div>
                </div>
              )}
              {specGroups.map(({ specName, specId, spells }) => (
                <div key={specId} className="mb-2 last:mb-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <SpecIcon specId={specId} size={16} />
                    <span className="text-xs text-base-content/60">{specName}</span>
                  </div>
                  <div className="pl-1">
                    {spells.map((spell) => (
                      <SpellRow key={spell.spellId} spell={spell} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {isExpanded && !hasSpecData && (
        <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {filteredSpells
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((spell) => (
              <SpellRow key={spell.spellId} spell={spell} />
            ))}
        </div>
      )}
    </div>
  );
}

// ── Unresolved Spells (dev only) ───────────────────────────────────

const unresolvedSpells = (spellClassMap.unresolvedSpells ?? []) as UnresolvedEntry[];

function UnresolvedSection({ searchQuery }: { searchQuery: string }) {
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(() => {
    if (!searchQuery) return unresolvedSpells;
    const q = searchQuery.toLowerCase();
    return unresolvedSpells.filter((s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
  }, [searchQuery]);

  const isExpanded = expanded || searchQuery.length > 0;

  if (filtered.length === 0) return null;

  return (
    <div className="bg-base-200 border border-warning/30 rounded-lg">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 hover:bg-base-300/50 rounded-lg transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-base-content/40">
          {isExpanded ? <TbChevronDown size={16} /> : <TbChevronRight size={16} />}
        </span>
        <div className="flex-1 text-left">
          <div className="font-semibold text-warning">Unresolved Spells (DEV)</div>
          <div className="text-xs text-base-content/60">
            Spells flagged by DB2 attributes that could not be ID-resolved to a player spec. Likely wrong spell IDs in
            Blizzard data.
          </div>
        </div>
        <span className="badge badge-warning badge-sm">{filtered.length}</span>
      </button>
      {isExpanded && (
        <div className="px-4 pb-4">
          <table className="table table-xs">
            <thead>
              <tr>
                <th>Name</th>
                <th>DB2 Spell ID</th>
                <th>Category</th>
                <th>Talent Spell ID(s)</th>
                <th>Talent Spec(s)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={`${u.spellId}-${u.category}`}>
                  <td className="font-medium">{u.name}</td>
                  <td className="font-mono text-xs">{u.spellId}</td>
                  <td className="text-xs">{u.category}</td>
                  <td className="font-mono text-xs">{u.talentSpellIds.join(', ')}</td>
                  <td className="text-xs">
                    <div className="flex items-center gap-1 flex-wrap">
                      {u.talentSpecIds.map((specId) => (
                        <span key={specId} className="flex items-center gap-0.5">
                          <SpecIcon specId={specId} size={14} />
                          <span>{SPEC_TO_NAME[specId] ?? specId}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export function SpellLibraryPage() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="flex flex-col gap-4 p-4 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold">Spell Library</h1>
        <p className="text-sm text-base-content/60 mt-1">
          Browse the spells that WoW Arena Logs tracks across all classes and specializations. This data is sourced from
          Blizzard&apos;s DB2 game data and mapped to player specializations.
        </p>
      </div>
      <div className="bg-base-200 border border-warning/30 rounded-lg px-3 py-2 text-sm text-base-content/70">
        This page is in beta. Some spells may be missing or incorrectly categorized due to inconsistencies in the
        upstream game data.
      </div>
      <div className="relative max-w-md">
        <TbSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" size={18} />
        <input
          type="text"
          className="input input-bordered w-full pl-10"
          placeholder="Search spells, classes, or specs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-3">
        {CATEGORIES.map((cat) => (
          <CategorySection key={cat.key} category={cat} searchQuery={searchQuery} />
        ))}
        {process.env.NODE_ENV === 'development' && <UnresolvedSection searchQuery={searchQuery} />}
      </div>
    </div>
  );
}
