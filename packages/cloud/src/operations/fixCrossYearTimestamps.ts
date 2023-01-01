import { Firestore } from '@google-cloud/firestore';
import fs from 'fs';
import _ from 'lodash';
import path from 'path';

import { ICombatDataStub } from '../../../shared/src/graphql-server/types';

const firestore = new Firestore({
  ignoreUndefinedProperties: true,
  projectId: 'wowarenalogs',
  // always read production credentials because this tool is designed to work on production data
  credentials: JSON.parse(fs.readFileSync(path.join(process.cwd(), './wowarenalogs.json'), 'utf8')),
});

const MATCH_STUBS_COLLECTION = 'match-stubs-prod';
const MAX_REASONABLE_TIMESTAMP = 1675238400000; // 2023-02-01

const fixTimestamp = (timestamp: number) => {
  let result = timestamp;
  while (result >= MAX_REASONABLE_TIMESTAMP) {
    result = result - 1000 * 60 * 60 * 24 * 365;
  }
  return result;
};

const processDocAsync = async function (dryrun: boolean, doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const matchStub = doc.data() as ICombatDataStub;
  const fix: Record<string, unknown> = {};
  fix['startTime'] = fixTimestamp(matchStub.startTime);
  fix['endTime'] = fixTimestamp(matchStub.endTime);
  fix['startInfo'] = {
    timestamp: fixTimestamp(matchStub.startInfo.timestamp),
  };
  if (matchStub.dataType === 'ArenaMatch') {
    fix['endInfo'] = {
      timestamp: fixTimestamp(matchStub.endInfo.timestamp),
    };
  } else if (matchStub.shuffleMatchEndInfo) {
    fix['shuffleMatchEndInfo'] = {
      timestamp: fixTimestamp(matchStub.shuffleMatchEndInfo.timestamp),
    };
  }

  if (dryrun) {
    console.log(`would update ${doc.id} with ${JSON.stringify(fix)}`);
  } else {
    await doc.ref.set(fix, {
      merge: true,
    });
  }
};

async function fixCrossYearTimestamps(dryrun = false) {
  console.log('Starting to fix cross year timestamps');

  const collectionReference = firestore.collection(MATCH_STUBS_COLLECTION);
  // look for matches who started after 2023/02/01 - these are the matches that are affected by the bug
  const matchDocs = await collectionReference.where('startTime', '>=', 1675238400000).get();
  console.log(`fetched ${matchDocs.size} matches from firestore`);

  const promises = matchDocs.docs.map((doc) => processDocAsync(dryrun, doc));
  await Promise.all(promises);

  if (dryrun) {
    console.log(`${matchDocs.size} matches would be updated`);
  } else {
    console.log(`${matchDocs.size} matches updated`);
  }
}

fixCrossYearTimestamps(false);
