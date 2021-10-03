import { Subject } from 'rxjs';

import { ICombatData, IMalformedCombatData } from '../../CombatData';
import { logLineToCombatEvent } from '../common/logLineToCombatEvent';
import { stringToLogLine } from '../common/stringToLogLine';
import { combatEventsToSegment } from './combatEventsToSegment';
import { segmentToCombat } from './segmentToCombat';

export const createShadowlandsParserPipeline = (
  onValidCombat: (combat: ICombatData) => void,
  onMalformedCombat: (combat: IMalformedCombatData) => void,
) => {
  const rawLogs = new Subject<string>();

  rawLogs
    .pipe(stringToLogLine(), logLineToCombatEvent('shadowlands'), combatEventsToSegment(), segmentToCombat())
    .subscribe({
      next: (v) => {
        if (v.isWellFormed) {
          onValidCombat(v);
        } else {
          onMalformedCombat(v);
        }
      },
    });

  return (nextLine: string) => {
    rawLogs.next(nextLine);
  };
};
