import _ from 'lodash';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { TbCaretDown, TbInfoCircle, TbX } from 'react-icons/tb';

import { Dropdown } from '../common/Dropdown';
import CompetitiveStats from '../CompetitiveStats';
import { LoadingScreen } from '../LoadingScreen';

const SUPPORTED_BRACKETS = ['2v2', '3v3', 'Rated Solo Shuffle'];

export const StatsPage = () => {
  const router = useRouter();
  const [dismissedExperimentalInfo, setDismissedExperimentalInfo] = useState(false);

  useEffect(() => {
    setDismissedExperimentalInfo(localStorage.getItem('dismissedExperimentalInfo') === 'true');
  }, []);

  if (!router.isReady) {
    return <LoadingScreen />;
  }

  const bracket = (router.query.bracket as string) ?? '2v2';
  const tab = (router.query.tab as string) ?? 'spec-stats';

  return (
    <div className="flex flex-col p-2 w-full h-full items-stretch">
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
          menuItems={SUPPORTED_BRACKETS.map((b) => ({
            key: b,
            label: b,
            onClick: () => router.push(`/stats?tab=${tab}&bracket=${b}`, undefined, { shallow: true }),
          }))}
        >
          <>
            {bracket}&nbsp;
            <TbCaretDown />
          </>
        </Dropdown>
        <div className="tabs tabs-boxed">
          <a
            className={`tab ${tab === 'spec-stats' ? 'tab-active' : ''}`}
            onClick={() => {
              router.push(`/stats?tab=spec-stats&bracket=${bracket}`, undefined, { shallow: true });
            }}
          >
            Spec Performance
          </a>
          <a
            className={`tab ${tab === 'comp-stats' ? 'tab-active' : ''}`}
            onClick={() => {
              router.push(`/stats?tab=comp-stats&bracket=${bracket}`, undefined, { shallow: true });
            }}
          >
            Comp Performance
          </a>
        </div>
        <div
          className="tooltip tooltip-bottom tooltip-info z-50"
          data-tip="Based on ranked matches at all ratings uploaded during the past 7 days, excluding the uploader's own teams to minimize bias."
        >
          <TbInfoCircle className="text-xl ml-2 cursor-pointer opacity-50 hover:opacity-100" />
        </div>
      </div>
      <CompetitiveStats statsFileName={tab} activeBracket={bracket} />
    </div>
  );
};
