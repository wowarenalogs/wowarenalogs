import { close, openSync, writeSync } from 'fs-extra';

import { nativeBridgeRegistry } from '../src/nativeBridge/registry';

const apiFile = nativeBridgeRegistry.generateAPIFile();
const typeFile = nativeBridgeRegistry.generateAPITypeFile();

const apiOut = openSync('src/preloadApi.ts', 'w');
writeSync(apiOut, apiFile);
close(apiOut);

const typesOut = openSync('src/windowApi.d.ts', 'w');
writeSync(typesOut, typeFile);
close(typesOut);
