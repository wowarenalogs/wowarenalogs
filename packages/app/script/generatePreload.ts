// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { nativeBridgeRegistry } from '../src/nativeBridge/registry';
import { close, openSync, writeSync } from 'fs-extra';

const apiFile = nativeBridgeRegistry.generateAPIFile();
const typeFile = nativeBridgeRegistry.generateAPITypeFile('./nativeBridge/modules/');

const apiOut = openSync('src/preloadApi.ts', 'w');
writeSync(apiOut, apiFile);
close(apiOut);

const typesOut = openSync('src/windowApi.d.ts', 'w');
writeSync(typesOut, typeFile);
close(typesOut);
