/* eslint-disable @typescript-eslint/no-explicit-any */
import { contextBridge } from 'electron';

import { LoggerBridge } from '../src/main-utils/loggerBridge';

LoggerBridge.preloadBindings(contextBridge);
