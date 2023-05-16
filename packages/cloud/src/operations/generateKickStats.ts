import { Firestore } from '@google-cloud/firestore';
import fs from 'fs';
import _ from 'lodash';
import path from 'path';
import superagent from 'superagent';

import { AtomicArenaCombat, CombatExtraSpellAction } from '../../../parser/dist/index';
import { ICombatDataStub } from '../../../shared/src/graphql-server/types';
import { parseFromStringArrayAsync } from '../utils';

const firestore = new Firestore({
  ignoreUndefinedProperties: true,
  projectId: 'wowarenalogs',
  // always read production credentials because this tool is designed to work on production data
  credentials: JSON.parse(fs.readFileSync(path.join(process.cwd(), './wowarenalogs.json'), 'utf8')),
});

const MATCH_STUBS_COLLECTION = 'match-stubs-prod';
const NUMBER_OF_MATCHES = 1000;

export default async function generateKickStats() {
  const collectionReference = firestore.collection(MATCH_STUBS_COLLECTION);
  const matchDocs = await collectionReference.orderBy('startTime', 'desc').limit(NUMBER_OF_MATCHES).get();
  console.log(`fetched ${matchDocs.size} latest matches from firestore. downloading logs...`);

  const totalMatches = matchDocs.size;
  let parsedMatches = 0;
  let failedMatches = 0;

  const kickLags: number[] = [];
  const processMatchAsync = async (match: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>) => {
    const stub = match.data() as ICombatDataStub;
    try {
      const response = await superagent.get(stub.logObjectUrl);
      if (response.ok) {
        const results = await parseFromStringArrayAsync(response.text.split('\n'), 'retail');

        (results.arenaMatches as AtomicArenaCombat[])
          .concat(results.shuffleMatches.flatMap((m) => m.rounds))
          .forEach((m) => {
            console.log(`match ${m.id}`);
            const evts = m.events.filter((e) => e.logLine.event === 'SPELL_INTERRUPT');
            evts.forEach((kick) => {
              for (let i = m.events.length - 1; i > 0; i--) {
                const evt = m.events[i];
                if (
                  evt.timestamp < kick.timestamp &&
                  evt.srcUnitId == kick.destUnitId &&
                  evt.logLine.event === 'SPELL_CAST_START' &&
                  (kick as CombatExtraSpellAction).extraSpellId == evt.spellId
                ) {
                  console.log('-kick-');
                  console.log(kick.logLine.raw);
                  console.log(evt.logLine.raw);
                  const kickLag = kick.timestamp - evt.timestamp;
                  if (kickLag < 2000) {
                    kickLags.push(kickLag);
                    console.log(kickLag);
                  }
                  break;
                }
              }
            });
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
    console.log(`${parsedMatches}/${totalMatches} matches parsed. ${failedMatches} failed.`);
  }

  const fd = fs.openSync('kickLags.json', 'w');
  fs.writeSync(fd, JSON.stringify(kickLags));
  console.log(kickLags);
}

generateKickStats();
