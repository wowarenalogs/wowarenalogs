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
  const realmData: BlizRealmResults = await realmDataCall.json();
  // Multiple realms are returned in these requests because the servers are clustered
  // Look up the Realm based on a match to any of the region-localized names
  // We can't use RealmId because RealmId always refers to the root-realm for the realm cluster
  // Yes it's really this bad
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

  // Call blizzard api for cheevos data
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
      <div className="flex flex-row mt-1 gap-1 animate-fadein">
        <div className="badge badge-sm badge-secondary w-[200px] animate-pulse"></div>
        <div className="badge badge-sm badge-secondary w-[200px] animate-pulse"></div>
        <div className="badge badge-sm badge-secondary w-[200px] animate-pulse"></div>
      </div>
    );
  }

  const data = achievementsQuery.data?.achievements || [];

  // prevent layout shift
  if (data.length === 0) {
    return (
      <div className="flex flex-row mt-1 animate-fadein">
        <div className="badge badge-sm badge-info opacity-80">No achievements!</div>
      </div>
    );
  }

  // Filter for pvp relevant achievements
  // sorting by .id is a strong proxy for sorting by xpac
  const achievementsToShow = data
    .filter((a) => a.achievement.name.includes(' Season '))
    .filter((a) => !a.achievement.name.includes(' Keystone '))
    .filter((a) => !a.achievement.name.includes('Hero'))
    .sort((a, b) => b.id - a.id)
    .slice(0, 50);

  // Groups by season + xpac
  // assumes expansions are unique by suffixes of len 11
  const SUFFIX_LENGTH = 20;
  const grouping = _.groupBy(achievementsToShow, (a) =>
    a.achievement.name.slice(a.achievement.name.length - SUFFIX_LENGTH, a.achievement.name.length),
  );

  // Flatten, taking only the best achievement (highest id) they got in each season
  const historical = _.flatMap(grouping, (a) => a[0]).slice(0, DISPLAY_LIMIT);

  return (
    <div className="flex flex-row gap-1 mt-1 animate-fadein">
      {historical?.map((a) => {
        if (a.achievement.name.includes('Gladiator')) {
          <div className="badge badge-sm badge-primary" key={a.id}>
            {a.achievement.name}
          </div>;
        }
        return (
          <div className="badge badge-sm badge-secondary" key={a.id}>
            {a.achievement.name}
          </div>
        );
      })}
    </div>
  );
}
