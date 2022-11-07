import { Subject } from 'rxjs';

import { IArenaMatch, IMalformedCombatData } from '../../CombatData';
import { logLineToCombatEvent } from '../common/logLineToCombatEvent';
import { stringToLogLine } from '../common/stringToLogLine';
import { dedup } from './dedup';
import { inferCombatEventSegments } from './inferCombatEventSegments';
import { segmentToCombat } from './segmentToCombat';

export const createClassicParserPipeline = (
  onValidCombat: (combat: IArenaMatch) => void,
  onMalformedCombat: (combat: IMalformedCombatData) => void,
) => {
  const rawLogs = new Subject<string>();

  rawLogs
    .pipe(dedup(), stringToLogLine(), logLineToCombatEvent('classic'), inferCombatEventSegments(), segmentToCombat())
    .subscribe({
      next: (v) => {
        if (v.dataType === 'ArenaMatch') {
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
