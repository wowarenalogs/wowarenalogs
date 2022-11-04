import { Subject } from 'rxjs';

import { ICombatData, IMalformedCombatData, IShuffleCombatData, IShuffleRoundData } from '../../CombatData';
import { logLineToCombatEvent } from '../common/logLineToCombatEvent';
import { stringToLogLine } from '../common/stringToLogLine';
import { combatEventsToSegment } from './combatEventsToSegment';
import { segmentToCombat } from './segmentToCombat';

export const createRetailParserPipeline = (
  onValidCombat: (combat: ICombatData) => void,
  onMalformedCombat: (combat: IMalformedCombatData) => void,
  onShuffleRound: (combat: IShuffleRoundData) => void,
  onShuffleComplete: (combat: IShuffleCombatData) => void,
) => {
  const rawLogs = new Subject<string>();

  rawLogs
    .pipe(stringToLogLine(), logLineToCombatEvent('retail'), combatEventsToSegment(), segmentToCombat())
    .subscribe({
      next: (d) => {
        switch (d.dataType) {
          case 'Combat':
            onValidCombat(d);
            break;
          case 'MalformedCombat':
            onMalformedCombat(d);
            break;
          case 'Shuffle':
            // TODO: Think more about this edge case
            onShuffleRound(d.rounds[5]); // TODO: last round, not first
            onShuffleComplete(d);
            break;
          case 'ShuffleRound':
            onShuffleRound(d);
            break;
        }
      },
    });

  return (nextLine: string) => {
    rawLogs.next(nextLine);
  };
};
