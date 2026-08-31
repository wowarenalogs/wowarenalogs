import { AtomicArenaCombat, IShuffleRound } from '@wowarenalogs/parser';
import { canUseFeature, CombatReport, features } from '@wowarenalogs/shared';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { useAppConfig } from '../../hooks/AppConfigContext';
import { useLocalCombats } from '../../hooks/LocalCombatsContext';

/**
 * Rounds of a solo shuffle arrive one at a time and are appended in play order, so the
 * rounds of the match that just finished are the trailing run of shuffle rounds with
 * consecutive sequence numbers in the same arena. A new match restarts at sequence 0,
 * which breaks the run.
 */
function trailingShuffleRounds(combats: AtomicArenaCombat[]): IShuffleRound[] {
  const rounds: IShuffleRound[] = [];
  for (let i = combats.length - 1; i >= 0; i--) {
    const combat = combats[i];
    if (combat.dataType !== 'ShuffleRound') {
      break;
    }
    const next = rounds[0];
    if (
      next &&
      (combat.sequenceNumber !== next.sequenceNumber - 1 ||
        combat.startInfo.zoneId !== next.startInfo.zoneId ||
        combat.startInfo.bracket !== next.startInfo.bracket)
    ) {
      break;
    }
    rounds.unshift(combat);
  }
  return rounds;
}

export const LatestMatchMonitor = () => {
  const localCombats = useLocalCombats();
  const { appConfig } = useAppConfig();
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);

  const latestLocalCombat = localCombats.localCombats.length
    ? localCombats.localCombats[localCombats.localCombats.length - 1]
    : null;

  const shuffleRounds = useMemo(
    () => (latestLocalCombat?.dataType === 'ShuffleRound' ? trailingShuffleRounds(localCombats.localCombats) : []),
    [localCombats.localCombats, latestLocalCombat],
  );

  // Whenever a new combat lands, jump to it - the point of this screen is the latest match.
  useEffect(() => {
    setSelectedRoundId(null);
  }, [latestLocalCombat?.id]);

  if (latestLocalCombat) {
    const selectedRound = shuffleRounds.find((r) => r.id === selectedRoundId);
    const combat = selectedRound ?? latestLocalCombat;
    return (
      <CombatReport
        combat={combat}
        matchId={combat.id}
        viewerIsOwner={true}
        shuffleRounds={shuffleRounds}
        onRoundSelected={(round) => {
          setSelectedRoundId(round.id);
        }}
      />
    );
  }

  const needs470Upgrade = !window.wowarenalogs.obs?.getEncoders;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <div className="hero">
        <div className="hero-content text-center flex flex-col pb-16">
          <h1 className="text-5xl font-bold">Ready for battle</h1>
          <p className="py-6">Please keep WoW Arena Logs running. Your latest match will be reported here.</p>
          {needs470Upgrade && (
            <button
              onClick={() => window.wowarenalogs.links?.openExternalURL('https://wowarenalogs.com/')}
              className="btn btn-error text-lg "
            >
              Critical WoW Arena Logs update available now
            </button>
          )}
          {canUseFeature(features.skipUploads, undefined, appConfig.flags) && (
            <div className="text-2xl font-bold text-red-400 badge badge-lg badge-error p-5">
              Logs are NOT being automatically uploaded to WoW Arena Logs!
            </div>
          )}
          <button
            className="btn glass btn-wide"
            onClick={() => {
              window.wowarenalogs?.logs?.importLogFiles(appConfig.wowDirectory ?? '', 'retail');
            }}
          >
            Manually import log files
          </button>
          {window.wowarenalogs.platform === 'win32' && (
            <div className="flex flex-col">
              <div className="flex flex-row items-center gap-2">
                <h1 className="text-2xl font-bold">Want to record video?</h1>
              </div>
              <Link href="/settings" className="btn btn-sm btn-outline">
                Video settings
              </Link>
            </div>
          )}
          <label htmlFor="toggle-troubleshooter" className="btn btn-link text-base-content">
            Not seeing your matches?
          </label>
          <div>
            <button
              className="btn btn-sm btn-primary text-white"
              onClick={() => {
                window.wowarenalogs.links?.openExternalURL('https://www.patreon.com/armsperson');
              }}
            >
              WoW Arena Logs is ad free, open source, and supported by the community. If you can, please consider
              supporting us on Patreon.
            </button>
          </div>
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
