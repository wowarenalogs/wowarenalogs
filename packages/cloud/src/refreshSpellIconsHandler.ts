import { Firestore } from '@google-cloud/firestore';
import { Storage as GoogleCloudStorage } from '@google-cloud/storage';
import { writeFileSync } from 'fs-extra';
import _ from 'lodash';
import path from 'path';
import superagent from 'superagent';

import { AtomicArenaCombat } from '../../parser/dist/index';
import { ICombatDataStub } from '../../shared/src/graphql-server/types';
import { parseFromStringArrayAsync } from './utils';

const isDev = process.env.NODE_ENV === 'development';
if (isDev) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config();
}
const firestore = new Firestore({
  ignoreUndefinedProperties: true,
  credentials: isDev
    ? JSON.parse(Buffer.from(process.env.GCP_KEY_JSON_BASE64 || '', 'base64').toString('ascii'))
    : undefined,
});
const storage = new GoogleCloudStorage();
const bucket = storage.bucket('images.wowarenalogs.com');

const MATCH_STUBS_COLLECTION = isDev ? 'match-stubs-dev' : 'match-stubs-prod';
const NUMBER_OF_MATCHES = 100;

// returns whether a new spell icon was created
const processSpellIdAsync = async (spellId: string): Promise<boolean> => {
  const exists = await bucket.file(`spells/${spellId}.jpg`).exists();
  // google api design decides that file.exists() returns an array of a single boolean FML
  if (exists && exists[0]) {
    return false;
  }

  const response = await superagent.get(`https://www.wowhead.com/spell=${spellId}`);
  if (!response.ok) {
    return false;
  }

  const regex = /WH\.ge\([^)]+\)\.appendChild\(Icon\.create\("([a-zA-Z0-9_-]+)"/;
  const regexMatches = response.text.match(regex);
  if (!regexMatches || regexMatches.length < 2) {
    return false;
  }

  const imgUrl = `https://wow.zamimg.com/images/wow/icons/large/${regexMatches[1]}.jpg`;
  const imgResponse = await superagent.get(imgUrl);
  if (!imgResponse.ok) {
    return false;
  }

  const writeFilePath = path.join(__dirname, `${spellId}.jpg`);
  writeFileSync(writeFilePath, imgResponse.body);
  await bucket.upload(writeFilePath, {
    destination: `spells/${spellId}.jpg`,
    contentType: 'image/jpeg',
  });
  return true;
};

export async function handler(_event: unknown, _context: unknown, callback: () => void) {
  console.log('refreshSpellIconsHandler started');

  const collectionReference = firestore.collection(MATCH_STUBS_COLLECTION);
  const matchDocs = await collectionReference
    .where('wowVersion', '==', 'retail')
    .orderBy('startTime', 'desc')
    .limit(NUMBER_OF_MATCHES)
    .get();
  console.log(`fetched ${matchDocs.size} latest matches from firestore. downloading logs...`);

  const totalMatches = matchDocs.size;
  let parsedMatches = 0;
  let failedMatches = 0;

  const allSpellIds = new Set<string>();
  const processMatchAsync = async (match: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>) => {
    const stub = match.data() as ICombatDataStub;
    try {
      const response = await superagent.get(stub.logObjectUrl);
      if (response.ok) {
        const results = await parseFromStringArrayAsync(response.text.split('\n'), 'retail');

        const spellIds = _.uniq(
          (results.arenaMatches as AtomicArenaCombat[])
            .concat(results.shuffleMatches.flatMap((m) => m.rounds))
            .flatMap((m) => {
              return _.values(m.units).flatMap((unit) => {
                return unit.spellCastEvents
                  .map((e) => e.spellId)
                  .concat(
                    unit.absorbsIn.map((e) => e.spellId),
                    unit.absorbsIn.map((e) => e.shieldSpellId),
                    unit.absorbsOut.map((e) => e.spellId),
                    unit.absorbsOut.map((e) => e.shieldSpellId),
                    unit.damageIn.map((e) => e.spellId),
                    unit.damageOut.map((e) => e.spellId),
                    unit.healIn.map((e) => e.spellId),
                    unit.healOut.map((e) => e.spellId),
                    unit.auraEvents.map((e) => e.spellId),
                    unit.advancedActions.map((e) => e.spellId),
                  )
                  .filter((id) => id);
              });
            }),
        );

        spellIds.forEach((id) => {
          if (id) {
            allSpellIds.add(id);
          }
        });

        parsedMatches++;
      }
    } catch (e) {
      console.log(`failed to parse match ${stub.id}`, JSON.stringify(e));
      failedMatches++;
    }
  };

  const matchDocChunks = _.chunk(matchDocs.docs, 16);
  for (const chunk of matchDocChunks) {
    await Promise.all(chunk.map(processMatchAsync));
  }

  console.log(`${parsedMatches}/${totalMatches} matches parsed. ${failedMatches} failed.`);
  console.log(`found a total of ${allSpellIds.size} unique spells.`);

  let newSpellIcons = 0;
  const processAsync = async (spellId: string) => {
    const created = await processSpellIdAsync(spellId);
    if (created) newSpellIcons++;
  };

  const spellIdChunks = _.chunk(Array.from(allSpellIds.values()), 8);
  for (const chunk of spellIdChunks) {
    await Promise.all(chunk.map(processAsync));
  }
  console.log(`${newSpellIcons}/${allSpellIds.size} spell icons added.`);

  callback();
}

exports.handler = handler;
