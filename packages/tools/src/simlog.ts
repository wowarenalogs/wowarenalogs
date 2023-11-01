/* eslint-disable no-console */
import { close, open, readFile, write } from 'fs-extra';

const BUFFER_SLEEP_MS = parseInt(process.env.BUFFER_SLEEP_MS || '500');
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '500');

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

async function main() {
  const inputFilePath = process.env.INPUT_PATH?.toString();
  if (!inputFilePath) throw new Error('No input file!');

  const outputFilePath = process.env.OUTPUT_PATH?.toString();
  if (!outputFilePath) throw new Error('No output file!');

  const outputFileName = outputFilePath + `WoWCombatLog-sim-${new Date().getTime()}.txt`;
  console.log(`Reading input log ${inputFilePath}`);
  console.log(`Writing to ${outputFileName}`);
  const fin = await open(inputFilePath, 'r');
  const inputFileBuffer = await readFile(fin);
  const inputString = inputFileBuffer.toString().split('\n');
  for (let i = 0; i < inputString.length; i += CHUNK_SIZE) {
    const chunk = inputString.slice(i, i + CHUNK_SIZE);
    console.log(`chunk ${chunk.length}`);
    await writeSegment(outputFileName, chunk);
    await sleep(BUFFER_SLEEP_MS);
  }
  await close(fin);
}

main();
