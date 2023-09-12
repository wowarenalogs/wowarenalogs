import { Firestore } from '@google-cloud/firestore';
import fs from 'fs';
import _ from 'lodash';
import path from 'path';

const DELETE_BEFORE_TS = 1693548868000; // sep 1 2023

const firestore = new Firestore({
  ignoreUndefinedProperties: true,
  projectId: 'wowarenalogs',
  // always read production credentials because this tool is designed to work on production data
  credentials: JSON.parse(fs.readFileSync(path.join(process.cwd(), './wowarenalogs.json'), 'utf8')),
});

const MATCH_STUBS_COLLECTION = 'match-stubs-prod';
const NUMBER_OF_MATCHES = 500;

export default async function deleteOldest() {
  const collectionReference = firestore.collection(MATCH_STUBS_COLLECTION);
  const matchDocs = await collectionReference.orderBy('endTime', 'asc').limit(NUMBER_OF_MATCHES).get();
  console.log(`fetched ${matchDocs.size} latest matches from firestore. downloading logs...`);

  matchDocs.forEach((doc) => firestore.recursiveDelete(doc.ref));

  if (matchDocs.docs[NUMBER_OF_MATCHES - 1].data().endTime < DELETE_BEFORE_TS) {
    console.log(
      `latest: ${matchDocs.docs[NUMBER_OF_MATCHES - 1].data().endTime} is older than ${DELETE_BEFORE_TS}, repeating`,
    );
    deleteOldest();
  } else {
    console.log(
      `latest: ${matchDocs.docs[NUMBER_OF_MATCHES - 1].data().endTime} is newer than ${DELETE_BEFORE_TS}, stopping`,
    );
  }
}

deleteOldest();
