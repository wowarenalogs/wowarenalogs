import { appendFileSync, mkdtempSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { DesktopUtils } from './desktopUtils';

// DesktopUtils only uses WoWCombatLogParser as a type, so a stub is enough to observe
// which lines the watcher hands to the parser.
class ParserStub {
  public readonly lines: string[] = [];

  public parseLine(line: string) {
    this.lines.push(line);
  }
}

function logLine(seconds: number, spellName = `Spell${seconds}`) {
  return (
    `9/1/2026 12:00:${seconds.toString().padStart(2, '0')}.000  SPELL_AURA_APPLIED,` +
    `Player-1-A,"A-Realm",0x511,0x0,Player-1-B,"B-Realm",0x512,0x0,${1000 + seconds},"${spellName}",0x1,BUFF`
  );
}

// Mirrors how LogsModule drives the watcher: read everything appended since the last chunk.
class LogFile {
  public readonly path: string;
  public readonly parser = new ParserStub();
  private offset = 0;

  constructor(name: string) {
    this.path = join(mkdtempSync(join(tmpdir(), 'walogs-')), name);
    writeFileSync(this.path, '');
  }

  public append(contents: string | Buffer) {
    appendFileSync(this.path, contents);
    const size = statSync(this.path).size;
    const consumed = DesktopUtils.parseLogFileChunk(this.parser as never, this.path, this.offset, size - this.offset);
    this.offset += consumed ?? 0;
  }
}

describe('parseLogFileChunk', () => {
  it('does not corrupt lines in chunks that follow one ending mid-line', () => {
    const file = new LogFile('WoWCombatLog-mid-line.txt');
    const halfWritten = logLine(3);

    // WoW flushes two whole lines and stops part way through a third.
    file.append(`${logLine(1)}\n${logLine(2)}\n${halfWritten.slice(0, 40)}`);
    // The rest of the third line arrives with a fourth.
    file.append(`${halfWritten.slice(40)}\n${logLine(4)}\n`);
    // An ordinary flush, with nothing partial about it.
    file.append(`${logLine(5)}\n${logLine(6)}\n`);

    expect(file.parser.lines).toEqual([logLine(1), logLine(2), logLine(3), logLine(4), logLine(5), logLine(6)]);
  });

  it('does not corrupt a multi-byte character split across a chunk boundary', () => {
    const file = new LogFile('WoWCombatLog-multibyte.txt');
    const line = logLine(2, '尋找草藥');
    const bytes = Buffer.from(`${line}\n`, 'utf-8');
    // Cut one byte into the first character of the spell name.
    const splitAt = bytes.indexOf(Buffer.from('尋', 'utf-8')) + 1;

    file.append(`${logLine(1)}\n`);
    file.append(bytes.subarray(0, splitAt));
    file.append(bytes.subarray(splitAt));

    expect(file.parser.lines).toEqual([logLine(1), line]);
  });
});
