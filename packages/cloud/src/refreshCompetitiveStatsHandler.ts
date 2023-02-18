import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { Storage as GoogleCloudStorage } from '@google-cloud/storage';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import _ from 'lodash';
import moment from 'moment';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development';
const gcpCredentials = isDev
  ? JSON.parse(fs.readFileSync(path.join(process.cwd(), './wowarenalogs-public-dev.json'), 'utf8'))
  : undefined;

const analytics = new BetaAnalyticsDataClient({
  credentials: gcpCredentials,
});

const storage = new GoogleCloudStorage({
  credentials: gcpCredentials,
});
const bucket = storage.bucket(isDev ? 'data.public-dev.wowarenalogs.com' : 'data.wowarenalogs.com');

const ALLOWED_BRACKETS = new Set<string>(['2v2', '3v3', 'Rated Solo Shuffle']);
const RATING_RANGES = [
  [0, 4999],
  [0, 1399],
  [1400, 1799],
  [1800, 2099],
  [2100, 4999],
];

const STATS_SCHEMA_VERSION = 3;
const LOOKBACK_DAYS = 14;

const prisma = new PrismaClient();

async function generateSpecStatsAsync(bracket: string, ratingRange: [number, number]) {
  console.log('generating spec stats...', bracket, ratingRange);

  const startDate = moment().subtract(LOOKBACK_DAYS, 'days').format('YYYY-MM-DD');
  const endDate = moment().subtract(1, 'days').format('YYYY-MM-DD');

  const resultRows = await prisma.$queryRaw<
    {
      date: string;
      spec: string;
      result: 'win' | 'lose';
      effectiveDps: number;
      effectiveHps: number;
      isKillTarget: number;
      burstDps: number;
      matches: number;
    }[]
  >`
    SELECT 
      c.date,
      p.spec,
      IF(t."teamId" = c."winningTeamId", 'win', 'lose') AS result,
      AVG(p."effectiveDps") AS "effectiveDps",
      AVG(p."effectiveHps") AS "effectiveHps",
      CAST(AVG(IF(p."isKillTarget", 1.0, 0.0)) AS FLOAT) AS "isKillTarget",
      AVG(p."burstDps") AS "burstDps",
      CAST(COUNT(1) AS INT4) AS "matches"
    FROM public."PlayerStatRecord" p
    INNER JOIN public."TeamStatRecord" t ON t."rowId" = p."teamId"
    INNER JOIN public."CombatStatRecord" c ON c."combatId" = t."combatId"
    WHERE
      c.bracket = ${bracket} AND
      c."averageMMR" >= ${ratingRange[0]} AND
      c."averageMMR" <= ${ratingRange[1]} AND
      t."teamId" <> c."logOwnerTeamId" AND
      c.date >= ${startDate} AND
      c.date <= ${endDate}
    GROUP BY 
      1, 2, 3
  `;

  prisma.$disconnect();

  const content = JSON.stringify(resultRows, null, 2);
  await bucket
    .file(
      `data/spec-stats/${bracket}/${ratingRange[0]}-${ratingRange[1]}/v${STATS_SCHEMA_VERSION.toFixed()}.latest.json`,
    )
    .save(content, {
      contentType: 'application/json',
    });
  await bucket
    .file(`data/spec-stats/${bracket}/${ratingRange[0]}-${ratingRange[1]}/${moment().format('YYYY-MM-DD')}.json`)
    .save(content, {
      contentType: 'application/json',
    });

  console.log('Spec stats updated');
}

