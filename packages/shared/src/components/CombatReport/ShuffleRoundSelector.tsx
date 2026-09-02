import { CombatResult, IShuffleRound } from '@wowarenalogs/parser';

import { useCombatReportContext } from './CombatReportContext';

function roundResultLabel(round: IShuffleRound) {
  switch (round.result) {
    case CombatResult.Win:
      return 'win';
    case CombatResult.Lose:
      return 'loss';
    case CombatResult.DrawGame:
      return 'draw';
    default:
      return 'unknown result';
  }
}

function roundResultClass(round: IShuffleRound, isActive: boolean) {
  switch (round.result) {
    case CombatResult.Win:
      return isActive ? 'btn-success' : 'btn-success btn-outline';
    case CombatResult.Lose:
      return isActive ? 'btn-error' : 'btn-error btn-outline';
    default:
      return isActive ? '' : 'btn-ghost';
  }
}

export const ShuffleRoundSelector = ({ size = 'sm' }: { size?: 'sm' | 'xs' }) => {
  const { combat, shuffleRounds, navigateToRound, canSelectRound } = useCombatReportContext();

  if (!canSelectRound || !navigateToRound || combat?.dataType !== 'ShuffleRound') {
    return null;
  }

  return (
    <div className="flex flex-row items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide opacity-60">Round</span>
      <div className="btn-group">
        {shuffleRounds.map((round) => {
          const isActive = round.sequenceNumber === combat.sequenceNumber;
          const sequence = round.sequenceNumber + 1;
          return (
            <button
              key={round.id}
              className={`btn ${size === 'xs' ? 'btn-xs' : 'btn-sm'} ${roundResultClass(round, isActive)} ${
                isActive ? 'btn-active' : ''
              }`}
              title={`Round ${sequence} (${roundResultLabel(round)})`}
              onClick={() => {
                if (!isActive) {
                  navigateToRound(round);
                }
              }}
            >
              {sequence}
            </button>
          );
        })}
      </div>
    </div>
  );
};
