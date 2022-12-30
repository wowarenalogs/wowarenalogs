import { AtomicArenaCombat } from '@wowarenalogs/parser';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { FaShare } from 'react-icons/fa';
import { TbChevronLeft, TbCopy, TbDownload, TbX } from 'react-icons/tb';

import { useGetProfileQuery } from '../../graphql/__generated__/graphql';
import { useClientContext } from '../../hooks/ClientContext';
import { logAnalyticsEvent } from '../../utils/analytics';
import { TimestampDisplay } from '../common/TimestampDisplay';
import { CombatCurves } from './CombatCurves';
import { CombatDeathReports } from './CombatDeathReports';
import { CombatLogView } from './CombatLogView';
import { CombatPlayers } from './CombatPlayers';
import { CombatReportContextProvider, useCombatReportContext } from './CombatReportContext';
import { CombatSummary } from './CombatSummary';

const CombatReplay = dynamic(
  () => {
    const promise = import('./CombatReplay').then((mod) => mod.CombatReplay);
    return promise;
  },
  { ssr: false },
);

interface IProps {
  combat: AtomicArenaCombat;
  anon?: boolean;
}

export const CombatReportInternal = () => {
  const router = useRouter();
  const { data: user } = useGetProfileQuery();
  const { combat, activeTab, setActiveTab } = useCombatReportContext();
  const clientContext = useClientContext();

  const [urlCopied, setUrlCopied] = useState(false);
  const reportUrl = useMemo(() => {
    const url = `https://wowarenalogs.com/match?id=${combat?.id}`;
    return url;
  }, [combat]);

  const [dismissedDownloadPromo, setDismissedDownloadPromo] = useState(false);

  useEffect(() => {
    setDismissedDownloadPromo(localStorage.getItem('dismissedDownloadPromo') === 'true');
  }, []);

  useEffect(() => {
    if (combat) {
      // following predefined schema by google analytics convention.
      // see https://developers.google.com/analytics/devguides/collection/ga4/reference/events?client_type=gtag#select_content
      logAnalyticsEvent('select_content', {
        content_type: combat.startInfo.bracket,
        item_id: combat.id,
      });
    }
  }, [combat]);

  if (!combat) return null;

  const sequence = combat.dataType === 'ShuffleRound' ? combat.sequenceNumber + 1 : null;

  return (
    <div className="w-full h-full flex flex-col p-2 animate-fadein">
      {!clientContext.isDesktop && !dismissedDownloadPromo && (
        <div className="mb-2 relative">
          <div className="alert alert-info shadow-lg">
            <div>
              <TbDownload className="text-xl" />
              Get WoW Arena Logs and start analyzing your own arena matches today!
            </div>
            <div className="flex-none">
              <Link href="/">
                <a className="btn btn-sm btn-outline">Download</a>
              </Link>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setDismissedDownloadPromo(true);
                  localStorage.setItem('dismissedDownloadPromo', 'true');
                }}
              >
                <TbX />
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-row items-center px-2">
        {router.query.source ? (
          <div className="pt-1 pr-2">
            <TbChevronLeft className="text-2xl cursor-pointer hover:text-primary" onClick={() => router.back()} />
          </div>
        ) : null}
        <h2 className="text-2xl font-bold">
          <TimestampDisplay timestamp={combat.startTime} timezone={combat.timezone} />
          {sequence && <div className="ml-4 inline">Round {sequence}</div>}
        </h2>
        <div className="flex flex-1" />
        <label htmlFor="toggle-share" className="btn btn-ghost btn-sm">
          <FaShare className="mr-2" />
          Share
        </label>
      </div>
      <div className="tabs tabs-boxed mt-2">
        <a
          className={`tab ${activeTab === 'summary' ? 'tab-active' : ''}`}
          onClick={() => {
            setActiveTab('summary');
          }}
        >
          Summary
        </a>
        <a
          className={`tab ${activeTab === 'players' ? 'tab-active' : ''}`}
          onClick={() => {
            setActiveTab('players');
          }}
        >
          Players
        </a>
        <a
          className={`tab ${activeTab === 'death' ? 'tab-active' : ''}`}
          onClick={() => {
            setActiveTab('death');
          }}
        >
          Death
        </a>
        <a
          className={`tab ${activeTab === 'curves' ? 'tab-active' : ''}`}
          onClick={() => {
            setActiveTab('curves');
          }}
        >
          Curves
        </a>
        <a
          className={`tab ${activeTab === 'replay' ? 'tab-active' : ''}`}
          onClick={() => {
            setActiveTab('replay');
          }}
        >
          Replay
        </a>
        {user?.me?.tags?.includes('rawlogs') && (
          <a
            className={`tab ${activeTab === 'logview' ? 'tab-active' : ''}`}
            onClick={() => {
              setActiveTab('logview');
            }}
          >
            Log file
          </a>
        )}
      </div>
      <div className="mt-4 ml-2 flex-1 relative overflow-x-hidden overflow-y-scroll">
        <div className="mr-4 min-h-full relative flex flex-col">
          {activeTab === 'summary' && <CombatSummary />}
          {activeTab === 'players' && <CombatPlayers />}
          {activeTab === 'death' && <CombatDeathReports />}
          {activeTab === 'curves' && <CombatCurves />}
          {activeTab === 'replay' && <CombatReplay />}
          {activeTab === 'logview' && <CombatLogView />}
        </div>
      </div>
      <input type="checkbox" id="toggle-share" className="modal-toggle" />
      <label htmlFor="toggle-share" className="modal">
        <label className="modal-box relative" htmlFor="">
          <div className="flex flex-row">
            <input
              type="text"
              className="input input-bordered flex-1 mr-2"
              readOnly
              value={reportUrl}
              onFocus={(e) => {
                e.target.select();
              }}
            />
            <button
              className={`btn ${urlCopied ? 'btn-success' : 'btn-primary'}`}
              onClick={() => {
                navigator.clipboard.writeText(reportUrl).then(() => {
                  setUrlCopied(true);
                  setTimeout(() => {
                    setUrlCopied(false);
                  }, 3000);
                });
              }}
            >
              <TbCopy className="text-lg mr-2" />
              {urlCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </label>
      </label>
    </div>
  );
};

export const CombatReport = ({ combat, anon }: IProps) => {
  return (
    <CombatReportContextProvider combat={combat} isAnonymized={anon || false}>
      <CombatReportInternal />
    </CombatReportContextProvider>
  );
};
