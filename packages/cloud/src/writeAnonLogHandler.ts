import { Firestore } from '@google-cloud/firestore';
import { Storage as GoogleCloudStorage } from '@google-cloud/storage';
import { instanceToPlain } from 'class-transformer';
import fetch from 'node-fetch';
import { Readable } from 'stream';

import { WowVersion } from '../../parser/dist/index';
import { anonymizeDTO, applyCIIMap } from './anonymizer';
import { createStubDTOFromArenaMatch } from './createMatchStub';
import { parseFromStringArrayAsync } from './writeMatchStubHandler';

const anonFilesBucket = process.env.ENV_LOG_FILES_BUCKET || '';
const projectId = process.env.ENV_GCP_PROJECT;
const matchStubsFirestore = process.env.ENV_MATCH_STUBS_FIRESTORE;

const firestore = new Firestore({
  ignoreUndefinedProperties: true,
});

const storage = new GoogleCloudStorage({
  projectId,
});

const bucket = storage.bucket(anonFilesBucket);

// In the Google code they actually type file as `data:{}`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(file: any, _context: any): Promise<unknown> {
  const fileUrl = `https://storage.googleapis.com/${file.bucket}/${file.name}`;
  console.log(`Opening ${fileUrl}`);
  const response = await fetch(fileUrl);
  const textBuffer = await response.text();

  const ownerId = response.headers.get('x-goog-meta-ownerid') || 'unknown-uploader';
  const wowVersion = (response.headers.get('x-goog-meta-wow-version') || 'retail') as WowVersion;
  const logTimezone = response.headers.get('x-goog-meta-client-timezone') || undefined;

  console.log(`Reading file: ${response.status} ${textBuffer.slice(0, 50)}`);
  const stringBuffer = textBuffer.split('\n');
  const results = await parseFromStringArrayAsync(stringBuffer, wowVersion, logTimezone);
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
      .on('error', function (err: any) {
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