async function generateCompStatsAsync() {
  console.log('generating comp stats...');

  let resultObject: {
    [bracket: string]: {
      [specs: string]: {
        [result: string]: {
          matches: number;
          burstDps: number;
          effectiveDps: number;
          effectiveHps: number;
          killTargetSpec: {
            [spec: string]: number;
          };
        };
      };
    };
  } = {};

  const [baseResponse] = await analytics.runReport({
    property: 'properties/259314484',
    dateRanges: [
      {
        startDate: `${LOOKBACK_DAYS.toFixed()}daysAgo`,
        endDate: 'yesterday',
      },
    ],
    dimensions: [
      {
        name: 'customEvent:bracket',
      },
      {
        name: 'customEvent:specs',
      },
      {
        name: 'customEvent:result',
      },
    ],
    metrics: [
      {
        name: 'eventCount',
      },
      {
        name: 'customEvent:effectiveDps',
      },
      {
        name: 'customEvent:effectiveHps',
      },
      {
        name: 'customEvent:burstDps',
      },
    ],
    dimensionFilter: {
      andGroup: {
        expressions: [
          {
            filter: {
              fieldName: 'eventName',
              stringFilter: {
                matchType: 'EXACT',
                value: 'event_NewCompRecord',
                caseSensitive: true,
              },
            },
          },
          {
            filter: {
              fieldName: 'customEvent:isPlayerTeam',
              stringFilter: {
                matchType: 'EXACT',
                value: 'false',
                caseSensitive: true,
              },
            },
          },
          {
            filter: {
              fieldName: 'customEvent:result',
              inListFilter: {
                values: ['win', 'lose'],
                caseSensitive: true,
              },
            },
          },
        ],
      },
    },
  });

  baseResponse.rows?.forEach((row) => {
    if (!row.dimensionValues || !row.metricValues) {
      return;
    }

    const bracket = row.dimensionValues[0].value as string;
    const specs = row.dimensionValues[1].value as string;
    const result = row.dimensionValues[2].value as string;

    if (!ALLOWED_BRACKETS.has(bracket)) {
      return;
    }
    if (!specs.includes('_')) {
      return;
    }

    const effectiveDps =
      Math.abs(parseFloat(row.metricValues[1].value as string) ?? 0) /
      (parseInt(row.metricValues[0].value as string) ?? 1);
    const effectiveHps =
      Math.abs(parseFloat(row.metricValues[2].value as string) ?? 0) /
      (parseInt(row.metricValues[0].value as string) ?? 1);
    const burstDps =
      Math.abs(parseFloat(row.metricValues[3].value as string) ?? 0) /
      (parseInt(row.metricValues[0].value as string) ?? 1);

    const newEntry = {
      [bracket]: {
        [specs]: {
          [result]: {
            matches: parseInt(row.metricValues[0].value as string) ?? 0,
            effectiveDps,
            effectiveHps,
            burstDps,
          },
        },
      },
    };
    resultObject = _.merge(resultObject, newEntry);
  });

  const [killTargetResponse] = await analytics.runReport({
    property: 'properties/259314484',
    dateRanges: [
      {
        startDate: `${LOOKBACK_DAYS.toFixed()}daysAgo`,
        endDate: 'yesterday',
      },
    ],
    dimensions: [
      {
        name: 'customEvent:bracket',
      },
      {
        name: 'customEvent:specs',
      },
      {
        name: 'customEvent:result',
      },
      {
        name: 'customEvent:killTargetSpec',
      },
    ],
    metrics: [
      {
        name: 'eventCount',
      },
    ],
    dimensionFilter: {
      andGroup: {
        expressions: [
          {
            filter: {
              fieldName: 'eventName',
              stringFilter: {
                matchType: 'EXACT',
                value: 'event_NewCompRecord',
                caseSensitive: true,
              },
            },
          },
          {
            filter: {
              fieldName: 'customEvent:isPlayerTeam',
              stringFilter: {
                matchType: 'EXACT',
                value: 'false',
                caseSensitive: true,
              },
            },
          },
          {
            filter: {
              fieldName: 'customEvent:result',
              stringFilter: {
                matchType: 'EXACT',
                value: 'lose', // only need to count the kill target spec for losses
                caseSensitive: true,
              },
            },
          },
        ],
      },
    },
  });

  killTargetResponse.rows?.forEach((row) => {
    if (!row.dimensionValues || !row.metricValues) {
      return;
    }

    const bracket = row.dimensionValues[0].value as string;
    const specs = row.dimensionValues[1].value as string;
    const result = row.dimensionValues[2].value as string;
    const killTargetSpec = row.dimensionValues[3].value as string;

    if (!ALLOWED_BRACKETS.has(bracket)) {
      return;
    }
    if (!specs.includes('_')) {
      return;
    }
    if (!killTargetSpec || killTargetSpec === '(not set)') {
      return;
    }

    const newEntry = {
      [bracket]: {
        [specs]: {
          [result]: {
            killTargetSpec: {
              [killTargetSpec]: parseInt(row.metricValues[0].value as string) ?? 0,
            },
          },
        },
      },
    };
    resultObject = _.merge(resultObject, newEntry);
  });

  // delete specs that have less than 10 matches to optimize the size of the file
  Object.values(resultObject).forEach((bracket) => {
    Object.keys(bracket).forEach((specs) => {
      if ((bracket[specs]['win']?.matches ?? 0) + (bracket[specs]['lose']?.matches ?? 0) < 10) {
        delete bracket[specs];
      }
    });
  });

  const content = JSON.stringify(resultObject, null, 2);
  await bucket.file(`data/comp-stats.v${STATS_SCHEMA_VERSION}.json`).save(content, {
    contentType: 'application/json',
  });
  await bucket.file(`data/comp-stats.${moment().format('YYYY-MM-DD')}.json`).save(content, {
    contentType: 'application/json',
  });

  console.log('Comp stats updated');
}

export async function handler(_event: unknown, _context: unknown, callback: () => void) {
  console.log('refreshCompetitiveStats started');

  const params: [string, number, number][] = [];
  ALLOWED_BRACKETS.forEach((bracket) => {
    RATING_RANGES.forEach((ratingRange) => {
      params.push([bracket, ratingRange[0], ratingRange[1]]);
    });
  });

  for (const param of params) {
    await generateSpecStatsAsync(param[0], [param[1], param[2]]);
  }

  await generateCompStatsAsync();

  callback();
}

exports.handler = handler;
