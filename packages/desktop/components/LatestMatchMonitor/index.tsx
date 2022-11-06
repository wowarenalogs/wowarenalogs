import { CombatReport } from '@wowarenalogs/shared';

import { useAppConfig } from '../../hooks/AppConfigContext';
import { useLocalCombats } from '../../hooks/LocalCombatsContext';

export const LatestMatchMonitor = () => {
  const localCombats = useLocalCombats();
  const { appConfig } = useAppConfig();

  const latestLocalCombat = localCombats.localCombats.length
    ? localCombats.localCombats[localCombats.localCombats.length - 1]
    : null;

  switch (latestLocalCombat?.dataType) {
    case 'Combat':
      return <CombatReport id={latestLocalCombat.id} combat={latestLocalCombat} />;
    case 'Shuffle':
      return <div>shuffle {latestLocalCombat.id}</div>;
    case 'ShuffleRound':
    case undefined:
      return (
        <div className="w-full h-full flex flex-col items-center justify-center">
          <div className="hero">
            <div className="hero-content text-center flex flex-col">
              <h1 className="text-5xl font-bold">Ready for battle</h1>
              <p className="py-6">Please keep WoW Arena Logs running. Your latest match will be reported here.</p>
              <button
                className="btn glass btn-wide"
                onClick={() => {
                  window.wowarenalogs?.logs?.importLogFiles(appConfig.wowDirectory ?? '', 'retail');
                }}
              >
                Manually import log files
              </button>
            </div>
          </div>
        </div>
      );
  }
};
