import { AtomicArenaCombat } from '@wowarenalogs/parser';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FaShare } from 'react-icons/fa';
import { TbChevronLeft, TbCopy } from 'react-icons/tb';

import { zoneMetadata } from '../../data/zoneMetadata';
import { useGetProfileQuery } from '../../graphql/__generated__/graphql';
import { useClientContext } from '../../hooks/ClientContext';
import { logAnalyticsEvent } from '../../utils/analytics';
import { DownloadPromotion } from '../common/DownloadPromotion';
import { CombatCC } from './CombatCC';
import { CombatCurves } from './CombatCurves';
import { CombatDeathReports } from './CombatDeathReports';
import { CombatLogView } from './CombatLogView';
import { CombatPlayers } from './CombatPlayers';
import { CombatReportContextProvider, useCombatReportContext } from './CombatReportContext';
import { CombatScoreboard } from './CombatScoreboard';
import { CombatSummary } from './CombatSummary';
import { CombatVideo } from './CombatVideo';

const CombatReplay = dynamic(
  () => {
    const promise = import('./CombatReplay').then((mod) => mod.CombatReplay);
    return promise;
  },
  { ssr: false },
);

interface IProps {
  matchId: string;
  roundId?: string;
  combat: AtomicArenaCombat;
  viewerIsOwner?: boolean;
}

export const CombatReportInternal = ({ matchId, roundId }: { matchId: string; roundId?: string }) => {
  const clientContext = useClientContext();
  const router = useRouter();
  const { data: user } = useGetProfileQuery();
  const { combat, activeTab, setActiveTab, activePlayerId } = useCombatReportContext();

  const [urlCopied, setUrlCopied] = useState(false);
  const reportUrl = useMemo(() => {
    const url = `https://wowarenalogs.com/match?id=${matchId}&roundId=${roundId}`;
    return url;
  }, [matchId, roundId]);

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

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [activePlayerId]);

  if (!combat) return null;

  const sequence = combat.dataType === 'ShuffleRound' ? combat.sequenceNumber + 1 : null;
  const isShuffle = combat.dataType === 'ShuffleRound';

  return (
    <div className="w-full h-full flex flex-col p-2 animate-fadein">
      <DownloadPromotion />
      <div className="flex flex-row items-center px-2">
        {router.query.source ? (
          <div className="pt-1 pr-2">
            <TbChevronLeft className="text-2xl cursor-pointer hover:text-primary" onClick={() => router.back()} />
          </div>
        ) : null}
        <h2 className="text-2xl font-bold">
          {sequence && <span className="mr-2">Round {sequence} of</span>}
          {`${combat.startInfo.bracket} at ${zoneMetadata[combat.startInfo.zoneId ?? '0'].name}`}
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
          className={`tab ${activeTab === 'cc' ? 'tab-active' : ''}`}
          onClick={() => {
            setActiveTab('cc');
          }}
        >
          CC & Kicks
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
        {isShuffle && (
          <a
            className={`tab ${activeTab === 'scoreboard' ? 'tab-active' : ''}`}
            onClick={() => {
              setActiveTab('scoreboard');
            }}
          >
            Scoreboard
          </a>
        )}
        {clientContext.isDesktop && (
          <a
            className={`tab ${activeTab === 'video' ? 'tab-active' : ''}`}
            onClick={() => {
              setActiveTab('video');
            }}
          >
            Video
          </a>
        )}
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
      <div ref={scrollRef} className="mt-4 ml-2 flex-1 relative overflow-x-hidden overflow-y-scroll">
        <div className="mr-4 min-h-full relative flex flex-col">
          {activeTab === 'summary' && <CombatSummary />}
          {activeTab === 'players' && <CombatPlayers />}
          {activeTab === 'cc' && <CombatCC />}
          {activeTab === 'death' && <CombatDeathReports />}
          {activeTab === 'curves' && <CombatCurves />}
          {activeTab === 'replay' && <CombatReplay />}
          {activeTab === 'scoreboard' && <CombatScoreboard />}
          {activeTab === 'video' && <CombatVideo />}
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

export const CombatReport = ({ combat, viewerIsOwner, matchId, roundId }: IProps) => {
  return (
    <CombatReportContextProvider combat={combat} viewerIsOwner={viewerIsOwner || false}>
      <CombatReportInternal matchId={matchId} roundId={roundId} />
    </CombatReportContextProvider>
  );
};
