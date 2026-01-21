/* eslint-disable no-console */
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

  describe('disregards lines that cant decode timestamp', () => {
    it('should disregard lines that cant decode timestamp', () => {
      const log =
        '8/21/2025 20:42:12.655-5  SPELL_H8/21/2025 20:52:27.945-5  SPELL_PERIODIC_DAMAGE,Player-1427-0E9F4382,"Tokahn-Ragnaros-US",0x548,0x80000000,Player-60-0C61A73C,"Hyl-Stormrage-US",0x512,0x80000020,262115,"Deep Wounds",0x1,Player-60-0C61A73C,0000000000000000,12274966,17737390,137387,13440,44030,3056,0,0,3,246,300,0,2854.58,2273.85,0,3.8525,714,92256,125417,-1,1,0,0,0,nil,nil,nil,ST';
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));

      expect(typeof logLine).toEqual('string');
      expect(logLine).not.toBeNull();
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
        `5/10/2024 20:50:33.984  SPELL_AURA_APPLIED,Player-3694-0A859E95,"Sarious-Lightbringer",0x512,0x20,Player-3694-0A859E95,"Sarious-Lightbringer",0x512,0x20,123904,"Invoke Xuen, the White Tiger",0x8,BUFF`,
      );
      const testLine = String.raw`5/14/2024 13:01:48.235  SPELL_AURA_APPLIED,0000000000000000,nil,0x518,0x0,Player-1379-0AE1CEE3,"Myster-Uldum",0x518,0x0,411060,"Nuevo tónico \"Olfatopo, no me olfatees\"",0x8,BUFF`;
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
        '1/20/2026 21:25:47.506-5  SPELL_DAMAGE,Player-125-0AB19177,"Burnininate-ShadowCouncil-US",0x511,0x80000000,Creature-0-3131-2552-69-219250-00017032DE,"PvP Training Dummy",0x10a28,0x80000000,362969,"Azure Strike",0x50,Creature-0-3131-2552-69-219250-00017032DE,0000000000000000,94830,236416,0,0,377,0,0,0,1,0,0,0,2291.19,-2791.73,2339,1.6471,80,2950,2949,-1,80,0,0,0,nil,nil,nil,AOE';
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));

      expect(logLine).not.toBeNull();
      //
      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      console.log({ action, pow: action.advancedActorPowers });
      expect(typeof logLine).toEqual('object'); // as in, not a string
      expect(action.amount).toEqual(-2950);
      expect(action.isCritical).toEqual(false);
      expect(action.advanced).toEqual(true);
      expect(action.advancedActorCurrentHp).toEqual(94830);
      expect(action.advancedActorMaxHp).toEqual(236416);
      expect(action.advancedActorPositionX).toEqual(2291.19);
      expect(action.advancedActorPositionY).toEqual(-2791.73);
      expect(action.advancedActorItemLevel).toEqual(80);
    });

    it('should parse _HEAL for crit=false', () => {
      const log = `8/30/2025 08:56:38.899-4  SPELL_HEAL,Player-60-0F7BEF5D,"Elementoldyu-Stormrage-US",0x511,0x80000000,Player-60-0F7BEF5D,"Elementoldyu-Stormrage-US",0x511,0x80000000,8004,"Healing Surge",0x8,Player-60-0F7BEF5D,0000000000000000,8395030,11003190,29328,98531,83118,2380,0,0,11,0,175,0,2107.07,-4614.00,85,6.2192,664,873002,873002,0,0,nil`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.effectiveAmount).toEqual(873002);
      expect(action.isCritical).toEqual(false);
    });

    it('should parse _HEAL for crit=true', () => {
      const log = `8/30/2025 08:56:40.501-4  SPELL_HEAL,Player-60-0F7BEF5D,"Elementoldyu-Stormrage-US",0x511,0x80000000,Player-60-0F7BEF5D,"Elementoldyu-Stormrage-US",0x511,0x80000000,8004,"Healing Surge",0x8,Player-60-0F7BEF5D,0000000000000000,10267251,11003190,29328,98531,83118,2380,0,0,11,0,175,0,2107.07,-4614.00,85,6.2192,664,1760154,1760154,0,0,1`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.effectiveAmount).toEqual(1760154);
      expect(action.isCritical).toEqual(true);
    });

    it('should parse SWING_DAMAGE for crit=false', () => {
      const log = `8/30/2025 09:00:14.436-4  SWING_DAMAGE,Player-60-0F7BEF5D,"Elementoldyu-Stormrage-US",0x511,0x80000000,Creature-0-4220-1-520-114840-00003283C4,"PvP Training Dummy",0x10a28,0x80000000,Player-60-0F7BEF5D,0000000000000000,18247768,18247768,33911,140212,101548,3128,0,0,11,0,175,0,2116.85,-4620.22,85,5.0170,718,13886,19837,-1,1,0,0,0,nil,nil,nil`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.amount).toEqual(-13886);
      expect(action.isCritical).toEqual(false);
    });

    it('should parse SWING_DAMAGE for crit=true', () => {
      const log = `8/30/2025 09:00:16.353-4  SWING_DAMAGE,Player-60-0F7BEF5D,"Elementoldyu-Stormrage-US",0x511,0x80000000,Creature-0-4220-1-520-114840-00003283C4,"PvP Training Dummy",0x10a28,0x80000000,Player-60-0F7BEF5D,0000000000000000,18247768,18247768,33911,140212,101548,3128,0,0,11,0,175,0,2116.85,-4620.22,85,5.0170,718,26061,18614,-1,1,0,0,0,1,nil,nil`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.amount).toEqual(-26061);
      expect(action.isCritical).toEqual(true);
    });

    xit('should parse SPELL_DAMAGE_SUPPORT', () => {
      const log = `9/11/2024 13:59:56.4812  SPELL_DAMAGE_SUPPORT,Player-1329-0A1AA05C,"Baowiidk-Ravencrest-EU",0x548,0x0,Player-1401-0A791866,"Kyriea-Garrosh-EU",0x512,0x4,432895,"Thread of Fate",0x40,Player-1401-0A791866,0000000000000000,6615051,6661460,21829,72449,61612,0,0,2500000,2500000,0,1303.54,1679.19,0,4.7347,626,3523,4366,-1,64,0,0,0,nil,nil,nil,Player-1390-0CE41B66`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();

      const action = new CombatSupportAction(logLine as unknown as ILogLine, 'retail');
      // console.log(action);
      // (logLine as unknown as ILogLine).parameters.forEach((p, idx) => {
      //   console.log(`${idx} ${p}`);
      // });
      expect(action.spellName).toBe('Thread of Fate');
      expect(action.amount).toEqual(-3523);
      expect(action.supportActorId).toEqual('Player-1390-0CE41B66');
    });

    xit('should parse SPELL_PERIODIC_DAMAGE_SUPPORT', () => {
      const log = `9/11/2024 13:59:56.7892  SPELL_PERIODIC_DAMAGE_SUPPORT,Player-1329-0A1AA05C,"Baowiidk-Ravencrest-EU",0x548,0x0,Player-1401-0A791866,"Kyriea-Garrosh-EU",0x512,0x4,395152,"Ebon Might",0xc,Player-1401-0A791866,0000000000000000,6650903,6661460,21829,72449,61612,0,0,2500000,2500000,0,1303.71,1679.28,0,0.7581,626,624,641,-1,32,0,0,0,nil,nil,nil,Player-1390-0CE41B66`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatSupportAction(logLine as unknown as ILogLine, 'retail');
      expect(action.spellName).toBe('Ebon Might');
      expect(action.spellId).toBe('395152');
      expect(action.supportActorId).toEqual('Player-1390-0CE41B66');
      expect(action.amount).toEqual(-624);
    });

    xit('should parse SWING_DAMAGE_SUPPORT', () => {
      // TODO: support event
      throw new Error('NYI');
    });

    xit('should parse RANGE_DAMAGE_SUPPORT', () => {
      const log = `9/11/2024 12:06:56.5198  RANGE_DAMAGE_SUPPORT,Player-11-0E7C9656,"Nightstride-Tichondrius-US",0x548,0x0,Player-3725-07B9ADE3,"Skillcapped-Frostmourne-US",0x20512,0x2,395152,"Ebon Might",0xc,Player-3725-07B9ADE3,0000000000000000,6895740,7115820,87438,10672,39438,0,6,560,1000,0,1322.45,1674.56,0,1.9299,627,1220,2373,-1,1,0,0,277,nil,nil,nil,Player-57-0DC2897C`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatSupportAction(logLine as unknown as ILogLine, 'retail');
      expect(action.spellName).toBe('Ebon Might');
      expect(action.spellId).toBe('395152');
      expect(action.supportActorId).toEqual('Player-57-0DC2897C');
      expect(action.amount).toEqual(-1220);
    });

    xit('should parse SPELL_HEAL_SUPPORT', () => {
      const log = `9/11/2024 13:59:51.7472  SPELL_HEAL_SUPPORT,Player-1305-0C4C426C,"Mîstxd-Kazzak-EU",0x10548,0x0,Player-1305-0C4C426C,"Mîstxd-Kazzak-EU",0x10548,0x0,395152,"Ebon Might",0xc,Player-1305-0C4C426C,0000000000000000,3858490,6284380,86068,82758,24402,0,0,2628700,2756250,0,1279.96,1640.13,0,5.0636,626,29924,29924,0,0,nil,Player-1390-0CE41B66`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatSupportAction(logLine as unknown as ILogLine, 'retail');
      expect(action.amount).toEqual(29924);
      expect(action.spellName).toBe('Ebon Might');
      expect(action.spellId).toBe('395152');
      expect(action.supportActorId).toEqual('Player-1390-0CE41B66');
    });

    xit('should parse SPELL_PERIODIC_HEAL_SUPPORT', () => {
      const log = `9/11/2024 13:59:56.3562  SPELL_PERIODIC_HEAL_SUPPORT,Creature-0-3894-572-21622-60849-0000618623,"Jade Serpent Statue",0x2148,0x0,Player-1305-0C4C426C,"Mîstxd-Kazzak-EU",0x10548,0x0,413984,"Shifting Sands",0x40,Player-1305-0C4C426C,0000000000000000,4626696,6284380,81850,78702,24402,0,0,2610560,2756250,0,1278.07,1639.92,0,0.9128,626,1789,1789,0,0,nil,Player-1390-0CE41B66`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatSupportAction(logLine as unknown as ILogLine, 'retail');
      expect(action.amount).toEqual(1789);
      expect(action.spellName).toBe('Shifting Sands');
      expect(action.spellId).toBe('413984');
      expect(action.supportActorId).toEqual('Player-1390-0CE41B66');
    });

    //
    xit('should parse party kill events', () => {
      const log =
        '11/1/2024 20:35:25.646  PARTY_KILL,dd6dcc4e-fe9c-4485-84db-f5beb34b748a,"EarlyPanda",0x512,0x0,ce9434a7-b379-4919-b825-f94e1df6cbef,"BrokenPython",0x10548,0x0,0';
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));

      expect(logLine).not.toBeNull();

      const action = new PartyKill(logLine as unknown as ILogLine);
      expect(action.destUnitName).toBe('BrokenPython');
    });

    // These two lines produced the combat text:
    // Your Aimed Shot hit Banthur 52,602 Physical. (57,096 Absorbed)
    xit('should parse SPELL_ABSORBED+SPELL_DAMAGE pt1', () => {
      const log = `7/5/2024 17:55:45.405  SPELL_ABSORBED,Player-60-0F1108AA,"Beastmystery-Stormrage",0x548,0x0,Player-60-0F0C61CB,"Banthur-Stormrage",0x10511,0x0,19434,"Aimed Shot",0x1,Player-60-0F0C61CB,"Banthur-Stormrage",0x10511,0x0,17,"Power Word: Shield",0x2,57096,150591,nil`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatAbsorbAction(logLine as unknown as ILogLine, 'retail');
      expect(action.effectiveAmount).toEqual(57096);
    });

    xit('should parse SPELL_ABSORBED+SPELL_DAMAGE pt2', () => {
      const log = `7/5/2024 17:55:45.405  SPELL_DAMAGE,Player-60-0F1108AA,"Beastmystery-Stormrage",0x548,0x0,Player-60-0F0C61CB,"Banthur-Stormrage",0x10511,0x0,19434,"Aimed Shot",0x1,Player-60-0F0C61CB,0000000000000000,569018,621620,1081,12160,2305,0,0,275625,275625,0,1208.91,-4421.43,1,1.2321,440,52602,150591,-1,1,0,0,57096,nil,nil,nil`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.effectiveAmount).toEqual(-52602);
    });

    xit('should parse advanced SWING_DAMAGE_LANDED_SUPPORT', () => {
      const log = `9/11/2024 13:59:45.0032  SWING_DAMAGE_LANDED_SUPPORT,Creature-0-3894-572-21622-221635-0000618628,"King Thoras Trollbane",0x2148,0x0,Player-1329-0A41360A,"Lanafelray-Ravencrest-EU",0x511,0x20,395152,"Ebon Might",0xc,Player-1329-0A41360A,0000000000000000,5898568,6229790,79485,13440,29282,0,17,163,170,0,1279.60,1691.91,0,5.1684,626,2173,2700,-1,1,0,0,0,nil,nil,nil,Player-1390-0CE41B66`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatSupportAction(logLine as unknown as ILogLine, 'retail');
      // console.log(action);
      // (logLine as unknown as ILogLine).parameters.forEach((p, idx) => {
      //   console.log(`${idx} ${p}`);
      // });
      expect(action.srcUnitId).toBe('Creature-0-3894-572-21622-221635-0000618628');
      expect(action.destUnitId).toBe('Player-1329-0A41360A');
      expect(action.spellId).toBe('395152');
      expect(action.spellName).toBe('Ebon Might');
      expect(action.supportActorId).toBe('Player-1390-0CE41B66');
      expect(action.effectiveAmount).toEqual(-2173);
    });

    xit('should parse non-advanced SWING_DAMAGE_LANDED_SUPPORT', () => {
      const log = `9/9/2024 23:21:00.2602  SWING_DAMAGE_LANDED_SUPPORT,Creature-0-4245-572-29372-149555-00005F6672,"Abomination",0x2148,0x0,Player-3713-0B12E270,"Sebowareq-BurningLegion-EU",0x511,0x0,413984,"Shifting Sands",0x40,16349,22235,-1,1,0,0,0,nil,nil,nil,Player-3657-0B141122
    `;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatSupportAction(logLine as unknown as ILogLine, 'retail');
      expect(action.srcUnitId).toBe('Creature-0-4245-572-29372-149555-00005F6672');
      expect(action.destUnitId).toBe('Player-3713-0B12E270');
      expect(action.supportActorId).toBe('Player-3657-0B141122');
      expect(action.effectiveAmount).toEqual(-16349);
    });
  });
});
