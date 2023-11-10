import EventEmitter from 'eventemitter3';
import moment from 'moment';

import {
  IActivityStarted,
  IArenaMatch,
  IBattlegroundCombat,
  IMalformedCombatData,
  IShuffleMatch,
  IShuffleRound,
} from './CombatData';
import { createClassicParserPipeline } from './pipeline/classic';
import { createRetailParserPipeline } from './pipeline/retail';
import { WowVersion } from './types';
import { PIPELINE_FLUSH_SIGNAL } from './utils';

export type {
  IArenaMatch,
  IMalformedCombatData,
  IShuffleMatch,
  IShuffleRound,
  IArenaCombat,
  IActivityStarted,
  AtomicArenaCombat,
} from './CombatData';
export type { ICombatUnit } from './CombatUnit';
export * from './types';
export * from './utils';
export * from './actions/CombatAction';
export * from './actions/CombatAdvancedAction';
export * from './actions/CombatSupportAction';
export * from './actions/ArenaMatchEnd';
export * from './actions/ArenaMatchStart';
export * from './actions/ZoneChange';
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

interface LogParserSpec {
  activity_started: (data: IActivityStarted) => void;
  arena_match_ended: (data: IArenaMatch) => void;
  malformed_arena_match_detected: (data: IMalformedCombatData) => void;
  solo_shuffle_round_ended: (data: IShuffleRound) => void;
  solo_shuffle_ended: (data: IShuffleMatch) => void;
  battleground_ended: (data: IBattlegroundCombat) => void;
  parser_error: (data: Error) => void;
}

export class WoWCombatLogParser extends EventEmitter<LogParserSpec> {
  public readonly _timezone: string;

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
    if (timezone && moment.tz.names().includes(timezone)) {
      this._timezone = timezone;
    } else {
      this._timezone = moment.tz.guess();
    }
    this.resetParserStates(initialWowVersion);
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
            (activityStarted) => {
              this.emit('activity_started', activityStarted);
            },
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
            (combat) => {
              this.emit('battleground_ended', combat);
            },
            (error) => {
              this.emit('parser_error', error);
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
          (error) => {
            this.emit('parser_error', error);
          },
          this._timezone,
        ),
      };
    } else {
      this.context = {
        wowVersion,
        pipeline: createRetailParserPipeline(
          (activityStarted) => {
            this.emit('activity_started', activityStarted);
          },
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
          (combat) => {
            this.emit('battleground_ended', combat);
          },
          (error) => {
            this.emit('parser_error', error);
          },
          this._timezone,
        ),
      };
    }
  }
}
