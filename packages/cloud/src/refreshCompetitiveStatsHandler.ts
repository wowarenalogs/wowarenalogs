import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { Storage as GoogleCloudStorage } from '@google-cloud/storage';
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
const STATS_SCHEMA_VERSION = 2;

async function generateSpecStatsAsync() {
  console.log('generating spec stats...');

  let resultObject: {
    [bracket: string]: {
      [spec: string]: {
        [result: string]: {
          matches: number;
          effectiveDps: number;
          effectiveHps: number;
          isKillTarget: number;
          burstDps: number;
        };
      };
    };
  } = {};

  const [response] = await analytics.runReport({
    property: 'properties/259314484',
    dateRanges: [
      {
        startDate: '8daysAgo',
        endDate: 'yesterday',
      },
    ],
    dimensions: [
      {
        name: 'customEvent:bracket',
      },
      {
        name: 'customEvent:spec',
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
        name: 'averageCustomEvent:effectiveDps',
      },
      {
        name: 'averageCustomEvent:effectiveHps',
      },
      {
        name: 'customEvent:isKillTarget',
      },
      {
        name: 'countCustomEvent:isKillTarget',
      },
      {
        name: 'averageCustomEvent:burstDps',
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
                value: 'event_NewPlayerRecord',
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

  response.rows?.forEach((row) => {
    if (!row.dimensionValues || !row.metricValues) {
      return;
    }

    const bracket = row.dimensionValues[0].value as string;
    const spec = row.dimensionValues[1].value as string;
    const result = row.dimensionValues[2].value as string;

    if (!ALLOWED_BRACKETS.has(bracket)) {
      return;
    }

    const killTargetSum = parseFloat(row.metricValues[3].value as string);
    const killTargetCount = parseFloat(row.metricValues[4].value as string);
    const isKillTargetAvg = (killTargetSum ? killTargetSum : 0) / (killTargetCount ? killTargetCount : 1);

    const newEntry = {
      [bracket]: {
        [spec]: {
          [result]: {
            matches: parseInt(row.metricValues[0].value as string) ?? 0,
            effectiveDps: Math.abs(parseFloat(row.metricValues[1].value as string) ?? 0),
            effectiveHps: Math.abs(parseFloat(row.metricValues[2].value as string) ?? 0),
            isKillTarget: isKillTargetAvg,
            burstDps: Math.abs(parseFloat(row.metricValues[5].value as string) ?? 0),
          },
        },
      },
    };
    resultObject = _.merge(resultObject, newEntry);
  });

  const content = JSON.stringify(resultObject, null, 2);
  await bucket.file(`data/spec-stats.v${STATS_SCHEMA_VERSION.toFixed()}.json`).save(content, {
    contentType: 'application/json',
  });
  await bucket.file(`data/spec-stats.${moment().format('YYYY-MM-DD')}.json`).save(content, {
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
        startDate: '8daysAgo',
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
        name: 'averageCustomEvent:effectiveDps',
      },
      {
        name: 'averageCustomEvent:effectiveHps',
      },
      {
        name: 'averageCustomEvent:burstDps',
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

    const newEntry = {
      [bracket]: {
        [specs]: {
          [result]: {
            matches: parseInt(row.metricValues[0].value as string) ?? 0,
            effectiveDps: Math.abs(parseFloat(row.metricValues[1].value as string) ?? 0),
            effectiveHps: Math.abs(parseFloat(row.metricValues[2].value as string) ?? 0),
            burstDps: Math.abs(parseFloat(row.metricValues[3].value as string) ?? 0),
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
        startDate: '8daysAgo',
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

  await generateSpecStatsAsync();
  await generateCompStatsAsync();

  callback();
}

exports.handler = handler;
