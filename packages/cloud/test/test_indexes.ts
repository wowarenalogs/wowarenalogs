import { Firestore } from '@google-cloud/firestore';
import fs from 'fs';
import path from 'path';

const MAX_RESULTS_PER_QUERY = 1;

const matchAnonStubsCollection = 'match-anon-stubs-prod';

const gcpCredentials =
  process.env.NODE_ENV === 'development'
    ? JSON.parse(fs.readFileSync(path.join(__dirname, '../../wowarenalogs-public-dev.json'), 'utf8'))
    : undefined;

const firestore = new Firestore({
  credentials: gcpCredentials,
});

const collectionReference = firestore.collection(matchAnonStubsCollection);
const docsQuery = collectionReference.orderBy('startTime', 'desc').limit(MAX_RESULTS_PER_QUERY);

docsQuery
  .where('startInfo.bracket', '==', true)
  .get()
  .then((docsQ) => docsQ.docs.map((d) => d.data()))
  .catch((e) => console.log(e));
docsQuery
  .where('extra.gte1800', '==', true)
  .where('startInfo.bracket', '==', true)
  .get()
  .then((docsQ) => docsQ.docs.map((d) => d.data()))
  .catch((e) => console.log(e));
docsQuery
  .where('extra.gte1400', '==', true)
  .where('startInfo.bracket', '==', true)
  .get()
  .then((docsQ) => docsQ.docs.map((d) => d.data()))
  .catch((e) => console.log(e));
docsQuery
  .where('extra.doubleSidedSpecsWLHS', 'array-contains', '22x22')
  .where('startInfo.bracket', '==', true)
  .get()
  .then((docsQ) => docsQ.docs.map((d) => d.data()))
  .catch((e) => console.log(e));
docsQuery
  .where('extra.doubleSidedSpecs', 'array-contains', '22x22')
  .where('startInfo.bracket', '==', true)
  .get()
  .then((docsQ) => docsQ.docs.map((d) => d.data()))
  .catch((e) => console.log(e));
docsQuery
  .where('extra.singleSidedSpecsWinners', 'array-contains', '22')
  .where('startInfo.bracket', '==', true)
  .get()
  .then((docsQ) => docsQ.docs.map((d) => d.data()))
  .catch((e) => console.log(e));
docsQuery
  .where('extra.singleSidedSpecs', 'array-contains', '22')
  .where('startInfo.bracket', '==', true)
  .get()
  .then((docsQ) => docsQ.docs.map((d) => d.data()))
  .catch((e) => console.log(e));
