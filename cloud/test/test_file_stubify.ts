import { classToPlain } from 'class-transformer';
import md5 from 'md5';
import fetch from 'node-fetch';

import { anonymizeDTO } from '../src/anonymizer';
import { createStubDTOFromCombat } from '../src/createMatchStub';
import { parseFromStringArrayAsync } from '../src/writeMatchStubHandler';

const root_uri = 'https://storage.googleapis.com/wowarenalogs-log-files-dev/0f623a33b5ef610cd163b6c448d0907f';
fetch(root_uri).then((response) => {
  console.log(response.headers.get('x-goog-meta-ownerid'));
  response.text().then(async (textBuffer) => {
    const com = await parseFromStringArrayAsync(textBuffer.split('\n'));
    const hash = md5(com[0].rawLines.join('\n').slice(1024));
    console.log('hash join', md5(com[0].rawLines.join('\n').slice(1024)));
    const stub2 = createStubDTOFromCombat(com[0], 'test-owner', 'someStorageUrl');
    console.log(classToPlain(stub2));
    console.log(stub2.endInfo);
    for (const c of stub2.units) {
      console.log(c.name);
    }
    console.log('---');
    const anonStubInfo = anonymizeDTO(stub2);
    console.log(anonStubInfo.anonymousStub.id);
  });
});
