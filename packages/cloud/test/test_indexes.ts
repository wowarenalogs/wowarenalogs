import { Firestore } from '@google-cloud/firestore';

const MAX_RESULTS_PER_QUERY = 1;

const matchAnonStubsCollection = 'match-anon-stubs-dev';

const firestore = new Firestore();

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
