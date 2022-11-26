import EventEmitter from 'eventemitter3';

import { createRetailParserPipeline } from './pipeline/retail';
import { createClassicParserPipeline } from './pipeline/classic';
import { WowVersion } from './types';
import { PIPELINE_FLUSH_SIGNAL } from './utils';
import moment from 'moment';

export type {
  IArenaMatch,
  IMalformedCombatData,
  IShuffleMatch,
  IShuffleRound,
  IArenaCombat,
  AtomicArenaCombat,
} from './CombatData';
export type { ICombatUnit } from './CombatUnit';
export * from './types';
export * from './utils';
export * from './actions/CombatAction';
export * from './actions/CombatAdvancedAction';
export * from './actions/ArenaMatchEnd';
export * from './actions/ArenaMatchStart';
export * from './actions/CombatHpUpdateAction';
export * from './actions/CombatAbsorbAction';
export * from './actions/CombatExtraSpellAction';
export * from './classMetadata';
export * from './pipeline/common/stringToLogLine';
export * from './pipeline/common/logLineToCombatEvent';

export interface IParserContext {
  wowVersion: WowVersion | null;
  pipeline: (nextLine: string) => void;
}

const WOW_VERSION_LINE_PARSER = /COMBAT_LOG_VERSION,(\d+),ADVANCED_LOG_ENABLED,\d,BUILD_VERSION,([^,]+),(.+)\s*$/;

export class WoWCombatLogParser extends EventEmitter {
  private _timezone: string | undefined = undefined;

  private context: IParserContext = {
    wowVersion: null,
    pipeline: () => {
      return;
    },
  };

  /**
   * Build a WoWCombatLogParser to handle a log stream and emit events with information about parsed combat
   * @param initialWowVersion WoWVersion the log files will use, defaults to retail
   * @param timezone Timezone the log was recorded in, defaults to the system timezone
   */
  constructor(initialWowVersion: WowVersion | null = null, timezone?: string) {
    super();
    this.resetParserStates(initialWowVersion);
    if (timezone && moment.tz.names().includes(timezone)) {
      this._timezone = timezone;
    }
  }

  public getTimezone() {
    return this._timezone;
  }

  public resetParserStates(wowVersion: WowVersion | null = null): void {
    if (wowVersion === null) {
      this.context = {
        wowVersion,
        pipeline: () => {
          return;
        },
      };
    } else {
      this.setWowVersion(wowVersion);
    }
  }

  public flush(): void {
    if (this.context.wowVersion) {
      this.context.pipeline(PIPELINE_FLUSH_SIGNAL);
    }
  }

  public parseLine(line: string): void {
    const wowVersionLineMatches = line.match(WOW_VERSION_LINE_PARSER);
    if (wowVersionLineMatches && wowVersionLineMatches.length > 0) {
      if (this.context.wowVersion) {
        this.context.pipeline(PIPELINE_FLUSH_SIGNAL);
      }

      const wowBuild = wowVersionLineMatches[2];
      const wowVersion: WowVersion = wowBuild.startsWith('3.') ? 'classic' : 'retail';
      this.setWowVersion(wowVersion);
    } else {
      if (!this.context.wowVersion) {
        this.context = {
          wowVersion: 'retail',
          pipeline: createRetailParserPipeline(
            (combat) => {
              this.emit('arena_match_ended', combat);
            },
            (malformedCombat) => {
              this.emit('malformed_arena_match_detected', malformedCombat);
            },
            (combat) => {
              this.emit('solo_shuffle_round_ended', combat);
            },
            (combat) => {
              this.emit('solo_shuffle_ended', combat);
            },
            this._timezone,
          ),
        };
      }
      this.context.pipeline(line);
    }
  }

  private setWowVersion(wowVersion: WowVersion) {
    if (wowVersion === 'classic') {
      this.context = {
        wowVersion,
        pipeline: createClassicParserPipeline(
          (combat) => {
            this.emit('arena_match_ended', combat);
          },
          (malformedCombat) => {
            this.emit('malformed_arena_match_detected', malformedCombat);
          },
          this._timezone,
        ),
      };
    } else {
      console.log('create pipe', this._timezone);
      this.context = {
        wowVersion,
        pipeline: createRetailParserPipeline(
          (combat) => {
            this.emit('arena_match_ended', combat);
          },
          (malformedCombat) => {
            this.emit('malformed_arena_match_detected', malformedCombat);
          },
          (combat) => {
            this.emit('solo_shuffle_round_ended', combat);
          },
          (combat) => {
            this.emit('solo_shuffle_ended', combat);
          },
          this._timezone,
        ),
      };
    }
  }
}
