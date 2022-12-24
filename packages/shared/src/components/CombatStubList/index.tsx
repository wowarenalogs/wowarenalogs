import { ArenaMatchRow, CombatStubListSource, LocalRemoteHybridCombat, ShuffleRoundRow } from './rows';

export interface IProps {
  viewerIsOwner?: boolean;
  combats: LocalRemoteHybridCombat[];
  source: CombatStubListSource;
}

export const CombatStubList = (props: IProps) => {
  return (
    <ul className="space-y-1">
      {props.combats.map((c) => {
        if (!c.isShuffle) {
          return (
            <ArenaMatchRow combat={c} key={c.match.id} viewerIsOwner={props.viewerIsOwner} source={props.source} />
          );
        }
        if (c.isShuffle) {
          return (
            <ShuffleRoundRow combat={c} key={c.match.id} viewerIsOwner={props.viewerIsOwner} source={props.source} />
          );
        }
      })}
    </ul>
  );
};
