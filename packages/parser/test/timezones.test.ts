import { from } from 'rxjs';

import { ILogLine } from '../src';
import { stringToLogLine } from '../src/pipeline/common/stringToLogLine';

describe('parsing timezones', () => {
  xit('should parse negative tzs 4', () => {
    const log =
      '9/21/2024 16:02:11.667-4  SPELL_AURA_REFRESH,Player-113-0A019857,"Gadowscar-Windrunner-US",0x514,0x0,Player-1427-0E3777DF,"Ârty-Ragnaros-US",0x514,0x0,1126,"Mark of the Wild",0x8,BUFF';
    let logLine = null;
    from([log])
      .pipe(stringToLogLine('America/New_York'))
      .forEach((line) => (logLine = line));

    expect((logLine as unknown as ILogLine).timestamp).toBe(1726948931667);
  });

  xit('should parse negative tzs 11', () => {
    const log =
      '9/21/2024 17:10:42.107-11  SPELL_AURA_APPLIED,Player-60-0F8CD2A6,"Zyriannah-Stormrage-US",0x548,0x0,Player-60-0F8CD2A6,"Zyriannah-Stormrage-US",0x548,0x0,452226,"Spiderling",0x1,BUFF';
    let logLine = null;
    from([log])
      .pipe(stringToLogLine('America/New_York'))
      .forEach((line) => (logLine = line));

    expect((logLine as unknown as ILogLine).timestamp).toBe(1726978242107);
  });

  xit('should parse positive tzs 0', () => {
    const log =
      '9/22/2024 04:12:04.5370  SPELL_AURA_APPLIED,Player-1427-0CD590D3,"Valnarck-Ragnaros-US",0x518,0x0,Player-1427-0CD590D3,"Valnarck-Ragnaros-US",0x518,0x0,462854,"Skyfury",0x8,BUFF';
    let logLine = null;
    from([log])
      .pipe(stringToLogLine('America/New_York'))
      .forEach((line) => (logLine = line));

    expect((logLine as unknown as ILogLine).timestamp).toBe(1726978324537);
  });

  xit('should parse positive tzs 12', () => {
    const log =
      '9/22/2024 14:34:46.26612  SPELL_AURA_APPLIED,Player-3676-0DD9F5E0,"Vaingalor-Area52-US",0x512,0x0,Player-3676-0DD9F5E0,"Vaingalor-Area52-US",0x512,0x0,154797,"Touch of Elune - Night",0x1,BUFF';
    let logLine = null;
    from([log])
      .pipe(stringToLogLine('America/New_York'))
      .forEach((line) => (logLine = line));

    expect((logLine as unknown as ILogLine).timestamp).toBe(1726972486266);
  });
});
