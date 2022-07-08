import { ICombatData } from '@wowarenalogs/parser';
import moment from 'moment-timezone';

export async function uploadCombatAsync(
  combat: ICombatData,
  ownerId: string,
  options?: {
    patchRevision?: string;
  },
) {
  const buffer = combat.rawLines.join('\n');

  const headers: Record<string, string> = {
    'content-type': 'text/plain;charset=UTF-8',
    'x-goog-meta-wow-version': combat.wowVersion || 'shadowlands',
    'x-goog-meta-ownerid': ownerId,
    'x-goog-meta-starttime-utc': combat.startTime.toString(),

    'x-goog-meta-client-timezone': moment.tz.guess(),
    'x-goog-meta-client-year': new Date().getFullYear().toString(),
  };

  if (options?.patchRevision) {
    headers['x-goog-meta-wow-patch-rev'] = options.patchRevision;
  }

  const storageSignerResponse = await fetch(`/api/getCombatUploadSignature/${combat.id}`, { headers });
  const jsonResponse = await storageSignerResponse.json();
  const signedUploadUrl = jsonResponse.url;

  return fetch(signedUploadUrl, {
    method: 'PUT',
    body: buffer,
    headers,
  });
}
