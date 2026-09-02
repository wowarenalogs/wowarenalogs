/* eslint-disable no-console */
import { close, open, readFile, write } from 'fs-extra';

const BUFFER_SLEEP_MS = parseInt(process.env.BUFFER_SLEEP_MS || '500');
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '500');
const PARTIAL_LINES = process.env.PARTIAL_LINES === '1';
const FLUSH_SLEEP_MS = parseInt(process.env.FLUSH_SLEEP_MS || '250');

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeSegment(fileName: string, segment: string[]) {
  const outputFile = await open(fileName, 'a+');
  for (let i = 0; i < segment.length; i++) {
    const line = segment[i];
    await write(outputFile, line + '\n');
  }
  await close(outputFile);
}

// Writes the same bytes as writeSegment, but as two flushes cut inside the
// segment's final line, so a reader that polls on file size can observe the file
// part way through a line. wow writes this way; writeSegment cannot, because a
// whole line per write leaves the file newline-aligned at every observable moment.
//
// The pair matters, not just the first half: the mid-line flush is what a reader
// has to buffer, and the flush that completes the line lands exactly on its
// newline, which is the case a reader is most likely to mishandle.
async function writeSegmentSplit(fileName: string, segment: string[]) {
  if (segment.length === 0) {
    return;
  }
  const outputFile = await open(fileName, 'a+');
  const bytes = Buffer.from(segment.map((line) => line + '\n').join(''), 'utf-8');
  const lastLineBytes = Buffer.byteLength(segment[segment.length - 1] + '\n', 'utf-8');
  const cut = Math.max(1, bytes.length - Math.floor(lastLineBytes / 2));

  await write(outputFile, bytes, 0, cut);
  // Long enough for the watcher to fire and read while the line is incomplete.
  // Without this the whole segment lands before anyone looks and the split is moot.
  await sleep(FLUSH_SLEEP_MS);
  await write(outputFile, bytes, cut, bytes.length - cut);
  await close(outputFile);
}

async function main() {
  const inputFilePath = process.env.INPUT_PATH?.toString();
  if (!inputFilePath) throw new Error('No input file!');

  const outputFilePath = process.env.OUTPUT_PATH?.toString();
  if (!outputFilePath) throw new Error('No output file!');

  const outputFileName = outputFilePath + `WoWCombatLog-sim-${new Date().getTime()}.txt`;
  console.log(`Reading input log ${inputFilePath}`);
  console.log(`Writing to ${outputFileName}`);
  if (PARTIAL_LINES) {
    console.log(`Splitting each chunk mid-line, ${FLUSH_SLEEP_MS}ms between the two flushes`);
  }
  const fin = await open(inputFilePath, 'r');
  const inputFileBuffer = await readFile(fin);
  const inputString = inputFileBuffer.toString().split('\n');
  for (let i = 0; i < inputString.length; i += CHUNK_SIZE) {
    const chunk = inputString.slice(i, i + CHUNK_SIZE);
    console.log(`chunk ${chunk.length}`);
    await (PARTIAL_LINES ? writeSegmentSplit(outputFileName, chunk) : writeSegment(outputFileName, chunk));
    await sleep(BUFFER_SLEEP_MS);
  }
  await close(fin);
}

main();
