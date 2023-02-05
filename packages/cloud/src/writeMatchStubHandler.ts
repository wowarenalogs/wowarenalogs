import { Firestore } from '@google-cloud/firestore';
import { instanceToPlain } from 'class-transformer';
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';

import { WowVersion } from '../../parser/dist/index';
import { createStubDTOFromArenaMatch, createStubDTOFromShuffleMatch } from './createMatchStub';
import { logCombatStatsAsync, parseFromStringArrayAsync } from './utils';

const matchStubsFirestore = process.env.ENV_MATCH_STUBS_FIRESTORE;

const gcpCredentials =
  process.env.NODE_ENV === 'development'
    ? JSON.parse(fs.readFileSync(path.join(__dirname, '../../wowarenalogs-public-dev.json'), 'utf8'))
    : undefined;

const firestore = new Firestore({
  ignoreUndefinedProperties: true,
  credentials: gcpCredentials,
});

// In the Google code they actually type file as `data:{}`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(file: any, _context: any) {
  const fileUrl = `https://storage.googleapis.com/${file.bucket}/${file.name}`;

  console.log(`Opening ${fileUrl}`);
  const response = await fetch(fileUrl);
  const textBuffer = await response.text();

  const ownerId = response.headers.get('x-goog-meta-ownerid') || 'unknown-uploader';
  const wowVersion = (response.headers.get('x-goog-meta-wow-version') || 'retail') as WowVersion;
  const logTimezone = response.headers.get('x-goog-meta-client-timezone') || undefined;

  console.log(`Reading file: ${response.status} ${textBuffer.slice(0, 50)}`);
  console.log(`Parsed timezone ${logTimezone}`);

  const parseResults = await parseFromStringArrayAsync(textBuffer.split('\n'), wowVersion, logTimezone);
  console.log(
    `Parsed arenaMatchesLength=${parseResults.arenaMatches.length} shuffleMatchesLength=${parseResults.shuffleMatches.length}`,
  );
  const logObjectUrl = fileUrl;

  if (parseResults.arenaMatches.length > 0) {
    const arenaMatch = parseResults.arenaMatches[0];
    console.log(arenaMatch.startInfo.bracket);
    if (arenaMatch.startInfo.bracket === 'Rated BG') {
      console.log('RBG detected, skipping');
      return;
    }
    const stub = createStubDTOFromArenaMatch(arenaMatch, ownerId, logObjectUrl);
    const document = firestore.doc(`${matchStubsFirestore}/${stub.id}`);
    console.log(`writing ${matchStubsFirestore}/${stub.id}`);
    await document.set(instanceToPlain(stub));
    await logCombatStatsAsync(arenaMatch, stub);
    return;
  }

  if (parseResults.shuffleMatches.length > 0) {
    const shuffleMatch = parseResults.shuffleMatches[0];
    const stubs = createStubDTOFromShuffleMatch(shuffleMatch, ownerId, logObjectUrl);
    stubs.forEach(async ([stub, round]) => {
      console.log(`processing stub ${stub.id}`);
      const document = firestore.doc(`${matchStubsFirestore}/${stub.id}`);
      await document.set(instanceToPlain(stub));
      await logCombatStatsAsync(round, stub);
    });
    return;
  }
  console.log('Parser did not find useable matches');
}

exports.handler = handler;
