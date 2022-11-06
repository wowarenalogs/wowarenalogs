import { IArenaCombat, IShuffleRound } from '@wowarenalogs/parser';

interface IProps {
  id: string;
  combat: IArenaCombat;
  anon?: boolean;
  search?: string;
}

export const CombatReport = ({ id, combat }: IProps) => {
  // access shuffle specific data with a cast
  const shuffleData = combat.dataType === 'ShuffleRound' ? (combat as IShuffleRound) : null;

  // mmr won't be available for locally recorded shuffle rounds
  const mmr = combat.matchEndInfo?.team0MMR;

  return (
    <div className="w-full h-full flex flex-col p-2">
      <div>
        {id} {combat.id} {combat.result} {shuffleData?.sequenceNumber} {mmr}
      </div>
    </div>
  );
};
