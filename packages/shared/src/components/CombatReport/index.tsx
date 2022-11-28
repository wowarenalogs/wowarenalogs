import { AtomicArenaCombat } from '@wowarenalogs/parser';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { TbArrowBigLeft, TbChevronLeft, TbChevronsLeft } from 'react-icons/tb';

import { TimestampDisplay } from '../common/TimestampDisplay';
import { CombatCurves } from './CombatCurves';
import { CombatDeathReports } from './CombatDeathReports';
import { CombatReportContextProvider } from './CombatReportContext';
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

export const CombatReport = ({ combat, anon }: IProps) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>('summary');

  const sequence = combat.dataType === 'ShuffleRound' ? combat.sequenceNumber + 1 : null;
  // const mmr = combat.dataType === 'ArenaMatch' ? combat.endInfo.team0MMR : null;

  return (
    <CombatReportContextProvider combat={combat} isAnonymized={anon || false}>
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
        </div>
        <div className="mt-4 ml-2 flex-1 relative overflow-x-hidden overflow-y-scroll">
          <div className="pr-4">
            {activeTab === 'summary' && <CombatSummary />}
            {activeTab === 'death' && <CombatDeathReports />}
            {activeTab === 'curves' && <CombatCurves />}
            {activeTab === 'replay' && <CombatReplay />}
          </div>
        </div>
      </div>
    </CombatReportContextProvider>
  );
};
