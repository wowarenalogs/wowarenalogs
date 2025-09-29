/* eslint-disable no-console */
import { IArenaMatch, IShuffleMatch } from '@wowarenalogs/parser';
import moment from 'moment-timezone';

export async function uploadCombatAsync(
  combat: IArenaMatch | IShuffleMatch,
  ownerId: string,
  options?: {
    patchRevision?: string;
  },
) {
  console.log('xcopy log');
  console.log('Starting compression...');

  // Create the full text buffer first (much simpler and more reliable)
  const buffer =
    combat.dataType === 'ArenaMatch'
      ? combat.rawLines.join('\n')
      : combat.rounds.map((c) => c.rawLines.join('\n')).join('\n');

  console.log(`Created buffer for ${combat.dataType}, length: ${buffer.length} characters`);

  // Create a simple stream from the buffer (convert string to Uint8Array for compression)
  const textEncoder = new TextEncoder();
  const encodedBuffer = textEncoder.encode(buffer);

  const readBufferStream = new ReadableStream({
    start(controller) {
      controller.enqueue(encodedBuffer);
      controller.close();
    },
  });

  const compressedReadableStream = readBufferStream.pipeThrough(new CompressionStream('gzip'));
  console.log('Created compressed stream, ready to upload directly');

  const headers: Record<string, string> = {
    'content-type': 'text/plain;charset=UTF-8',
    'content-encoding': 'gzip',
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

  console.log('Starting streaming upload...');
  await fetch(signedUploadUrl, {
    duplex: 'half',
    method: 'PUT',
    body: compressedReadableStream,
    headers,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  console.log('Upload complete!');

  return jsonResponse;
}
