import { FieldPath, Firestore } from '@google-cloud/firestore';
import { createCanvas } from 'canvas';
import fs from 'fs';
import _ from 'lodash';
import path from 'path';
import superagent from 'superagent';

import { AtomicArenaCombat } from '../../../parser/dist/index';
import { ICombatDataStub } from '../../../shared/src/graphql-server/types';
import { parseFromStringArrayAsync } from '../utils';

const firestore = new Firestore({
  ignoreUndefinedProperties: true,
  projectId: 'wowarenalogs',
});
const zoneIdField = new FieldPath('startInfo', 'zoneId');

const MATCH_STUBS_COLLECTION = 'match-stubs-prod';
const NUMBER_OF_MATCHES = 500;
const PIXELS_PER_UNIT = 5;

export default async function generateMapImage(zoneId: string) {
  console.log('Generating map image for zone', zoneId);

  const collectionReference = firestore.collection(MATCH_STUBS_COLLECTION);
  const matchDocs = await collectionReference.where(zoneIdField, '==', zoneId).limit(NUMBER_OF_MATCHES).get();
  console.log(`fetched ${matchDocs.size} latest matches from firestore. downloading logs...`);

  const totalMatches = matchDocs.size;
  let parsedMatches = 0;
  let failedMatches = 0;

  const allCoordinates: number[][] = [];
  let minX = Number.MAX_VALUE;
  let minY = Number.MAX_VALUE;
  let maxX = Number.MIN_VALUE;
  let maxY = Number.MIN_VALUE;
  const processMatchAsync = async (match: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>) => {
    const stub = match.data() as ICombatDataStub;
    try {
      const response = await superagent.get(stub.logObjectUrl);
      if (response.ok) {
        const results = await parseFromStringArrayAsync(response.text.split('\n'), 'retail');

        const coordinates = (results.arenaMatches as AtomicArenaCombat[])
          .concat(results.shuffleMatches.flatMap((m) => m.rounds))
          .flatMap((m) => {
            return _.values(m.units).flatMap((unit) => {
              return unit.advancedActions.map((e) => [e.advancedActorPositionX, e.advancedActorPositionY]);
            });
          });

        coordinates.forEach((v) => {
          allCoordinates.push(v);
          minX = Math.min(minX, v[0]);
          minY = Math.min(minY, v[1]);
          maxX = Math.max(maxX, v[0]);
          maxY = Math.max(maxY, v[1]);
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

  minX = Math.floor(minX);
  minY = Math.floor(minY);
  maxX = Math.ceil(maxX);
  maxY = Math.ceil(maxY);

  const canvas = createCanvas((maxX - minX) * PIXELS_PER_UNIT, (maxY - minY) * PIXELS_PER_UNIT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'white';
  ctx.globalAlpha = 0.01;
  allCoordinates.forEach((v) => {
    ctx.fillRect(
      (v[0] - minX) * PIXELS_PER_UNIT - PIXELS_PER_UNIT / 2,
      (v[1] - minY) * PIXELS_PER_UNIT - PIXELS_PER_UNIT / 2,
      PIXELS_PER_UNIT,
      PIXELS_PER_UNIT,
    );
  });

  const outDir = path.join(process.cwd(), 'out');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }
  const outPath = path.join(outDir, `${zoneId}.png`);
  if (fs.existsSync(outPath)) {
    fs.rmSync(outPath);
  }

  const out = fs.createWriteStream(outPath);
  const pngStream = canvas.createPNGStream();
  pngStream.pipe(out);
  out.on('finish', () => {
    console.log({
      imageWidth: canvas.width,
      imageHeight: canvas.height,
      minX,
      minY,
      maxX,
      maxY,
    });
  });
}

generateMapImage(process.argv[2]);
