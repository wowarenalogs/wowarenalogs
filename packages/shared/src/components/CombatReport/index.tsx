import { IArenaMatch, IShuffleRound } from '@wowarenalogs/parser';

interface IProps {
  id: string;
  combat: IArenaMatch | IShuffleRound;
  anon?: boolean;
  search?: string;
}

export const CombatReport = ({ id, combat }: IProps) => {
  const result = combat.result;

  const isShuffle = combat.dataType === 'ShuffleRound';
  const shuffleRoundNumber = isShuffle ? combat.sequenceNumber : null;

  // mmr won't be available for locally recorded shuffle rounds
  const mmr = !isShuffle ? combat.endInfo.team0MMR : null;

  return (
    <div className="w-full h-full flex flex-col p-2">
      <div>
        {id} {combat.id} {result} {shuffleRoundNumber} {mmr}
      </div>
    </div>
  );
};
