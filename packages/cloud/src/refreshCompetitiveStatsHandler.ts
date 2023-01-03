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

async function generateSpecStatsAsync() {
  console.log('generating spec stats...');

  let resultObject: Record<string, unknown> = {};

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

    const newEntry = {
      [bracket]: {
        [spec]: {
          [result]: parseInt(row.metricValues[0].value as string) ?? 0,
        },
      },
    };
    resultObject = _.merge(resultObject, newEntry);
  });

  const content = JSON.stringify(resultObject, null, 2);
  await bucket.file('spec-stats.json').save(content, {
    contentType: 'application/json',
  });
  await bucket.file(`spec-stats.${moment().format('YYYY-MM-DD')}.json`).save(content, {
    contentType: 'application/json',
  });

  console.log('Spec stats updated');
}

async function generateCompStatsAsync() {
  console.log('generating comp stats...');

  let resultObject: Record<string, unknown> = {};

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

  response.rows?.forEach((row) => {
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
          [result]: parseInt(row.metricValues[0].value as string) ?? 0,
        },
      },
    };
    resultObject = _.merge(resultObject, newEntry);
  });

  const content = JSON.stringify(resultObject, null, 2);
  await bucket.file('comp-stats.json').save(content, {
    contentType: 'application/json',
  });
  await bucket.file(`comp-stats.${moment().format('YYYY-MM-DD')}.json`).save(content, {
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
