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
  console.time('writeMatchHandler');
  const fileUrl = `https://storage.googleapis.com/${file.bucket}/${file.name}`;

  console.log(`Opening ${fileUrl}`);
  console.time('fetch log file');
  const response = await fetch(fileUrl);
  const textBuffer = await response.text();
  console.timeEnd('fetch log file');
  console.log(`Read ${textBuffer.length} bytes from ${fileUrl}`);

  const ownerId = response.headers.get('x-goog-meta-ownerid') || 'unknown-uploader';
  const wowVersion = (response.headers.get('x-goog-meta-wow-version') || 'retail') as WowVersion;
  const logTimezone = response.headers.get('x-goog-meta-client-timezone') || undefined;

  console.log(`Reading file: ${response.status} ${textBuffer.slice(0, 50)}`);
  console.log(`Parsed timezone ${logTimezone}`);

  console.time('parseFromStringArrayAsync');
  const parseResults = await parseFromStringArrayAsync(textBuffer.split('\n'), wowVersion, logTimezone);
  console.timeEnd('parseFromStringArrayAsync');
  console.log(
    `Parsed arenaMatchesLength=${parseResults.arenaMatches.length} shuffleMatchesLength=${parseResults.shuffleMatches.length}`,
  );
  const logObjectUrl = fileUrl;

  if (parseResults.arenaMatches.length > 0) {
    const arenaMatch = parseResults.arenaMatches[0];
    console.log(arenaMatch.startInfo.bracket);
    if (arenaMatch.startInfo.bracket === 'Rated BG') {
      console.log('RBG detected, skipping');
      console.timeEnd('writeMatchHandler');
      return;
    }
    const stub = createStubDTOFromArenaMatch(arenaMatch, ownerId, logObjectUrl);
    console.time('firestore.doc');
    const document = firestore.doc(`${matchStubsFirestore}/${stub.id}`);
    console.timeEnd('firestore.doc');
    console.log(`writing ${matchStubsFirestore}/${stub.id}`);
    console.time('firestore.set');
    await document.set(instanceToPlain(stub));
    console.timeEnd('firestore.set');
    try {
      console.time('logCombatStatsAsync');
      await logCombatStatsAsync(arenaMatch, stub, ownerId);
      console.timeEnd('logCombatStatsAsync');
    } catch (e) {
      console.error(e);
    }
    console.log('match writring done');
    console.timeEnd('writeMatchHandler');
    return;
  }

  if (parseResults.shuffleMatches.length > 0) {
    console.time('writing shuffle match data');
    const shuffleMatch = parseResults.shuffleMatches[0];
    const stubs = createStubDTOFromShuffleMatch(shuffleMatch, ownerId, logObjectUrl);
    const firestorePromises = stubs.map(async ([stub, round]) => {
      console.log(`processing stub ${stub.id}`);
      const document = firestore.doc(`${matchStubsFirestore}/${stub.id}`);
      console.time(`firestore.set-${round.id}`);
      await document.set(instanceToPlain(stub));
      console.timeEnd(`firestore.set-${round.id}`);
    });
    const prismaPromises = stubs.map(async ([stub, round]) => {
      try {
        console.time(`logCombatStatsAsync-${round.id}`);
        await logCombatStatsAsync(round, stub, ownerId);
        console.timeEnd(`logCombatStatsAsync-${round.id}`);
      } catch (e) {
        console.error(e);
      }
    });
    await Promise.allSettled([...firestorePromises, ...prismaPromises]);
    console.timeEnd('writing shuffle match data');
    console.timeEnd('writeMatchHandler');
    return;
  }
  console.log('Parser did not find useable matches');
  console.timeEnd('writeMatchHandler');
}
