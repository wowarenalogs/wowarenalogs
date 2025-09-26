import { canUseFeature, CombatReport, features } from '@wowarenalogs/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAppConfig } from '../../hooks/AppConfigContext';
import { useLocalCombats } from '../../hooks/LocalCombatsContext';

export const LatestMatchMonitor = () => {
  const localCombats = useLocalCombats();
  const { appConfig } = useAppConfig();
  const [diskSpaceRemaining, setDiskSpaceRemaining] = useState(-1);

  const latestLocalCombat = localCombats.localCombats.length
    ? localCombats.localCombats[localCombats.localCombats.length - 1]
    : null;

  useEffect(() => {
    window.wowarenalogs.obs?.diskSpaceBecameCritical?.((_evt, freeBytes) => setDiskSpaceRemaining(freeBytes));
    return () => window.wowarenalogs.obs?.removeAll_diskSpaceBecameCritical_listeners?.();
  }, []);

  if (latestLocalCombat) {
    return <CombatReport combat={latestLocalCombat} matchId={latestLocalCombat.id} viewerIsOwner={true} />;
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
          {diskSpaceRemaining > -1 && (
            <div className="text-2xl font-bold text-red-400 badge badge-lg badge-error p-5">
              You have only {(diskSpaceRemaining / 1e6).toFixed(1)} Mbytes disk space remaining. Vods may fail to
              record!{' '}
              <button className="button pl-2" onClick={() => setDiskSpaceRemaining(-1)}>
                dismiss
              </button>
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
              <Link href="/settings">
                <button className="btn btn-sm btn-outline">Video settings</button>
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
