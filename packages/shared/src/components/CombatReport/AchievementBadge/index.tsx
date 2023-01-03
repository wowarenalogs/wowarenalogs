import { ICombatUnit } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useEffect, useState } from 'react';

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

interface AchievementState {
  s1?: BlizApiAchievement;
  s2?: BlizApiAchievement;
  loading: boolean;
}

interface IProps {
  player: ICombatUnit;
}

export function AchievementBadge({ player }: IProps) {
  const [cheevos, setCheevos] = useState<AchievementState>({
    s1: undefined,
    s2: undefined,
    loading: true,
  });
  // const clientContext = useClientContext();
  // eslint-disable-next-line prefer-const
  const [playerName, serverName] = player.name.split('-');

  const locale = bnetLocales.includes(window.navigator.language.toLowerCase()) ? window.navigator.language : 'en-us';
  const realmId = player.id.split('-')[1];
  const region = realmIdToRegion(realmId);

  useEffect(() => {
    const fetchCall = async () => {
      try {
        const s1AchievementPriorityList = [14690, 14689, 14691, 14688, 14687, 14686, 14685];
        const s2AchievementPriorityList = [14974, 14971, 14970, 14969, 14968];

        if (region && realmId) {
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
          const unitRealm = realmData.realms.find((r) =>
            _.values(r.name).some((n) => n.replace(' ', '') === serverName),
          );

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
          if (profileData.achievements && !profileData.detail) {
            const s1as = s1AchievementPriorityList
              .map((achId) => profileData.achievements?.find((li) => li.achievement.id === achId))
              .filter((a) => a);
            const s1a = s1as ? s1as[0] : undefined;
            const s2as = s2AchievementPriorityList
              .map((achId) => profileData.achievements?.find((li) => li.achievement.id === achId))
              .filter((a) => a);
            const s2a = s2as ? s2as[0] : undefined;

            setCheevos({
              s1: s1a,
              s2: s2a,
              loading: false,
            });
          } else {
            setCheevos({
              loading: false,
            });
          }
        }
      } catch (error) {
        console.log('Cheevo err', error);
        setCheevos({
          loading: false,
        });
      }
    };
    fetchCall();
  }, [region, locale, playerName, realmId, serverName]);

  if (realmId === undefined) {
    return null;
  }

  if (cheevos.s1 || cheevos.s2) {
    return (
      <>
        {cheevos.s2 && <div color={'gold'}>{cheevos.s2?.achievement.name}</div>}
        {cheevos.s1 && <div color={'gold'}>{cheevos.s1?.achievement.name}</div>}
      </>
    );
  } else {
    if (cheevos.loading && region) {
      return (
        <div color="gold">
          <div>LOADING SPINNER</div>
        </div>
      );
    }
    return null;
  }
}

// Data from Blizz Api re: Achievements

/*

achievement: {key: {…}, name: "Combatant: Shadowlands Season 1", id: 14685}
completed_timestamp: 1607471770000
criteria: {id: 87827, amount: 2, is_completed: true}
id: 14685
__proto__: Object
10:
achievement: {key: {…}, name: "Challenger: Shadowlands Season 1", id: 14686}
completed_timestamp: 1607473446000
criteria: {id: 87831, amount: 2, is_completed: true}
id: 14686
__proto__: Object
11:
achievement: {key: {…}, name: "Rival: Shadowlands Season 1", id: 14687}
completed_timestamp: 1607499014000
criteria: {id: 87835, amount: 2, is_completed: true}
id: 14687
__proto__: Object
12:
achievement: {key: {…}, name: "Duelist: Shadowlands Season 1", id: 14688}
completed_timestamp: 1607583284000
criteria: {id: 87839, amount: 2, is_completed: true}
id: 14688
__proto__: Object
  achievement: {key: {…}, name: "Elite: Shadowlands Season 1", id: 14691}
completed_timestamp: 1607663520000
criteria: {id: 87845, amount: 2, is_completed: true}
id: 14691
__proto__: Object


13:
achievement: {key: {…}, name: "Gladiator: Shadowlands Season 1", id: 14689}
completed_timestamp: 1608006604000
criteria: {id: 87843, is_completed: true, child_criteria: Array(1)}
id: 14689
__proto__: Object
14:
achievement: {key: {…}, name: "Sinful Gladiator: Shadowlands Season 1", id: 14690}
completed_timestamp: 1626200684000
id: 14690


  achievement: {key: {…}, name: "Combatant: Shadowlands Season 2", id: 14968}
completed_timestamp: 1625644111000
criteria: {id: 91100, amount: 2, is_completed: true}
id: 14968
__proto__: Object
20:
achievement: {key: {…}, name: "Challenger: Shadowlands Season 2", id: 14969}
completed_timestamp: 1625645763000
criteria: {id: 91104, amount: 2, is_completed: true}
id: 14969
__proto__: Object
21:
achievement: {key: {…}, name: "Rival: Shadowlands Season 2", id: 14970}
completed_timestamp: 1625708563000
criteria: {id: 91108, amount: 2, is_completed: true}
id: 14970
__proto__: Object
22:
achievement: {key: {…}, name: "Duelist: Shadowlands Season 2", id: 14971}
completed_timestamp: 1625816549000
criteria: {id: 91112, amount: 2, is_completed: true}
id: 14971
__proto__: Object
23:
achievement: {key: {…}, name: "Elite: Shadowlands Season 2", id: 14974}
completed_timestamp: 1625996693000
criteria: {id: 91118, amount: 2, is_completed: true}
id: 14974
__proto__: Object
  */
