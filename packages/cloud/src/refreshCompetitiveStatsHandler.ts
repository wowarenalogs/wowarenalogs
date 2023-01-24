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

const ALLOWED_BRACKETS = ['2v2', '3v3', 'Rated Solo Shuffle'];
const STATS_SCHEMA_VERSION = 4;
const LOOKBACK_DAYS = 7;
const RATING_RANGES = [
  [0, 5000],
  [0, 1399],
  [1400, 1799],
  [1800, 5000],
];

async function generateSpecStatsAsync(bracket: string, minRating: number, maxRating: number) {
  let resultObject: {
    [spec: string]: {
      [result: string]: {
        matches: number;
        effectiveDps: number;
        effectiveHps: number;
        isKillTarget: number;
        burstDps: number;
      };
    };
  } = {};

  const [response] = await analytics.runReport({
    property: 'properties/259314484',
    dateRanges: [
      {
        startDate: `${(LOOKBACK_DAYS + 1).toFixed()}daysAgo`,
        endDate: 'yesterday',
      },
    ],
    dimensions: [
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
              fieldName: 'customEvent:bracket',
              stringFilter: {
                matchType: 'EXACT',
                value: bracket,
                caseSensitive: true,
              },
            },
          },
          {
            filter: {
              fieldName: 'customEvent:averageMMR',
              numericFilter: {
                operation: 'GREATER_THAN_OR_EQUAL',
                value: { int64Value: minRating.toFixed() },
              },
            },
          },
          {
            filter: {
              fieldName: 'customEvent:averageMMR',
              numericFilter: {
                operation: 'LESS_THAN_OR_EQUAL',
                value: { int64Value: maxRating.toFixed() },
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

    const spec = row.dimensionValues[0].value as string;
    const result = row.dimensionValues[1].value as string;

    const killTargetSum = parseFloat(row.metricValues[3].value as string);
    const killTargetCount = parseFloat(row.metricValues[4].value as string);
    const isKillTargetAvg = (killTargetSum ? killTargetSum : 0) / (killTargetCount ? killTargetCount : 1);

    const newEntry = {
      [spec]: {
        [result]: {
          matches: parseInt(row.metricValues[0].value as string) ?? 0,
          effectiveDps: Math.abs(parseFloat(row.metricValues[1].value as string) ?? 0),
          effectiveHps: Math.abs(parseFloat(row.metricValues[2].value as string) ?? 0),
          isKillTarget: isKillTargetAvg,
          burstDps: Math.abs(parseFloat(row.metricValues[5].value as string) ?? 0),
        },
      },
    };
    resultObject = _.merge(resultObject, newEntry);
  });

  const content = JSON.stringify(resultObject, null, 2);
  await bucket
    .file(`data/spec-stats/v${STATS_SCHEMA_VERSION.toFixed()}/${bracket}/${minRating}-${maxRating}/latest.json`)
    .save(content, {
      contentType: 'application/json',
    });
  await bucket
    .file(
      `data/spec-stats/v${STATS_SCHEMA_VERSION.toFixed()}/${bracket}/${minRating}-${maxRating}/${moment().format(
        'YYYY-MM-DD',
      )}.json`,
    )
    .save(content, {
      contentType: 'application/json',
    });

  console.log('Spec stats updated', bracket, minRating, maxRating);
}

async function generateCompStatsAsync(bracket: string, minRating: number, maxRating: number) {
  let resultObject: {
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
  } = {};

  const [baseResponse] = await analytics.runReport({
    property: 'properties/259314484',
    dateRanges: [
      {
        startDate: `${(LOOKBACK_DAYS + 1).toFixed()}daysAgo`,
        endDate: 'yesterday',
      },
    ],
    dimensions: [
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
              fieldName: 'customEvent:bracket',
              stringFilter: {
                matchType: 'EXACT',
                value: bracket,
                caseSensitive: true,
              },
            },
          },
          {
            filter: {
              fieldName: 'customEvent:averageMMR',
              numericFilter: {
                operation: 'GREATER_THAN_OR_EQUAL',
                value: { int64Value: minRating.toFixed() },
              },
            },
          },
          {
            filter: {
              fieldName: 'customEvent:averageMMR',
              numericFilter: {
                operation: 'LESS_THAN_OR_EQUAL',
                value: { int64Value: maxRating.toFixed() },
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

    const specs = row.dimensionValues[0].value as string;
    const result = row.dimensionValues[1].value as string;

    if (!specs.includes('_')) {
      return;
    }

    const newEntry = {
      [specs]: {
        [result]: {
          matches: parseInt(row.metricValues[0].value as string) ?? 0,
          effectiveDps: Math.abs(parseFloat(row.metricValues[1].value as string) ?? 0),
          effectiveHps: Math.abs(parseFloat(row.metricValues[2].value as string) ?? 0),
          burstDps: Math.abs(parseFloat(row.metricValues[3].value as string) ?? 0),
        },
      },
    };
    resultObject = _.merge(resultObject, newEntry);
  });

  const [killTargetResponse] = await analytics.runReport({
    property: 'properties/259314484',
    dateRanges: [
      {
        startDate: `${(LOOKBACK_DAYS + 1).toFixed()}daysAgo`,
        endDate: 'yesterday',
      },
    ],
    dimensions: [
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
              fieldName: 'customEvent:bracket',
              stringFilter: {
                matchType: 'EXACT',
                value: bracket,
                caseSensitive: true,
              },
            },
          },
          {
            filter: {
              fieldName: 'customEvent:averageMMR',
              numericFilter: {
                operation: 'GREATER_THAN_OR_EQUAL',
                value: { int64Value: minRating.toFixed() },
              },
            },
          },
          {
            filter: {
              fieldName: 'customEvent:averageMMR',
              numericFilter: {
                operation: 'LESS_THAN_OR_EQUAL',
                value: { int64Value: maxRating.toFixed() },
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

    const specs = row.dimensionValues[0].value as string;
    const result = row.dimensionValues[1].value as string;
    const killTargetSpec = row.dimensionValues[2].value as string;

    if (!specs.includes('_')) {
      return;
    }
    if (!killTargetSpec || killTargetSpec === '(not set)') {
      return;
    }

    const newEntry = {
      [specs]: {
        [result]: {
          killTargetSpec: {
            [killTargetSpec]: parseInt(row.metricValues[0].value as string) ?? 0,
          },
        },
      },
    };
    resultObject = _.merge(resultObject, newEntry);
  });

  // delete specs that have less than 10 matches to optimize the size of the file
  Object.keys(resultObject).forEach((specs) => {
    if ((resultObject[specs]['win']?.matches ?? 0) + (resultObject[specs]['lose']?.matches ?? 0) < 10) {
      delete resultObject[specs];
    }
  });

  const content = JSON.stringify(resultObject, null, 2);
  await bucket
    .file(`data/comp-stats/v${STATS_SCHEMA_VERSION.toFixed()}/${bracket}/${minRating}-${maxRating}/latest.json`)
    .save(content, {
      contentType: 'application/json',
    });
  await bucket
    .file(
      `data/comp-stats/v${STATS_SCHEMA_VERSION.toFixed()}/${bracket}/${minRating}-${maxRating}/${moment().format(
        'YYYY-MM-DD',
      )}.json`,
    )
    .save(content, {
      contentType: 'application/json',
    });

  console.log('Comp stats updated', bracket, minRating, maxRating);
}

export async function handler(_event: unknown, _context: unknown, callback: () => void) {
  console.log('refreshCompetitiveStats started');

  const allTaskParameters = ALLOWED_BRACKETS.flatMap((bracket) => {
    return RATING_RANGES.flatMap((range) => {
      return {
        bracket,
        minRating: range[0],
        maxRating: range[1],
      };
    });
  });

  for (const params of allTaskParameters) {
    await generateSpecStatsAsync(params.bracket, params.minRating, params.maxRating);
    await generateCompStatsAsync(params.bracket, params.minRating, params.maxRating);
  }

  callback();
}

exports.handler = handler;
