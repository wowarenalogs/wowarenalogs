import fs from 'fs';
import moment from 'moment-timezone';
import path from 'path';
import { from } from 'rxjs';

import { WoWCombatLogParser } from '../src';
import { CombatHpUpdateAction } from '../src/actions/CombatHpUpdateAction';
import { PartyKill } from '../src/actions/PartyKill';
import { dedup } from '../src/pipeline/classic/dedup';
import { stringToLogLine } from '../src/pipeline/common/stringToLogLine';
import { ILogLine } from '../src/types';

describe('pipeline component tests', () => {
  describe('timezone on construction', () => {
    it('should use moment default if an invalid tz string is passed', () => {
      const parser = new WoWCombatLogParser('retail', 'America/Goldshire');
      expect(parser._timezone).toBe(moment.tz.guess());
    });

    it('should set a normal timezone', () => {
      const parser = new WoWCombatLogParser('retail', 'America/New_York');
      expect(parser._timezone).toBe('America/New_York');
    });
  });

  describe('dedup', () => {
    it('should remove duplicate lines', () => {
      const inputLines = fs.readFileSync(path.join(__dirname, 'testlogs', 'test_dedup.txt')).toString().split('\n');

      const outputLines: string[] = [];
      from(inputLines)
        .pipe(dedup())
        .forEach((line) => outputLines.push(line));

      expect(outputLines).toHaveLength(6);
    });
  });

  describe('advanced log format', () => {
    it('should parse retail logs correctly', () => {
      const log =
        '2/6 00:39:34.038  SPELL_DAMAGE,Player-57-0ABB28BC,"Raikendk-Illidan",0x10548,0x0,Player-57-0BDDB09C,"Notórious-Illidan",0x512,0x0,253597,"Inexorable Assault",0x10,Player-57-0BDDB09C,0000000000000000,21506,22520,898,342,524,0,0,8513,8513,0,-2022.75,6669.33,0,4.8573,125,206,203,-1,16,0,0,0,nil,nil,nil';
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));

      expect(logLine).not.toBeNull();

      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.amount).toEqual(-206);
      expect(action.isCritical).toEqual(false);
      expect(action.advanced).toEqual(true);
      expect(action.advancedActorCurrentHp).toEqual(21506);
      expect(action.advancedActorMaxHp).toEqual(22520);
      expect(action.advancedActorPositionX).toEqual(-2022.75);
      expect(action.advancedActorPositionY).toEqual(6669.33);
      expect(action.advancedActorItemLevel).toEqual(125);
    });

    it('should parse crits', () => {
      const log =
        '2/6 00:39:34.038  SPELL_DAMAGE,Player-57-0ABB28BC,"Raikendk-Illidan",0x10548,0x0,Player-57-0BDDB09C,"Notórious-Illidan",0x512,0x0,253597,"Inexorable Assault",0x10,Player-57-0BDDB09C,0000000000000000,21506,22520,898,342,524,0,0,8513,8513,0,-2022.75,6669.33,0,4.8573,125,206,203,-1,16,5,4,2,1,3,nil';
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));

      expect(logLine).not.toBeNull();

      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.amount).toEqual(-206);
      expect(action.isCritical).toEqual(true);
    });

    it('should parse party kill events', () => {
      const log =
        '11/1 20:35:25.646  PARTY_KILL,dd6dcc4e-fe9c-4485-84db-f5beb34b748a,"EarlyPanda",0x512,0x0,ce9434a7-b379-4919-b825-f94e1df6cbef,"BrokenPython",0x10548,0x0,0';
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));

      expect(logLine).not.toBeNull();

      const action = new PartyKill(logLine as unknown as ILogLine);
      expect(action.destUnitName).toBe('BrokenPython');
    });

    it('should parse Classic log correctly', () => {
      const log =
        '5/21 16:35:39.437  SPELL_DAMAGE,Player-4395-01C5EEA8,"Assinoth-Whitemane",0x511,0x0,Player-4700-01A0750A,"Darshath-Kirtonos",0x10548,0x0,17348,"Hemorrhage",0x1,Player-4700-01A0750A,0000000000000000,89,100,28,327,957,0,4844,7239,0,4028.03,2925.57,0,4.7879,75,371,389,-1,1,0,0,0,nil,nil,nil';
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));

      expect(logLine).not.toBeNull();

      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'classic');
      expect(action.amount).toEqual(-371);
      expect(action.advanced).toEqual(true);
      expect(action.advancedActorCurrentHp).toEqual(89);
      expect(action.advancedActorMaxHp).toEqual(100);
      expect(action.advancedActorPositionX).toEqual(4028.03);
      expect(action.advancedActorPositionY).toEqual(2925.57);
      expect(action.advancedActorItemLevel).toEqual(75);
    });
  });
});
