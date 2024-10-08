import { Firestore } from '@google-cloud/firestore';
import { GetSignedUrlConfig, Storage } from '@google-cloud/storage';
import fs from 'fs';
import _ from 'lodash';
import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development';

const logFilesBucket = isDev ? 'wowarenalogs-public-dev-log-files-prod' : 'wowarenalogs-log-files-prod';
const storage = new Storage({
  projectId: process.env.NODE_ENV === 'development' ? 'wowarenalogs-public-dev' : 'wowarenalogs',
  credentials:
    process.env.NODE_ENV === 'development'
      ? JSON.parse(fs.readFileSync(path.join(process.cwd(), '../cloud/wowarenalogs-public-dev.json'), 'utf8'))
      : undefined,
});
const bucket = storage.bucket(logFilesBucket);

const matchStubsCollection = 'match-stubs-prod';
const firestore = new Firestore({
  projectId: process.env.NODE_ENV === 'development' ? 'wowarenalogs-public-dev' : 'wowarenalogs',
  credentials: isDev
    ? JSON.parse(fs.readFileSync(path.join(process.cwd(), '../cloud/wowarenalogs-public-dev.json'), 'utf8'))
    : undefined,
});

const matchExistsAsync = async (id: string) => {
  const collectionReference = firestore.collection(matchStubsCollection);
  const matchDocs = await collectionReference.where('id', '==', `${id}`).limit(1).get();
  return !matchDocs.empty;
};

export const combatUploadSignatureHandler = async (request: NextApiRequest, response: NextApiResponse) => {
  const { id } = request.query;
  const file = bucket.file(id as string);

  if (request.method !== 'GET') {
    response.status(400).json({ error: 'Only GET requests are allowed.' });
    return;
  }

  if (!request.headers) {
    response.status(400).json({ error: 'x-goog-meta-ownerid header is required.' });
    return;
  }

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
  _.keys(extensionHeaders).forEach((k) => {
    if (signedUrlConfig.extensionHeaders) {
      signedUrlConfig.extensionHeaders[k] = request.headers[k];
    }
  });

  try {
    const [matchExists, result] = await Promise.all([
      matchExistsAsync(id as string),
      file.getSignedUrl(signedUrlConfig),
    ]);
    const url = result[0];
    response.status(200).json({ url, id, matchExists });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(err);
    response.status(500).json({ error: 'An error has occurred' });
  }
};
