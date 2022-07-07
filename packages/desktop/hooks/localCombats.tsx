import { ICombatData, WowVersion } from '@wowarenalogs/parser';
import { useAuth, useClientContext } from '@wowarenalogs/shared';
import React, { useContext, useEffect, useState } from 'react';

import { combatMonitorEffect } from './combatMonitorEffect';

interface ILocalCombatsContextData {
  localCombats: ICombatData[];
  appendCombat: (combat: ICombatData) => void;
}

const LocalCombatsContext = React.createContext<ILocalCombatsContextData>({
  localCombats: [],
  appendCombat: () => {
    return;
  },
});

interface IProps {
  children: React.ReactNode | React.ReactNodeArray;
}

export const LocalCombatsContextProvider = (props: IProps) => {
  const [combats, setCombats] = useState<ICombatData[]>([]);
  const auth = useAuth();
  const clientContext = useClientContext();

  const stringifiedInstallations = JSON.stringify(Array.from(clientContext.wowInstallations.entries()).sort());

  useEffect(() => {
    if (!auth.isLoadingAuthData && stringifiedInstallations) {
      const installations: [WowVersion, string][] = JSON.parse(stringifiedInstallations);
      const cleanups = installations.map((installRow) => {
        const [wowVersion, wowDirectory] = installRow;
        // console.log('Starting combat monitor: ', wowVersion);
        return combatMonitorEffect(
          wowDirectory,
          wowVersion,
          auth.userId as string,
          (combat) => {
            setCombats((prev) => {
              return prev.concat([combat]);
            });
          },
          () => {
            setCombats([]);
          },
        );
      });
      return () => {
        // console.log('Stopping combat monitors');
        cleanups.forEach((cleanup) => {
          cleanup();
        });
      };
    }
  }, [stringifiedInstallations, auth.isLoadingAuthData, auth.userId]);

  return (
    <LocalCombatsContext.Provider
      value={{
        localCombats: combats,
        appendCombat: (combat) => {
          setCombats((prev) => {
            return prev.concat(combat);
          });
        },
      }}
    >
      {props.children}
    </LocalCombatsContext.Provider>
  );
};

export const useLocalCombatsContext = () => {
  const contextData = useContext(LocalCombatsContext);
  return contextData;
};
