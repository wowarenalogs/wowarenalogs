import { CombatReport } from '@wowarenalogs/shared';

import { useAppConfig } from '../../hooks/AppConfigContext';
import { useLocalCombats } from '../../hooks/LocalCombatsContext';

export const LatestMatchMonitor = () => {
  const localCombats = useLocalCombats();
  const { appConfig } = useAppConfig();

  const latestLocalCombat = localCombats.localCombats.length
    ? localCombats.localCombats[localCombats.localCombats.length - 1]
    : null;

  if (latestLocalCombat) {
    return <CombatReport combat={latestLocalCombat} matchId={latestLocalCombat.id} />;
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <div className="hero">
        <div className="hero-content text-center flex flex-col pb-16">
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
          <label htmlFor="toggle-troubleshooter" className="btn btn-link text-base-content">
            Not seeing your matches?
          </label>
        </div>
      </div>
      <input type="checkbox" id="toggle-troubleshooter" className="modal-toggle" />
      <label htmlFor="toggle-troubleshooter" className="modal">
        <label className="modal-box prose relative" htmlFor="">
          <h3>Troubleshoot</h3>
          <p>Please try the following steps if you don&apos;t see your matches show up.</p>
          <ul>
            <li>Restart WoW if it&apos;s currently running.</li>
            <li>Check the list of addons in your WoW, and make sure WoW Arena Logs is enabled there.</li>
            <li>Play arena and new matches should now start to show up.</li>
          </ul>
          <p>
            If you continue to have trouble seeing your matches, please report in our{' '}
            <a
              href="#"
              onClick={() => {
                window.wowarenalogs?.links?.openExternalURL('https://discord.gg/NFTPK9tmJK');
              }}
            >
              discord server
            </a>{' '}
            and we will assist you there!
          </p>
          <div className="modal-action">
            <label htmlFor="toggle-troubleshooter" className="btn">
              Done
            </label>
          </div>
        </label>
      </label>
    </div>
  );
};
