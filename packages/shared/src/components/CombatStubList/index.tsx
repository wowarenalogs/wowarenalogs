import { CombatDataStub } from '../../graphql/__generated__/graphql';
import { ArenaMatchRow, ShuffleRoundRow } from './rows';

export interface IProps {
  viewerIsOwner?: boolean;
  combats: CombatDataStub[];
  combatUrlFactory: (combatId: string, logId: string) => string;
}

export const CombatStubList = (props: IProps) => {
  return (
    <ul>
      {props.combats.map((c) => {
        if (c.__typename === 'ArenaMatchDataStub') {
          return <ArenaMatchRow match={c} key={c.id} viewerIsOwner combatUrlFactory={props.combatUrlFactory} />;
        }
        if (c.__typename === 'ShuffleRoundStub') {
          return <ShuffleRoundRow round={c} key={c.id} viewerIsOwner combatUrlFactory={props.combatUrlFactory} />;
        }
        return <div key={c.id}>Error loading {c.id}</div>;
      })}
    </ul>
  );
};
