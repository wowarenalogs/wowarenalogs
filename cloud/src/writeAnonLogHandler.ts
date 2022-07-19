import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import { instanceToPlain } from 'class-transformer';
import md5 from 'md5';
import fetch from 'node-fetch';
import { Readable } from 'stream';
import { WoWCombatLogParser, ICombatData, WowVersion } from 'wow-combat-log-parser';

import { anonymizeDTO, applyCIIMap } from './anonymizer';
import { createStubDTOFromCombat } from './createMatchStub';
import { parseFromStringArrayAsync } from './writeMatchStubHandler';

const anonFilesBucket = process.env.ENV_LOG_FILES_BUCKET || '';
const projectId = process.env.ENV_GCP_PROJECT;
const matchStubsFirestore = process.env.ENV_MATCH_STUBS_FIRESTORE;

const firestore = new Firestore({
  ignoreUndefinedProperties: true,
});

const storage = new Storage({
  projectId,
});

const bucket = storage.bucket(anonFilesBucket);

// In the Google code they actually type file as `data:{}`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(file: any, context: any): Promise<unknown> {
  const fileUrl = `https://storage.googleapis.com/${file.bucket}/${file.name}`;
  console.log(`Opening ${fileUrl}`);
  const response = await fetch(fileUrl);
  const textBuffer = await response.text();

  const ownerId = response.headers.get('x-goog-meta-ownerid') || '';
  const wowVersion = (response.headers.get('x-goog-meta-wow-version') || 'shadowlands') as WowVersion;
  const startTimeUTC = response.headers.get('x-goog-meta-starttime-utc');

  console.log(`Reading file: ${response.status} ${textBuffer.slice(0, 50)}`);
  const stringBuffer = textBuffer.split('\n');
  const combats = await parseFromStringArrayAsync(stringBuffer, wowVersion);
  console.log(`Parsed ${combats.length} combats`);
  const logObjectUrl = fileUrl;
  const stub = createStubDTOFromCombat(combats[0], ownerId, logObjectUrl);
  if (startTimeUTC) {
    // Write the start time based on client-side headers to account for timezone differences
    stub.startTime = parseFloat(startTimeUTC);
    stub.utcCorrected = true;
  }
  const { anonymousStub, ciiMap } = anonymizeDTO(stub);

  // Create stream for the string buffer to land in
  const anonBuffer = stringBuffer.map((line) => applyCIIMap(line, ciiMap));
  const anonReadStream = new Readable();
  anonReadStream.push(anonBuffer.join('\n'));
  anonReadStream.push(null);

  // Set object URL, write stream
  const anonFileName = anonymousStub['id'];
  anonymousStub.logObjectUrl = `https://storage.googleapis.com/${anonFilesBucket}/${anonFileName}`;
  const anonFile = bucket.file(anonFileName);
  const anonStream = anonFile.createWriteStream();
  const promise = new Promise((res, rej) => {
    anonReadStream
      .pipe(anonStream)
      .on('error', function (err) {
        console.log(`Error writing: ${anonFileName}`);
        console.log(err);
        rej(err);
      })
      .on('finish', function () {
        console.log(`Anon log written: ${anonFileName}`);
        const document = firestore.doc(`${matchStubsFirestore}/${anonymousStub['id']}`);
        document.set(instanceToPlain(anonymousStub)).then(() => {
          console.log(`Stub written: ${matchStubsFirestore}/${anonymousStub['id']}`);
          res(true);
        });
      });
  });
  return promise;
}

exports.handler = handler;
