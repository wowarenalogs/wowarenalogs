import { Firestore } from '@google-cloud/firestore';
import fs from 'fs';
import _ from 'lodash';
import path from 'path';

const firestore = new Firestore({
  ignoreUndefinedProperties: true,
  projectId: 'wowarenalogs',
  // always read production credentials because this tool is designed to work on production data
  credentials: JSON.parse(fs.readFileSync(path.join(process.cwd(), './wowarenalogs.json'), 'utf8')),
});

const MATCH_STUBS_COLLECTION = 'match-stubs-prod';

async function main() {
  const collectionReference = firestore.collection(MATCH_STUBS_COLLECTION);
  const docs2v2 = await collectionReference.where('startInfo.bracket', '==', '2v2');
  const docs3v3 = await collectionReference.where('startInfo.bracket', '==', '3v3');
  const docsShuff = await collectionReference.where('startInfo.bracket', '==', 'Rated Solo Shuffle');

  const counts: Record<string, number> = {
    '2v2': (await docs2v2.count().get()).data().count,
    '3v3': (await docs3v3.count().get()).data().count,
    'Rated Solo Shuffle': (await docsShuff.count().get()).data().count,
  };
  _.keys(counts).map((k) => {
    console.log(`Count of ${k}: ${counts[k]}`);
  });
}

main();
