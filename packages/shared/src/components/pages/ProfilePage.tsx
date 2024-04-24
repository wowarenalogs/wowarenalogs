import { CombatUnitSpec, getClassColor } from '@wowarenalogs/parser';
import { LoadingScreen, useAuth, useGetUserCharactersQuery } from '@wowarenalogs/shared';
import _ from 'lodash';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { TbLoader } from 'react-icons/tb';

import { Utils } from '../../utils/utils';
import { CharacterStats } from '../CharacterStats/CharacterStats';
import { LogoutButton } from '../common/LogoutButton';
import { QuerryError } from '../common/QueryError';

export const ProfilePage = (props: { onLogout?: () => Promise<void> }) => {
  const auth = useAuth();
  const router = useRouter();
  const userCharactersQuery = useGetUserCharactersQuery();
  const [activeCharacterId, setActiveCharacterId] = useState<string>('overview');

  const characterGroups = useMemo(() => {
    return _.map(
      _.groupBy(userCharactersQuery.data?.myCharacters ?? [], (c) => c.guid),
      (characters, guid) => {
        return {
          guid,
          name: characters[0].characterName,
          classId: Utils.getSpecClass(characters[0].specId as CombatUnitSpec),
          specs: characters,
        };
      },
    );
  }, [userCharactersQuery.data?.myCharacters]);

  if (auth.isLoadingAuthData) {
    return <LoadingScreen />;
  }

  if (!auth.isAuthenticated) {
    router.push('/');
    return null;
  }

  return (
    <div className="flex flex-col p-2 gap-2 min-h-screen">
      <div className="flex flex-row justify-between">
        <div className="text-2xl font-bold mb-2">{auth.battleTag}</div>
        <LogoutButton onLogout={props.onLogout} />
      </div>
      {userCharactersQuery.error ? (
        <QuerryError query={userCharactersQuery} />
      ) : userCharactersQuery.loading ? (
        <div className="flex flex-row items-center justify-center animate-loader h-[300px]">
          <TbLoader color="gray" size={60} className="animate-spin-slow" />
        </div>
      ) : (
        <div className="flex flex-row flex-1 relative">
          <div className="flex flex-col">
            <ul className="menu mr-2 min-w-fit sticky top-0">
              <li className={`${activeCharacterId === 'overview' ? 'bordered' : ''}`}>
                <a
                  className="flex flex-row"
                  onClick={() => {
                    setActiveCharacterId('overview');
                  }}
                >
                  <div className={`flex flex-row items-center flex-1`}>
                    <span className={`font-bold flex-1 text-ellipsis overflow-hidden whitespace-nowrap uppercase`}>
                      Overview
                    </span>
                  </div>
                </a>
              </li>
              {characterGroups.map((c) => (
                <li key={c.guid} className={`${activeCharacterId === c.guid ? 'bordered' : ''}`}>
                  <a
                    className="flex flex-row"
                    onClick={() => {
                      setActiveCharacterId(c.guid);
                    }}
                  >
                    <div className="flex flex-row items-center flex-1 gap-1">
                      <span
                        className={`font-bold flex-1 text-ellipsis overflow-hidden whitespace-nowrap`}
                        style={{
                          color: getClassColor(c.classId),
                        }}
                      >
                        {c.name}
                      </span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          {activeCharacterId === 'overview' && userCharactersQuery.data?.myCharacters && (
            <CharacterStats specs={userCharactersQuery.data?.myCharacters} />
          )}
          {characterGroups.map((c) => activeCharacterId === c.guid && <CharacterStats key={c.guid} specs={c.specs} />)}
        </div>
      )}
    </div>
  );
};
