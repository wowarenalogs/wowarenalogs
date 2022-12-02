import fetch from 'node-fetch';

import { createStubDTOFromArenaMatch, createStubDTOFromShuffleMatch } from '../src/createMatchStub';
import { parseFromStringArrayAsync } from '../src/utils';

const rootUri = 'https://storage.googleapis.com/wowarenalogs-public-dev-log-files-dev/WoWCombatLog-110422_233521.txt';
fetch(rootUri).then((response) => {
  console.log('x-goog-meta-ownerid', response.headers.get('x-goog-meta-ownerid'));
  response.text().then(async (textBuffer) => {
    const parseResults = await parseFromStringArrayAsync(textBuffer.split('\n'), 'retail');
    console.log(parseResults);

    if (parseResults.arenaMatches.length > 0) {
      const arenaMatch = parseResults.arenaMatches[0];
      const stub = createStubDTOFromArenaMatch(arenaMatch, 'test-owner', 'someStorageUrl');
      console.log('Arena:', JSON.stringify(stub, null, 2));
    }

    if (parseResults.shuffleMatches.length > 0) {
      const shuffleMatch = parseResults.shuffleMatches[0];
      const stub = createStubDTOFromShuffleMatch(shuffleMatch, 'test-owner', 'someStorageUrl');
      console.log('Shuffle:', JSON.stringify(stub, null, 2));
    }
    // const anonStubInfo = anonymizeDTO(stub2);
  });
});
