import { Firestore } from '@google-cloud/firestore';
import { Storage as GoogleCloudStorage } from '@google-cloud/storage';
import { instanceToPlain } from 'class-transformer';
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { Readable } from 'stream';

import { WowVersion } from '../../parser/dist/index';
import { anonymizeDTO, applyCIIMap } from './anonymizer';
import { createStubDTOFromArenaMatch } from './createMatchStub';
import { parseFromStringArrayAsync } from './utils';

const anonFilesBucket = process.env.ENV_LOG_FILES_BUCKET || 'wowarenalogs-anon-log-files-prod';
const matchStubsFirestore = process.env.ENV_MATCH_STUBS_FIRESTORE;

const gcpCredentials =
  process.env.NODE_ENV === 'development'
    ? JSON.parse(fs.readFileSync(path.join(__dirname, '../../wowarenalogs-public-dev.json'), 'utf8'))
    : undefined;

const firestore = new Firestore({
  ignoreUndefinedProperties: true,
  credentials: gcpCredentials,
});

const storage = new GoogleCloudStorage({
  credentials: gcpCredentials,
});

const DF_S1_LAUNCH_DATE = 1670734800000;

// In the Google code they actually type file as `data:{}`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(file: any, _context: any): Promise<unknown> {
  const bucket = storage.bucket(anonFilesBucket);
  const fileUrl = `https://storage.googleapis.com/${file.bucket}/${file.name}`;
  console.log(`Opening ${fileUrl}`);
  const response = await fetch(fileUrl);
  const textBuffer = await response.text();

  const ownerId = response.headers.get('x-goog-meta-ownerid') || 'unknown-uploader';
  const wowVersion = (response.headers.get('x-goog-meta-wow-version') || 'retail') as WowVersion;
  const logTimezone = response.headers.get('x-goog-meta-client-timezone') || undefined;
  let utcStartTime = Infinity;
  try {
    utcStartTime = parseInt(response.headers.get('x-goog-meta-starttime-utc') || '') || Infinity;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.log(`Failed to parse utc time header ${error.message}`);
  }

  if (utcStartTime < DF_S1_LAUNCH_DATE) {
    console.log(`Log file too old, skipping ${utcStartTime}`);
    return;
  }

  console.log(`Reading file: ${response.status} ${textBuffer.slice(0, 50)}`);
  const stringBuffer = textBuffer.split('\n');
  const results = await parseFromStringArrayAsync(stringBuffer, wowVersion, logTimezone);
  if (results.arenaMatches.length === 0 && results.shuffleMatches.length > 0) {
    console.log('Match is a shuffle, skipping');
    return;
  }
  console.log(`Parsed ${results.arenaMatches.length} arenaMatches`);
  const logObjectUrl = fileUrl;
  const stub = createStubDTOFromArenaMatch(results.arenaMatches[0], ownerId, logObjectUrl);
  const { anonymousStub, ciiMap } = anonymizeDTO(stub);

  // Create stream for the string buffer to land in
  const anonBuffer = stringBuffer.map((line) => applyCIIMap(line, ciiMap));
  const anonReadStream = new Readable();
  anonReadStream.push(anonBuffer.join('\n'));
  anonReadStream.push(null);

  // Set object URL, write stream
  const anonFileName = anonymousStub.id;
  anonymousStub.logObjectUrl = `https://storage.googleapis.com/${anonFilesBucket}/${anonFileName}`;
  const anonFile = bucket.file(anonFileName);
  const anonStream = anonFile.createWriteStream();
  const promise = new Promise((res, rej) => {
    anonReadStream
      .pipe(anonStream)
      .on('error', function (err: unknown) {
        console.log(`Error writing: ${anonFileName}`);
        console.log(err);
        rej(err);
      })
      .on('finish', function () {
        console.log(`Anon log written: ${anonFileName}`);
        const document = firestore.doc(`${matchStubsFirestore}/${anonymousStub.id}`);
        document.set(instanceToPlain(anonymousStub)).then(() => {
          console.log(`Stub written: ${matchStubsFirestore}/${anonymousStub.id}`);
          res(true);
        });
      });
  });
  return promise;
}

exports.handler = handler;
