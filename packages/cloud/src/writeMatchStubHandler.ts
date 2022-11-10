import { Firestore } from '@google-cloud/firestore';
import { instanceToPlain } from 'class-transformer';
import fetch from 'node-fetch';

import { WoWCombatLogParser, ICombatData, WowVersion } from '@wowarenalogs/parser';
import { createStubDTOFromCombat } from './createMatchStub';

const matchStubsFirestore = process.env.ENV_MATCH_STUBS_FIRESTORE;
const stage: string = process.env.ENV_STAGE || 'dev';

const firestore = new Firestore({
  ignoreUndefinedProperties: true,
});

export function parseFromStringArrayAsync(buffer: string[], wowVersion: WowVersion): Promise<ICombatData[]> {
  return new Promise((resolve) => {
    const logParser = new WoWCombatLogParser(wowVersion);

    const results: ICombatData[] = [];
    logParser.on('arena_match_ended', (data: ICombatData) => {
      results.push(data);
    });

    for (const line of buffer) {
      logParser.parseLine(line);
    }
    logParser.flush();

    resolve(results);
  });
}

// In the Google code they actually type file as `data:{}`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handler(file: any, context: any) {
  const fileUrl = `https://storage.googleapis.com/${file.bucket}/${file.name}`;

  console.log(`Opening ${fileUrl}`);
  const response = await fetch(fileUrl);
  const textBuffer = await response.text();

  const ownerId = response.headers.get('x-goog-meta-ownerid') || '';
  const wowVersion = (response.headers.get('x-goog-meta-wow-version') || 'retail') as WowVersion;
  const startTimeUTC = response.headers.get('x-goog-meta-starttime-utc');

  console.log(`Reading file: ${response.status} ${textBuffer.slice(0, 50)}`);
  const combats = await parseFromStringArrayAsync(textBuffer.split('\n'), wowVersion);
  console.log(`Parsed ${combats.length} combats`);
  const logObjectUrl = fileUrl;
  const stub = createStubDTOFromCombat(combats[0], ownerId, logObjectUrl);
  if (startTimeUTC) {
    // Write the start time based on client-side headers to account for timezone differences
    stub.startTime = parseFloat(startTimeUTC);
    stub.utcCorrected = true;
  }
  const document = firestore.doc(`${matchStubsFirestore}/${stub['id']}`);
  await document.set(instanceToPlain(stub));
}

exports.handler = handler;
