import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';

const gcpCredentials =
  process.env.NODE_ENV === 'development'
    ? JSON.parse(fs.readFileSync(path.join(__dirname, '../../wowarenalogs-public-dev.json'), 'utf8'))
    : undefined;

const storage = new Storage({ credentials: gcpCredentials });

export interface LogObject {
  text: string;
  // Custom metadata without the `x-goog-meta-` prefix, e.g. `ownerid`.
  metadata: Record<string, string>;
}

export async function readLogObjectAsync(bucketName: string, objectName: string): Promise<LogObject> {
  const file = storage.bucket(bucketName).file(objectName);
  const [[buffer], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
  return {
    text: buffer.toString('utf8'),
    metadata: (meta.metadata ?? {}) as Record<string, string>,
  };
}

export function parseLogObjectUrl(logObjectUrl: string): { bucket: string; name: string } {
  const segments = new URL(logObjectUrl).pathname.replace(/^\//, '').split('/');
  const [bucket, ...rest] = segments;
  return { bucket, name: decodeURIComponent(rest.join('/')) };
}

export function readLogObjectByUrlAsync(logObjectUrl: string): Promise<LogObject> {
  const { bucket, name } = parseLogObjectUrl(logObjectUrl);
  return readLogObjectAsync(bucket, name);
}
