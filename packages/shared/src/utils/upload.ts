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
  console.log('Starting compressed upload...');

  // Create iterator for all lines
  const allLines = combat.dataType === 'ArenaMatch' ? combat.rawLines : combat.rounds.flatMap((c) => c.rawLines);

  console.log(`Streaming ${combat.dataType} with ${allLines.length} lines directly to compression`);

  // Stream lines directly without buffering the full text
  const textEncoder = new TextEncoder();
  let lineIndex = 0;

  const readBufferStream = new ReadableStream({
    pull(controller) {
      if (lineIndex >= allLines.length) {
        controller.close();
        return;
      }

      const line = allLines[lineIndex];
      const lineWithNewline = lineIndex === allLines.length - 1 ? line : line + '\n';
      const encodedLine = textEncoder.encode(lineWithNewline);

      controller.enqueue(encodedLine);
      lineIndex++;
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
