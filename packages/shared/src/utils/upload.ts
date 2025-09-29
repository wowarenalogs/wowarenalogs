/* eslint-disable no-console */
import { IArenaMatch, IShuffleMatch } from '@wowarenalogs/parser';
import moment from 'moment-timezone';

function iteratorToStream(iterator: Iterator<string>) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      console.log({ value, done, controller, iterator });
      if (value) {
        console.log(value.length);
        controller.enqueue(value);
      }
      if (done) {
        console.log('STREAM CALLED CLOSE');
        controller.close();
      }
    },
  });
}

export async function uploadCombatAsync(
  combat: IArenaMatch | IShuffleMatch,
  ownerId: string,
  options?: {
    patchRevision?: string;
  },
) {
  console.log('xcopy log');
  // const buffer =
  //   combat.dataType === 'ArenaMatch'
  //     ? combat.rawLines.join('\n')
  //     : combat.rounds.map((c) => c.rawLines.join('\n')).join('\n');

  const bufferIterator =
    combat.dataType === 'ArenaMatch'
      ? combat.rawLines.values()
      : combat.rounds
          .map((c) => c.rawLines.join('\n'))
          .flat()
          .values();
  console.log('Starting compression...');
  const readBufferStream = iteratorToStream(bufferIterator);
  const compressedReadableStream = readBufferStream.pipeThrough(new CompressionStream('gzip'));

  console.log('Compression complete');

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

  await fetch(signedUploadUrl, {
    duplex: 'half',
    method: 'PUT',
    body: compressedReadableStream,
    headers,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  return jsonResponse;
}
