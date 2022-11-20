/* eslint-disable no-console */
import { IArenaMatch, IShuffleRound } from '@wowarenalogs/parser';
import { logAnalyticsEvent, uploadCombatAsync, useAuth } from '@wowarenalogs/shared';
import React, { useContext, useEffect, useState } from 'react';

import { useAppConfig } from '../AppConfigContext';

type ParserCombatData = IArenaMatch | IShuffleRound;

interface ILocalCombatsContextData {
  localCombats: ParserCombatData[];
  appendCombat: (combat: ParserCombatData) => void;
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
  const [combats, setCombats] = useState<ParserCombatData[]>([]);
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
            uploadCombatAsync(combat, auth.userId);

            // console.log('combatMonitorEffect.handleNewCombat', combat);
            // TODO: a more robust way of making sure the handlers only sign up for a single version
            setCombats((prev) => {
              return prev.concat([combat]);
            });
          }
      });

      window.wowarenalogs.logs?.handleSoloShuffleRoundEnded((_event, combat) => {
        if (wowVersion === combat.wowVersion) {
          console.log(`${wowVersion} ShuffleRoundEnded Round ${combat.sequenceNumber}, killed: ${combat.killedUnitId}`);
          setCombats((prev) => {
            return prev.concat([combat]);
          });
        }
      });

      window.wowarenalogs.logs?.handleSoloShuffleEnded((_event, combat) => {
        if (wowVersion === combat.wowVersion) {
          console.log('ShuffleEnded');
          console.log(combat);
          uploadCombatAsync(combat, auth.userId);
        }
      });

      window.wowarenalogs.logs?.handleMalformedCombatDetected((_event, combat) => {
        if (wowVersion === combat.wowVersion) {
          console.log('Malformed combat');
          console.log(combat);
        }
      });

      return () => {
        window.wowarenalogs.logs?.stopLogWatcher();
        window.wowarenalogs.logs?.removeAll_handleNewCombat_listeners();
        window.wowarenalogs.logs?.removeAll_handleMalformedCombatDetected_listeners();
        window.wowarenalogs.logs?.removeAll_handleSoloShuffleEnded_listeners();
        window.wowarenalogs.logs?.removeAll_handleSoloShuffleRoundEnded_listeners();
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
