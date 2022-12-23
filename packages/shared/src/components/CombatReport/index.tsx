import { AtomicArenaCombat } from '@wowarenalogs/parser';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { TbChevronLeft } from 'react-icons/tb';

import { useGetProfileQuery } from '../../graphql/__generated__/graphql';
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
  search?: string;
}

export const CombatReportInternal = () => {
  const router = useRouter();
  const { data: user } = useGetProfileQuery();
  const { combat, activeTab, setActiveTab } = useCombatReportContext();

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
      <div className="flex flex-row items-center px-2">
        <div className="pt-1 pr-2">
          <TbChevronLeft className="text-2xl cursor-pointer hover:text-primary" onClick={() => router.back()} />
        </div>
        <h2 className="text-2xl font-bold">
          <TimestampDisplay timestamp={combat.startTime} timezone={combat.timezone} />
          {sequence && <div className="ml-4 inline">Round {sequence}</div>}
        </h2>
        <div className="flex flex-1" />
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
