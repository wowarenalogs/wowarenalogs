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
        '2/6/2024 00:39:34.038  SPELL_DAMAGE,Player-57-0ABB28BC,"Raikendk-Illidan",0x10548,0x0,Player-57-0BDDB09C,"Notórious-Illidan",0x512,0x0,253597,"Inexorable Assault",0x10,Player-57-0BDDB09C,0000000000000000,21506,22520,898,342,524,0,0,8513,8513,0,-2022.75,6669.33,0,4.8573,125,206,203,-1,16,0,0,0,nil,nil,nil';
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
        '2/6/2024 00:39:34.038  SPELL_DAMAGE,Player-57-0ABB28BC,"Raikendk-Illidan",0x10548,0x0,Player-57-0BDDB09C,"Notórious-Illidan",0x512,0x0,253597,"Inexorable Assault",0x10,Player-57-0BDDB09C,0000000000000000,21506,22520,898,342,524,0,0,8513,8513,0,-2022.75,6669.33,0,4.8573,125,206,203,-1,16,5,4,2,1,3,nil';
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));

      expect(logLine).not.toBeNull();

      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.amount).toEqual(-206);
      expect(action.isCritical).toEqual(true);
    });

    it('should parse COMBATANT_INFO with weird talent data', () => {
      // See: [,(102378,126441,1) section
      // array of talents has some weird first entry that is an empty object and prints as an empty string :\
      const log =
        '9/27/2024 21:15:17.791-8  COMBATANT_INFO,Player-57-0D7FB856,0,12056,58463,330404,16207,0,0,0,2072,2072,2072,0,0,4825,4825,4825,0,8729,18376,18376,18376,36664,253,[,(102378,126441,1),(94987,117584,1),(94957,117554,1),(94959,123779,1),(94960,117557,1),(94961,117558,1),(94968,117565,1),(94974,117571,1),(94982,117579,1),(94983,117580,1),(94986,117583,1),(94993,117590,1),(99832,123348,1),(102292,126352,1),(102336,126397,1),(102337,126398,1),(102339,126400,1),(102340,126402,1),(102343,126405,1),(102344,126406,1),(102345,126407,1),(102346,126408,1),(102347,126409,1),(102348,126410,2),(102349,126411,1),(102351,126413,1),(102352,126414,1),(102353,126415,1),(102354,126416,1),(102357,126419,1),(102358,126420,1),(102360,126422,1),(102361,126423,1),(102364,126426,2),(102365,126427,1),(102367,126430,2),(102368,126431,1),(102369,126432,1),(102373,126436,1),(102376,126439,1),(102377,126440,1),(102380,126443,1),(102381,126444,1),(102386,126449,1),(102387,126450,1),(102388,126451,1),(102390,126453,1),(102391,126454,1),(102393,126457,1),(102395,126459,1),(102396,126460,2),(102397,126461,1),(102401,126465,1),(102403,126467,1),(102404,126468,1),(102405,126469,1),(102406,126470,1),(102407,126471,1),(102408,126472,1),(102409,126473,1),(102410,126474,1),(102411,126475,1),(102414,126478,1),(102415,126480,1),(102416,126481,1),(102417,126482,1),(102418,126483,1),(102421,126486,1),(102422,126488,1),(102739,126830,1)],(0,202746,356719,203340),[(212020,639,(),(11086,10273,10837,10832,11087,10371,1498,10876),()),(218431,626,(),(10289,11084,10837,10832,1485),()),(218380,626,(),(10289,11084,1485),()),(0,0,(),(),()),(217135,639,(),(11318,9626,10842,10520,8960,8794),()),(218415,626,(),(10289,11084,10837,10832,1485),()),(218407,626,(),(10289,11084,1485),()),(217134,639,(),(11318,9625,10842,10520,8960,8794),()),(223838,636,(),(10278,11141,10377,10837,10832,3172,10255),()),(218369,626,(),(10289,11084,1485),()),(218428,626,(),(10289,11084,10837,10832,1485),()),(218427,626,(),(10289,11084,10837,10832,1485),()),(218422,626,(),(10289,11084,1485),()),(218421,626,(),(10289,11084,1485),()),(223842,636,(),(10278,11141,10377,3172,10255),()),(218446,626,(),(10289,11084,1485),()),(0,0,(),(),()),(5976,1,(),(),())],[Player-86-0A3DB8BD,21562,Player-57-0D702BDD,1126],125,38,1204,209';
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));

      expect(logLine).not.toBeNull();
    });

    it('should parse _HEAL for crit=false', () => {
      const log = `1/16/2024 10:29:00.116  SPELL_PERIODIC_HEAL,Player-57-0D68496B,"Gumbys-Illidan",0x548,0x0,Player-3693-0A0860FC,"Currency-Kel'Thuzad",0x548,0x0,61295,"Riptide",0x8,Player-3693-0A0860FC,0000000000000000,409530,409530,10726,1421,8309,0,1,0,1000,0,1275.36,1664.57,0,0.1180,417,2988,2988,2988,0,nil`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.isCritical).toEqual(false);
    });

    it('should parse _HEAL for crit=true', () => {
      const log = `1/16/2024 10:29:00.116  SPELL_PERIODIC_HEAL,Player-57-0D68496B,"Gumbys-Illidan",0x548,0x0,Player-3693-0A0860FC,"Currency-Kel'Thuzad",0x548,0x0,61295,"Riptide",0x8,Player-3693-0A0860FC,0000000000000000,409530,409530,10726,1421,8309,0,1,0,1000,0,1275.36,1664.57,0,0.1180,417,2988,2988,2988,0,1`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.isCritical).toEqual(true);
    });

    it('should parse SWING_DAMAGE for crit=false', () => {
      const log = `1/16/2024 10:29:10.293  SWING_DAMAGE,Player-3209-0B7ABE8D,"Tokari-Azralon",0x512,0x20,Player-127-0A64DF62,"Billgluckman-Drak'Tharon",0x10548,0x0,Player-3209-0B7ABE8D,0000000000000000,349620,349620,11105,1420,8393,0,1,507,1000,0,1288.34,1644.27,0,3.2055,418,3502,6288,-1,1,0,0,0,nil,nil,nil`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.isCritical).toEqual(false);
    });

    it('should parse SWING_DAMAGE for crit=true', () => {
      const log = `1/16/2024 10:29:10.293  SWING_DAMAGE,Player-3209-0B7ABE8D,"Tokari-Azralon",0x512,0x20,Player-127-0A64DF62,"Billgluckman-Drak'Tharon",0x10548,0x0,Player-3209-0B7ABE8D,0000000000000000,349620,349620,11105,1420,8393,0,1,507,1000,0,1288.34,1644.27,0,3.2055,418,3502,6288,-1,1,0,0,0,1,nil,nil`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.isCritical).toEqual(true);
    });

    it('should parse SPELL_DAMAGE_SUPPORT', () => {
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

    it('should parse SPELL_PERIODIC_DAMAGE_SUPPORT', () => {
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

    it('should parse RANGE_DAMAGE_SUPPORT', () => {
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

    it('should parse SPELL_HEAL_SUPPORT', () => {
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

    it('should parse SPELL_PERIODIC_HEAL_SUPPORT', () => {
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
    it('should parse party kill events', () => {
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

    it('should parse Classic log correctly', () => {
      const log =
        '5/21/2024 16:35:39.437  SPELL_DAMAGE,Player-4395-01C5EEA8,"Assinoth-Whitemane",0x511,0x0,Player-4700-01A0750A,"Darshath-Kirtonos",0x10548,0x0,17348,"Hemorrhage",0x1,Player-4700-01A0750A,0000000000000000,89,100,28,327,957,0,4844,7239,0,4028.03,2925.57,0,4.7879,75,371,389,-1,1,0,0,0,nil,nil,nil';
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
      const log = `7/5/2024 17:55:45.405  SPELL_ABSORBED,Player-60-0F1108AA,"Beastmystery-Stormrage",0x548,0x0,Player-60-0F0C61CB,"Banthur-Stormrage",0x10511,0x0,19434,"Aimed Shot",0x1,Player-60-0F0C61CB,"Banthur-Stormrage",0x10511,0x0,17,"Power Word: Shield",0x2,57096,150591,nil`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatAbsorbAction(logLine as unknown as ILogLine, 'retail');
      expect(action.effectiveAmount).toEqual(57096);
    });

    it('should parse SPELL_ABSORBED+SPELL_DAMAGE pt2', () => {
      const log = `7/5/2024 17:55:45.405  SPELL_DAMAGE,Player-60-0F1108AA,"Beastmystery-Stormrage",0x548,0x0,Player-60-0F0C61CB,"Banthur-Stormrage",0x10511,0x0,19434,"Aimed Shot",0x1,Player-60-0F0C61CB,0000000000000000,569018,621620,1081,12160,2305,0,0,275625,275625,0,1208.91,-4421.43,1,1.2321,440,52602,150591,-1,1,0,0,57096,nil,nil,nil`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatHpUpdateAction(logLine as unknown as ILogLine, 'retail');
      expect(action.effectiveAmount).toEqual(-52602);
    });

    it('should parse advanced SWING_DAMAGE_LANDED_SUPPORT', () => {
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

    it('should parse non-advanced SWING_DAMAGE_LANDED_SUPPORT', () => {
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
