import _ from 'lodash';
import { useEffect, useState } from 'react';
import { TbCaretDown, TbInfoCircle, TbX } from 'react-icons/tb';

import { Dropdown } from '../common/Dropdown';
import CompetitiveStats from '../CompetitiveStats';

const SUPPORTED_BRACKETS = ['2v2', '3v3', 'Rated Solo Shuffle'];

export const StatsPage = () => {
  const [activeTab, setActiveTab] = useState('spec-stats');
  const [activeBracket, setActiveBracket] = useState('2v2');
  const [dismissedExperimentalInfo, setDismissedExperimentalInfo] = useState(false);

  useEffect(() => {
    setDismissedExperimentalInfo(localStorage.getItem('dismissedExperimentalInfo') === 'true');
  }, []);

  return (
    <div className="flex flex-col p-2 w-full h-full">
      {!dismissedExperimentalInfo && (
        <div className="mb-2 relative">
          <div className="alert alert-info shadow-lg">
            <div>
              <TbInfoCircle className="text-xl" />
              These stats are experimental and currently based on a limited sample. Please take it with a grain of salt.
            </div>
            <div className="flex-none">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setDismissedExperimentalInfo(true);
                  localStorage.setItem('dismissedExperimentalInfo', 'true');
                }}
              >
                <TbX />
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-row gap-2 items-center justify-center">
        <Dropdown
          menuItems={SUPPORTED_BRACKETS.map((bracket) => ({
            key: bracket,
            label: bracket,
            onClick: () => setActiveBracket(bracket),
          }))}
        >
          <>
            {activeBracket}&nbsp;
            <TbCaretDown />
          </>
        </Dropdown>
        <div className="tabs tabs-boxed">
          <a
            className={`tab ${activeTab === 'spec-stats' ? 'tab-active' : ''}`}
            onClick={() => {
              setActiveTab('spec-stats');
            }}
          >
            Spec Performance
          </a>
          <a
            className={`tab ${activeTab === 'comp-stats' ? 'tab-active' : ''}`}
            onClick={() => {
              setActiveTab('comp-stats');
            }}
          >
            Comp Performance
          </a>
        </div>
        <div
          className="tooltip tooltip-bottom tooltip-info z-50"
          data-tip="Based on ranked matches at all ratings uploaded during the past 7 days, excluding the uploader's own teams to minimize bias."
        >
          <TbInfoCircle className="text-xl ml-2 cursor-pointer" />
        </div>
      </div>
      <CompetitiveStats statsFileName={activeTab} activeBracket={activeBracket} />
    </div>
  );
};
