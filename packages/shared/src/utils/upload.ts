import { IArenaMatch, IShuffleMatch } from '@wowarenalogs/parser';
import moment from 'moment-timezone';

export async function uploadCombatAsync(
  combat: IArenaMatch | IShuffleMatch,
  ownerId: string,
  options?: {
    patchRevision?: string;
  },
) {
  const buffer =
    combat.dataType === 'ArenaMatch'
      ? combat.rawLines.join('\n')
      : combat.rounds.map((c) => c.rawLines.join('\n')).join('\n');

  const headers: Record<string, string> = {
    'content-type': 'text/plain;charset=UTF-8',
    'x-goog-meta-wow-version': combat.wowVersion,
    'x-goog-meta-ownerid': ownerId,
    'x-goog-meta-starttime-utc': combat.startTime.toString(),
    'x-goog-meta-client-timezone': moment.tz.guess(),
    'x-goog-meta-client-year': new Date().getFullYear().toString(),
  };

  if (options?.patchRevision) {
    headers['x-goog-meta-wow-patch-rev'] = options.patchRevision;
  }

  const storageSignerResponse = await fetch(`/api/getCombatUploadSignature/${combat.id}`, { headers });
  const jsonResponse = (await storageSignerResponse.json()) as { id: string; url: string; matchExists: boolean };
  const signedUploadUrl = jsonResponse.url;

  await fetch(signedUploadUrl, {
    method: 'PUT',
    body: buffer,
    headers,
  });

  return jsonResponse;
}
