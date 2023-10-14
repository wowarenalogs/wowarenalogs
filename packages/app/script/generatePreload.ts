import { nativeBridgeRegistry } from '../src/nativeBridge/registry';
import { close, openSync, writeSync } from 'fs-extra';

const apiFile = nativeBridgeRegistry.generateAPIFile();
const typeFile = nativeBridgeRegistry.generateAPITypeFile();

const apiOut = openSync('src/preloadApi.ts', 'w');
writeSync(apiOut, apiFile);
close(apiOut);

const typesOut = openSync('src/windowApi.d.ts', 'w');
writeSync(typesOut, typeFile);
close(typesOut);
