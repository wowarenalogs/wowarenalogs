import { Storage, GetSignedUrlConfig } from '@google-cloud/storage';
import _ from 'lodash';
import type { NextApiRequest, NextApiResponse } from 'next';

import { env } from '../utils/env';

const logFilesBucket =
  env.stage === 'development' ? 'wowarenalogs-pubcdev-log-files-dev' : 'wowarenalogs-log-files-prod';

const storage = new Storage(
  env.stage === 'development'
    ? {
        // This file is in gitignore so we can't import it normally without build errs
        // TODO: fix issue with local dev using local service acct causing builds to fail
        credentials: require('../../gcp_service_account.json'),
        projectId: 'wowarenalogs-public-dev',
      }
    : {},
);

const bucket = storage.bucket(logFilesBucket);

const extensionHeaders = {
  'x-goog-meta-ownerid': '',
  'x-goog-meta-wow-version': '',
  'x-goog-meta-wow-patch-rev': '',
  'x-goog-meta-starttime-utc': '',
  'x-goog-meta-client-timezone': '',
  'x-goog-meta-client-year': '',
};

const signedUrlConfig: GetSignedUrlConfig = {
  action: 'write',
  expires: '03-01-2500',
  contentType: 'text/plain;charset=UTF-8',
  extensionHeaders,
};

export const combatUploadSignatureHandler = (request: NextApiRequest, response: NextApiResponse) => {
  const { id } = request.query;
  const file = bucket.file(id as string);

  if (request.method === 'GET') {
    if (signedUrlConfig.extensionHeaders) {
      _.keys(extensionHeaders).forEach((k) => {
        if (signedUrlConfig.extensionHeaders) {
          signedUrlConfig.extensionHeaders[k] = request.headers[k];
        }
      });
    } else {
      response.status(400).send('x-goog-meta-ownerid header is required.');
      return;
    }
    file.getSignedUrl(signedUrlConfig, function (err, url) {
      if (err) {
        console.log(err);
        response.status(500).send('An error has occurred');
      } else {
        response.send(JSON.stringify({ url, parsedName: id }));
      }
    });
  } else {
    response.status(400).send('Only GET requests are allowed.');
  }
};
