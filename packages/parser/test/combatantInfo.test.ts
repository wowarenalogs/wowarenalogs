/* eslint-disable no-console */
import { from } from 'rxjs';

import { CombatantInfoAction } from '../src/actions/CombatantInfoAction';
import { stringToLogLine } from '../src/pipeline/common/stringToLogLine';
import { ILogLine } from '../src/types';

describe('pipeline event tests', () => {
  describe('arena start events parsing', () => {
    it('should parse COMBATANT_INFO', () => {
      const log = `1/20/2026 22:28:38.501-5  COMBATANT_INFO,Player-60-0F7BEF5D,0,78,171,8258,817,0,0,0,0,0,0,0,100,0,468,468,468,0,171,452,452,452,718,264,[(80976,101842,1),(81018,101895,1),(81021,101899,1),(81022,101900,1),(81027,101905,1),(81031,101911,1),(81032,101912,1),(81033,101913,1),(81037,101919,1),(81038,101920,1),(81040,101923,1),(81044,101928,1),(81047,101932,1),(81048,101934,1),(81049,101935,1),(81051,101937,1),(81055,101942,1),(81073,101964,1),(94859,117456,1),(94866,117463,1),(94871,117468,1),(94872,117469,1),(94874,117471,1),(94879,117476,1),(94881,117478,1),(94882,117479,1),(94890,117487,1),(94891,117488,1),(99846,123378,1),(103428,127672,1),(103429,127673,2),(103432,127678,1),(103581,127854,1),(103582,127855,2),(103585,127858,1),(103590,127863,1),(103591,127865,1),(103594,127869,1),(103596,127871,1),(103601,127876,1),(103602,127877,1),(103606,127881,1),(103611,127888,1),(103614,127891,2),(103616,127893,1),(94877,117474,1),(103588,127861,1),(81019,101896,1),(110084,136583,1),(81041,101924,1),(103915,128332,1),(81042,101925,1),(81043,101927,2),(103427,127671,2),(103598,127873,1),(110085,136585,1),(103579,127851,1),(103617,127894,2),(103627,127909,1),(103607,127883,1),(103584,127857,1),(103626,127908,1),(103620,127899,1),(103586,127859,1),(103593,127868,1),(109387,135591,1),(109388,135592,1),(103587,127860,1)],(0,462375,460697,204336),[(230334,157,(),(12265,12035,10837,10832,1569),()),(215144,170,(),(11318,10837,10832,9626,12039,12033,8792),()),(237635,170,(),(12034,12033,12290,12233,12675,1491),()),(0,0,(),(),()),(230323,157,(7364,0,0),(12265,12035,1569),()),(230693,167,(),(12285,12032,12239,10837,10832,3257,10255),()),(237636,170,(7534,0,0),(12034,12033,12290,12232,12676,1491),()),(230295,157,(7418,0,0),(12265,12035,1569),()),(230694,167,(7397,0,0),(12285,12032,12239,10837,10832,3257,10255),()),(230332,157,(),(12265,12035,1569),()),(215137,170,(7346,0,0),(11318,10832,10835,9626,12039,12033,8792,10520,8960),(213748,610)),(215137,170,(7346,0,0),(11318,10837,10832,9626,12039,12033,8792,10520,8960),()),(230354,157,(),(12265,12035,1569),()),(230353,157,(),(12265,12035,1569),()),(235499,170,(7415,0,0),(12401,9893,12258),(238045,571)),(230649,170,(7463,0,0),(12290,12033,12034,1569,10255),()),(230657,170,(),(12290,12033,12034,1569,10255),()),(0,0,(),(),())],[],306,0,0,0`;
      let logLine = null;
      from([log])
        .pipe(stringToLogLine('America/New_York'))
        .forEach((line) => (logLine = line));
      expect(logLine).not.toBeNull();
      const action = new CombatantInfoAction(logLine as unknown as ILogLine);
      expect(action.info.teamId).toEqual('0');
      expect(action.logLine.parameters[0]).toEqual('Player-60-0F7BEF5D');
      expect(action.info.specId).toEqual('264');
      expect(action.info.strength).toEqual(78);
      expect(action.info.agility).toEqual(171);
      expect(action.info.stamina).toEqual(8258);
      expect(action.info.intelligence).toEqual(817);
      expect(action.info.dodge).toEqual(0);
      expect(action.info.parry).toEqual(0);
      expect(action.info.block).toEqual(0);
      expect(action.info.critMelee).toEqual(0);
      expect(action.info.critRanged).toEqual(0);
      expect(action.info.critSpell).toEqual(0);
      expect(action.info.speed).toEqual(100);
      expect(action.info.lifesteal).toEqual(0);
      expect(action.info.hasteMelee).toEqual(468);
      expect(action.info.hasteRanged).toEqual(468);
      expect(action.info.hasteSpell).toEqual(468);
      expect(action.info.avoidance).toEqual(0);
      expect(action.info.mastery).toEqual(171);
      expect(action.info.versatilityDamgeDone).toEqual(452);
      expect(action.info.versatilityHealingDone).toEqual(452);
      expect(action.info.versatilityDamageTaken).toEqual(452);
      expect(action.info.armor).toEqual(718);
      expect(action.info.interestingAurasJSON).toEqual('[]');
      // expect(action.info.item28).toEqual(0);
      // expect(action.info.item29).toEqual(0);
    });
  });
});
