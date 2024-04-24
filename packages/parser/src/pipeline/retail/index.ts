import { Subject } from 'rxjs';

import {
  IActivityStarted,
  IArenaMatch,
  IBattlegroundCombat,
  IMalformedCombatData,
  IShuffleMatch,
  IShuffleRound,
} from '../../CombatData';
import { logLineToCombatEvent } from '../common/logLineToCombatEvent';
import { stringToLogLine } from '../common/stringToLogLine';
import { combatEventsToSegment } from './combatEventsToSegment';
import { segmentToCombat } from './segmentToCombat';

export const createRetailParserPipeline = (
  onActivityStarted: (activity: IActivityStarted) => void,
  onValidCombat: (combat: IArenaMatch) => void,
  onMalformedCombat: (combat: IMalformedCombatData) => void,
  onShuffleRound: (combat: IShuffleRound) => void,
  onShuffleComplete: (combat: IShuffleMatch) => void,
  onBattlegroundCombat: (combat: IBattlegroundCombat) => void,
  onError: (error: Error) => void,
  timezone: string,
) => {
  const rawLogs = new Subject<string>();

  rawLogs
    .pipe(stringToLogLine(timezone), logLineToCombatEvent('retail'), combatEventsToSegment(), segmentToCombat())
    .subscribe({
      next: (d) => {
        switch (d.dataType) {
          case 'ArenaMatch':
            onValidCombat(d);
            break;
          case 'MalformedCombat':
            onMalformedCombat(d);
            break;
          case 'ShuffleMatch':
            // TODO: Think more about this edge case
            onShuffleRound(d.rounds[5]); // TODO: last round, not first
            onShuffleComplete(d);
            break;
          case 'ShuffleRound':
            onShuffleRound(d);
            break;
          case 'ActivityStarted':
            onActivityStarted(d);
            break;
          case 'BattlegroundCombat':
            onBattlegroundCombat(d);
            break;
        }
      },
      error: (e) => {
        onError(e);
      },
    });

  return (nextLine: string) => {
    rawLogs.next(nextLine);
  };
};
