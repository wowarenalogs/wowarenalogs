import fs from 'fs';
import moment from 'moment-timezone';
import path from 'path';
import { from } from 'rxjs';

import { CombatAbsorbAction, CombatSupportAction, WoWCombatLogParser } from '../src';
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

  describe('jsonparse', () => {
    it('handles interior quote escaped strings with commas', () => {
      const errors = [];
      const parser = new WoWCombatLogParser('retail', 'America/New_York');
      parser.on('parser_error', (err) => {
        errors.push(err);
      });

      parser.parseLine(
        `5/10 20:50:33.984  SPELL_AURA_APPLIED,Player-3694-0A859E95,"Sarious-Lightbringer",0x512,0x20,Player-3694-0A859E95,"Sarious-Lightbringer",0x512,0x20,123904,"Invoke Xuen, the White Tiger",0x8,BUFF`,
      );
      const testLine = String.raw`5/14 13:01:48.235  SPELL_AURA_APPLIED,0000000000000000,nil,0x518,0x0,Player-1379-0AE1CEE3,"Myster-Uldum",0x518,0x0,411060,"Nuevo tónico \"Olfatopo, no me olfatees\"",0x8,BUFF`;
      parser.parseLine(testLine);

      parser.flush();
      expect(errors.length).toBe(0);
    });
  });

  describe('dedup', () => {
    it('should remove duplicate lines', () => {
      const inputLines = fs
        .readFileSync(path.join(__dirname, 'testlogs', 'test_dedup.txt'))
        .toString()
        .split('\n');

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

    it('should parse SPELL_DAMAGE for crit=true', () => {
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

    it('should parse _HEAL for crit=false', () => {
      const log = `1/16 10:29:00.116  SPELL_PERIODIC_HEAL,Player-57-0D68496B,"Gumbys-Illidan",0x548,0x0,Player-3693-0A0860FC,"Currency-Kel'Thuzad",0x548,0x0,61295,"Riptide",0x8,Player-3693-0A0860FC,0000000000000000,409530,409530,10726,1421,8309,0,1,0,1000,0,1275.36,1664.57,0,0.1180,417,2988,2988,2988,0,nil`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.isCritical).toEqual(false);
    });

    it('should parse _HEAL for crit=true', () => {
      const log = `1/16 10:29:00.116  SPELL_PERIODIC_HEAL,Player-57-0D68496B,"Gumbys-Illidan",0x548,0x0,Player-3693-0A0860FC,"Currency-Kel'Thuzad",0x548,0x0,61295,"Riptide",0x8,Player-3693-0A0860FC,0000000000000000,409530,409530,10726,1421,8309,0,1,0,1000,0,1275.36,1664.57,0,0.1180,417,2988,2988,2988,0,1`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.isCritical).toEqual(true);
    });

    it('should parse SWING_DAMAGE for crit=false', () => {
      const log = `1/16 10:29:10.293  SWING_DAMAGE,Player-3209-0B7ABE8D,"Tokari-Azralon",0x512,0x20,Player-127-0A64DF62,"Billgluckman-Drak'Tharon",0x10548,0x0,Player-3209-0B7ABE8D,0000000000000000,349620,349620,11105,1420,8393,0,1,507,1000,0,1288.34,1644.27,0,3.2055,418,3502,6288,-1,1,0,0,0,nil,nil,nil`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.isCritical).toEqual(false);
    });

    it('should parse SWING_DAMAGE for crit=true', () => {
      const log = `1/16 10:29:10.293  SWING_DAMAGE,Player-3209-0B7ABE8D,"Tokari-Azralon",0x512,0x20,Player-127-0A64DF62,"Billgluckman-Drak'Tharon",0x10548,0x0,Player-3209-0B7ABE8D,0000000000000000,349620,349620,11105,1420,8393,0,1,507,1000,0,1288.34,1644.27,0,3.2055,418,3502,6288,-1,1,0,0,0,1,nil,nil`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.isCritical).toEqual(true);
    });

    it('should parse SPELL_DAMAGE_SUPPORT', () => {
      const log = `6/24 13:55:42.309  SPELL_DAMAGE_SUPPORT,Player-5764-0001B6CA,"Asdofh-Fyrakk",0x511,0x0,Creature-0-5770-530-764-153285-0000972A98,"Training Dummy",0x10a28,0x0,395152,"Ebon Might",0xc,0000000000000000,0000000000000000,0,0,0,0,0,0,-1,0,0,0,0.00,0.00,110,0.0000,0,2564,2564,-1,4,0,0,0,nil,nil,nil,Player-5764-0001804B`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatSupportAction(logLine as unknown as ILogLine, 'retail');
      expect(action.amount).toEqual(-2564);
      expect(action.supportActorId).toEqual('Player-5764-0001804B');
    });

    it('should parse SPELL_PERIODIC_DAMAGE_SUPPORT', () => {
      const log = `6/24 14:15:32.187  SPELL_PERIODIC_DAMAGE_SUPPORT,Player-5764-0001B6CA,"Asdofh-Fyrakk",0x511,0x0,Creature-0-5770-530-764-153285-0000972A98,"Training Dummy",0x10a28,0x0,395152,"Ebon Might",0xc,0000000000000000,0000000000000000,0,0,0,0,0,0,-1,0,0,0,0.00,0.00,110,0.0000,0,1520,1520,-1,80,0,0,0,nil,nil,nil,Player-5764-0001804B`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatSupportAction(logLine as unknown as ILogLine, 'retail');
      expect(action.amount).toEqual(-1520);
      expect(action.spellName).toBe('Ebon Might');
      expect(action.spellId).toBe('395152');
      expect(action.supportActorId).toEqual('Player-5764-0001804B');
    });

    xit('should parse SWING_DAMAGE_SUPPORT', () => {
      // TODO: support event
      throw new Error('NYI');
    });

    it('should parse RANGE_DAMAGE_SUPPORT', () => {
      const log = `7/10 18:22:57.752  RANGE_DAMAGE_SUPPORT,Player-5764-0002AE3B,"Beastmystery-Fyrakk",0x511,0x0,Creature-0-5770-2444-5-197833-00002C7CDE,"PvP Training Dummy",0x10a28,0x0,410089,"Prescience",0x40,0000000000000000,0000000000000000,0,0,0,0,0,0,-1,0,0,0,0.00,0.00,2112,0.0000,0,548,521,547,1,0,0,0,1,nil,nil,Player-5764-0001804B`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatSupportAction(logLine as unknown as ILogLine, 'retail');
      expect(action.amount).toEqual(-548);
      expect(action.spellName).toBe('Prescience');
      expect(action.spellId).toBe('410089');
      expect(action.supportActorId).toEqual('Player-5764-0001804B');
    });

    it('should parse SPELL_HEAL_SUPPORT', () => {
      const log = `7/10 18:16:50.922  SPELL_HEAL_SUPPORT,Player-5764-000183CB,"Yllaphcaz-Iridikron",0x548,0x0,Creature-0-5770-2444-5-194646-00002C7CDE,"Training Dummy",0xa18,0x0,413786,"Fate Mirror",0x40,0000000000000000,0000000000000000,0,0,0,0,0,0,-1,0,0,0,0.00,0.00,2112,0.0000,0,1169,1169,0,0,nil,Player-5764-0002553E`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatSupportAction(logLine as unknown as ILogLine, 'retail');
      expect(action.amount).toEqual(1169);
      expect(action.spellName).toBe('Fate Mirror');
      expect(action.spellId).toBe('413786');
      expect(action.supportActorId).toEqual('Player-5764-0002553E');
    });

    xit('should parse SPELL_PERIODIC_HEAL_SUPPORT', () => {
      // TODO: support event
      throw new Error('NYI');
    });

    xit('should parse SWING_DAMAGE_LANDED_SUPPORT', () => {
      // TODO: support event
      throw new Error('NYI');
    });

    //
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

    // These two lines produced the combat text:
    // Your Aimed Shot hit Banthur 52,602 Physical. (57,096 Absorbed)
    it('should parse SPELL_ABSORBED+SPELL_DAMAGE pt1', () => {
      const log = `7/5 17:55:45.405  SPELL_ABSORBED,Player-60-0F1108AA,"Beastmystery-Stormrage",0x548,0x0,Player-60-0F0C61CB,"Banthur-Stormrage",0x10511,0x0,19434,"Aimed Shot",0x1,Player-60-0F0C61CB,"Banthur-Stormrage",0x10511,0x0,17,"Power Word: Shield",0x2,57096,150591,nil`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatAbsorbAction(logLine as unknown as ILogLine, 'retail');
      expect(action.effectiveAmount).toEqual(57096);
    });

    it('should parse SPELL_ABSORBED+SPELL_DAMAGE pt2', () => {
      const log = `7/5 17:55:45.405  SPELL_DAMAGE,Player-60-0F1108AA,"Beastmystery-Stormrage",0x548,0x0,Player-60-0F0C61CB,"Banthur-Stormrage",0x10511,0x0,19434,"Aimed Shot",0x1,Player-60-0F0C61CB,0000000000000000,569018,621620,1081,12160,2305,0,0,275625,275625,0,1208.91,-4421.43,1,1.2321,440,52602,150591,-1,1,0,0,57096,nil,nil,nil`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.effectiveAmount).toEqual(-52602);
    });
  });
});
