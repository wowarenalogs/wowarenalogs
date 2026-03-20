/* eslint-disable @next/next/no-img-element */
import { ICombatUnit } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useQuery } from 'react-query';

import { bnetLocales, realmIdToRegion } from '../../../utils/realms';

interface BlizApiAchievement {
  achievement: {
    id: number;
    key: {
      href: string;
    };
    name: string;
  };
  completed_timestamp: number;
  criteria: {
    amount: number;
    id: number;
    is_completed: boolean;
  };
  id: number;
}
interface BlizApiAchievementsResponse {
  detail?: string; // error message
  achievements?: BlizApiAchievement[];
}

interface BlizRealm {
  id: number;
  slug: string;
  name: Record<string, string>;
}
interface BlizRealmResults {
  realms: BlizRealm[];
}
const PVP_RANK_PATTERN = /(?:Combatant|Challenger|Rival|Duelist|Elite|Gladiator|Legend)(?: I{1,2})?:/;

const PVP_TIER: Record<string, number> = {
  Combatant: 1,
  Challenger: 2,
  Rival: 3,
  Duelist: 4,
  Elite: 5,
  Gladiator: 6,
  Legend: 7,
};

// Blizzard CDN icons for each PvP tier bracket (56x56 JPG)
const PVP_TIER_ICON: Record<number, string> = {
  1: 'https://render.worldofwarcraft.com/us/icons/56/ui_rankedpvp_02.jpg',
  2: 'https://render.worldofwarcraft.com/us/icons/56/ui_rankedpvp_03.jpg',
  3: 'https://render.worldofwarcraft.com/us/icons/56/ui_rankedpvp_04.jpg',
  4: 'https://render.worldofwarcraft.com/us/icons/56/ui_rankedpvp_05.jpg',
  5: 'https://render.worldofwarcraft.com/us/icons/56/ui_rankedpvp_06.jpg',
  6: 'https://render.worldofwarcraft.com/us/icons/56/ui_rankedpvp_06.jpg',
  7: 'https://render.worldofwarcraft.com/us/icons/56/ui_rankedpvp_06.jpg',
};

function getPvpTier(name: string): number {
  for (const [title, tier] of Object.entries(PVP_TIER)) {
    if (name.includes(title)) return tier;
  }
  return 0;
}

function getSeasonKey(name: string): string {
  const colonIdx = name.indexOf(':');
  return colonIdx >= 0 ? name.slice(colonIdx + 1).trim() : name;
}

interface IProps {
  player: ICombatUnit;
}

async function fetchAchievements(
  playerName: string,
  serverName: string,
  locale: string,
  realmId: string,
  region: string,
) {
  // Call Blizzard API to figure out the slug name of the realmId (needed for profile query)
  const realmDataCall = await fetch(
    `/api/blizzard/${region}/data/wow/connected-realm/${realmId}?namespace=dynamic-${region}&locale=${locale}`,
  );
  if (!realmDataCall.ok) {
    throw new Error(`Connected realm lookup failed: ${realmDataCall.status}`);
  }
  const realmData: BlizRealmResults = await realmDataCall.json();
  // Multiple realms are returned in these requests because the servers are clustered
  // Look up the Realm based on a match to any of the region-localized names
  // We can't use RealmId because RealmId always refers to the root-realm for the realm cluster
  // Also -- spaces are omitted for server names in the log so we must strip them from the api result
  const unitRealm = realmData.realms.find((r) => _.values(r.name).some((n) => n.replace(' ', '') === serverName));

  if (!unitRealm) {
    throw new Error('Cannot find realm');
  }

  const profileCall = await fetch(
    `/api/blizzard/${region}/profile/wow/character/${
      unitRealm.slug
    }/${playerName.toLowerCase()}/achievements?namespace=profile-${region}&locale=${locale}`,
    {
      headers: {
        Accept: 'application/json',
      },
    },
  );
  if (!profileCall.ok) {
    throw new Error(`Profile lookup failed: ${profileCall.status}`);
  }

  const profileData: BlizApiAchievementsResponse = await profileCall.json();
  return profileData;
}

const DISPLAY_LIMIT = 3;

export function AchievementBadge({ player }: IProps) {
  const [playerName, serverName] = player.name.split('-');

  const locale = bnetLocales.includes(window.navigator.language.toLowerCase()) ? window.navigator.language : 'en-us';
  const realmId = player.id.split('-')[1];
  const region = realmIdToRegion(realmId);

  const achievementsQuery = useQuery(['achievements', player.id], async () => {
    return await fetchAchievements(playerName, serverName, locale, realmId, region);
  });

  if (realmId === undefined) {
    return null;
  }

  if (achievementsQuery.isLoading) {
    return (
      <div className="flex flex-row gap-1 animate-fadein">
        <div className="w-6 h-6 rounded-full bg-base-300 animate-pulse"></div>
        <div className="w-6 h-6 rounded-full bg-base-300 animate-pulse"></div>
        <div className="w-6 h-6 rounded-full bg-base-300 animate-pulse"></div>
      </div>
    );
  }

  const data = achievementsQuery.data?.achievements || [];

  if (data.length === 0) {
    return null;
  }

  const pvpAchievements = data
    .filter((a) => a.criteria?.is_completed)
    .filter((a) => PVP_RANK_PATTERN.test(a.achievement.name))
    .filter((a) => !a.achievement.name.includes('Keystone'));

  // Group by season (text after the colon), take highest PvP tier per season
  const bySeason = _.groupBy(pvpAchievements, (a) => getSeasonKey(a.achievement.name));
  const historical = _.map(bySeason, (achievements) => _.maxBy(achievements, (a) => getPvpTier(a.achievement.name)))
    .filter((a): a is BlizApiAchievement => a !== undefined)
    .sort((a, b) => b.completed_timestamp - a.completed_timestamp)
    .slice(0, DISPLAY_LIMIT);

  return (
    <div className="flex flex-row gap-1 animate-fadein">
      {historical.map((a) => {
        const tier = getPvpTier(a.achievement.name);
        const icon = PVP_TIER_ICON[tier];
        return (
          <div className="tooltip" data-tip={a.achievement.name} key={a.id}>
            <img src={icon} alt={a.achievement.name} className="w-6 h-6 rounded-full ring-1 ring-base-content/20" />
          </div>
        );
      })}
    </div>
  );
}
