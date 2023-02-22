import _ from 'lodash';
import { useRouter } from 'next/router';
import { TbCaretDown, TbInfoCircle } from 'react-icons/tb';

import { DownloadPromotion } from '../common/DownloadPromotion';
import { Dropdown } from '../common/Dropdown';
import CompStats from '../CompetitiveStats/CompStats';
import SpecStats from '../CompetitiveStats/SpecStats';

const SUPPORTED_BRACKETS = ['2v2', '3v3', 'Rated Solo Shuffle'];
const RATING_RANGES = [
  [0, 4999],
  [0, 1399],
  [1400, 1799],
  [1800, 2099],
  [2100, 4999],
];

const printRatingRange = (min: number, max: number) => {
  if (min === 0 && max === 4999) {
    return 'All Ratings';
  }
  return `${min} - ${max}`;
};

export const StatsPage = () => {
  const router = useRouter();

  const bracket = (router.query.bracket as string) ?? 'Rated Solo Shuffle';
  const tab = (router.query.tab as string) ?? 'spec-stats';
  const sortKey = (router.query.sortKey as string) ?? 'total';
  const minRating = parseInt((router.query.minRating as string) ?? '0');
  const maxRating = parseInt((router.query.maxRating as string) ?? '4999');

  return (
    <div className="flex flex-col px-4 py-2 w-full h-full items-stretch">
      <DownloadPromotion />
      <div className="flex flex-col md:flex-row gap-2 items-center z-50">
        <Dropdown
          menuItems={SUPPORTED_BRACKETS.map((b) => ({
            key: b,
            label: b,
            onClick: () => {
              router.push(
                `/stats?tab=${tab}&bracket=${b}&sortKey=${sortKey}&minRating=${minRating}&maxRating=${maxRating}`,
                undefined,
                { shallow: true },
              );
            },
          }))}
        >
          <>
            {bracket}&nbsp;
            <TbCaretDown />
          </>
        </Dropdown>
        <Dropdown
          menuItems={(tab === 'spec-stats' ? RATING_RANGES : [[0, 4999]]).map((r) => ({
            key: `${r[0]}-${r[1]}`,
            label: printRatingRange(r[0], r[1]),
            onClick: () => {
              router.push(
                `/stats?tab=${tab}&bracket=${bracket}&sortKey=${sortKey}&minRating=${r[0]}&maxRating=${r[1]}`,
                undefined,
                { shallow: true },
              );
            },
          }))}
        >
          <>
            {printRatingRange(minRating, maxRating)}&nbsp;
            <TbCaretDown />
          </>
        </Dropdown>
        <div className="tabs tabs-boxed">
          <a
            className={`tab ${tab === 'spec-stats' ? 'tab-active' : ''}`}
            onClick={() => {
              router.push(
                `/stats?tab=spec-stats&bracket=${bracket}&sortKey=${sortKey}&minRating=${minRating}&maxRating=${maxRating}`,
                undefined,
                { shallow: true },
              );
            }}
          >
            Spec Performance
          </a>
          <a
            className={`tab ${tab === 'comp-stats' ? 'tab-active' : ''}`}
            onClick={() => {
              router.push(
                `/stats?tab=comp-stats&bracket=${bracket}&sortKey=${sortKey}&minRating=0&maxRating=4999`,
                undefined,
                { shallow: true },
              );
            }}
          >
            Comp Performance
          </a>
        </div>
        <div
          className="tooltip tooltip-bottom tooltip-info"
          data-tip="Based on ranked matches uploaded during the past 14 days, excluding the uploader's own teams to minimize bias."
        >
          <TbInfoCircle className="text-xl ml-2 cursor-pointer opacity-50 hover:opacity-100" />
        </div>
      </div>
      {tab === 'spec-stats' && (
        <SpecStats activeBracket={bracket} sortKey={sortKey} minRating={minRating} maxRating={maxRating} />
      )}
      {tab === 'comp-stats' && <CompStats activeBracket={bracket} sortKey={sortKey} />}
    </div>
  );
};
