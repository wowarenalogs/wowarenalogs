import { IArenaMatch } from '@wowarenalogs/parser';
import { useState } from 'react';

import { TimestampDisplay } from '../common/TimestampDisplay';
import { CombatReportContextProvider } from './CombatReportContext';
import { CombatSummary } from './CombatSummary';

interface IProps {
  combat: IArenaMatch;
  anon?: boolean;
  search?: string;
}

export const CombatReport = ({ combat, anon }: IProps) => {
  const [activeTab, setActiveTab] = useState<string>('summary');
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);

  return (
    <CombatReportContextProvider
      combat={combat}
      isAnonymized={anon || false}
      navigateToPlayerView={(unitId: string) => {
        setActiveTab('players');
        setActivePlayerId(unitId);
      }}
    >
      <div className="w-full h-full flex flex-col p-2">
        <div className="flex flex-row items-center px-2">
          <h2 className="text-2xl font-bold">
            <TimestampDisplay timestamp={combat.startTime} />
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
        <div className="mt-2 mx-2">{activeTab === 'summary' && <CombatSummary />}</div>
      </div>
    </CombatReportContextProvider>
  );
};
