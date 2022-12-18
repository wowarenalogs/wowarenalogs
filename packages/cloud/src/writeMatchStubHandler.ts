import { Firestore } from '@google-cloud/firestore';
import { instanceToPlain } from 'class-transformer';
import fetch from 'node-fetch';

import { WowVersion } from '../../parser/dist/index';
import { createStubDTOFromArenaMatch, createStubDTOFromShuffleMatch } from './createMatchStub';
import { parseFromStringArrayAsync } from './utils';

const matchStubsFirestore = process.env.ENV_MATCH_STUBS_FIRESTORE;

const firestore = new Firestore({
  ignoreUndefinedProperties: true,
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

  console.log(`Reading file: ${response.status} ${textBuffer.slice(0, 80)}`);
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
    console.log(`writing arena stub ${matchStubsFirestore}/${stub.id}`);
    await document.set(instanceToPlain(stub));
    console.log(`${stub.id} written`);
    return;
  }

  if (parseResults.shuffleMatches.length > 0) {
    const shuffleMatch = parseResults.shuffleMatches[0];
    const stubs = createStubDTOFromShuffleMatch(shuffleMatch, ownerId, logObjectUrl);
    stubs.forEach(async (stub) => {
      console.log(`writing shuffle stub ${stub.id}`);
      const document = firestore.doc(`${matchStubsFirestore}/${stub.id}`);
      await document.set(instanceToPlain(stub));
      console.log(`${stub.id} written`);
    });
    return;
  }
  console.log('Parser did not find useable matches');
}

exports.handler = handler;
