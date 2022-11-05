/* eslint-disable no-console */
import { ICombatData } from '@wowarenalogs/parser';
import { logAnalyticsEvent, useAuth } from '@wowarenalogs/shared';
import React, { useContext, useEffect, useState } from 'react';

import { useAppConfig } from '../AppConfigContext';

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
  children: React.ReactNode | React.ReactNode[];
}

export const LocalCombatsContextProvider = (props: IProps) => {
  const [combats, setCombats] = useState<ICombatData[]>([]);
  const auth = useAuth();
  const { wowInstallations } = useAppConfig();

  useEffect(() => {
    const cleanups = Array.from(wowInstallations.entries()).map((installRow) => {
      const [wowVersion, wowDirectory] = installRow;
      window.wowarenalogs.logs?.startLogWatcher(wowDirectory, wowVersion);

      window.wowarenalogs.logs?.handleNewCombat((_event, combat) => {
        if (
          window.wowarenalogs.app?.getIsPackaged().then((isPackaged) => {
            if (isPackaged) {
              logAnalyticsEvent('event_NewMatchProcessed', {
                wowVersion: combat.wowVersion,
              });
            }
          })
        )
          if (wowVersion === combat.wowVersion) {
            // TODO: write upload utiltiy
            // SharedUtils.uploadCombatAsync(combat, userId);

            // console.log('combatMonitorEffect.handleNewCombat', combat);
            // TODO: a more robust way of making sure the handlers only sign up for a single version
            setCombats((prev) => {
              return prev.concat([combat]);
            });
          }
      });

      window.wowarenalogs.logs?.handleSoloShuffleRoundEnded((_event, combat) => {
        if (wowVersion === combat.wowVersion) {
          console.log(
            `${wowVersion} ShuffleRoundEnded Round ${combat.sequenceNumber}, killed: ${combat.roundEndInfo.killedUnitId}`,
          );
        }
      });

      window.wowarenalogs.logs?.handleSoloShuffleEnded((_event, combat) => {
        if (wowVersion === combat.wowVersion) {
          console.log('ShuffleEnded');
          console.log(combat);
        }
      });

      window.wowarenalogs.logs?.handleMalformedCombatDetected((_event, combat) => {
        if (wowVersion === combat.wowVersion) {
          console.log(wowVersion);
          console.log('Malformed combat');
          console.log(combat);
        }
      });

      return () => {
        window.wowarenalogs.logs?.stopLogWatcher();
        window.wowarenalogs.logs?.removeAll_handleNewCombat_listeners();
        setCombats([]);
      };
    });
    return () => {
      cleanups.forEach((cleanup) => {
        cleanup();
      });
    };
  }, [wowInstallations, auth.userId]);

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

export const useLocalCombats = () => {
  return useContext(LocalCombatsContext);
};
