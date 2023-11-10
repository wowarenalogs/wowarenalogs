import { Observable, pipe } from 'rxjs';
import { map } from 'rxjs/operators';

import { ArenaMatchStart } from '../../actions/ArenaMatchStart';
import { CombatEvent } from '../../types';

export const handleSidecarEvents = () => {
  return pipe(
    map((event: CombatEvent | string): CombatEvent | string => {
      if (event instanceof ArenaMatchStart) {
        // output.next({
        //   dataType: 'ActivityStarted',
        //   arenaMatchStartInfo: event,
        // });
      }
      return event;
    }),
  );
};

// export const combatEventsToSegment = () => {
//   return (input: Observable<CombatEvent | string>) => {
//     return new Observable<ICombatEventSegment | IActivityStarted>((output) => {

export const handleSidecarEvents2 = () => {
  return (input: Observable<CombatEvent | string>) => {
    return new Observable<CombatEvent | string>((output) => {
      input.subscribe({
        next: (event) => {
          output.next({
            dataType: 'ActivityStarted',
            arenaMatchStartInfo: event,
          });
        },
      });
    });
  };
};
