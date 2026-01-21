// eslint-disable-next-line @typescript-eslint/no-unused-vars
import dotenv from 'dotenv/config';

import * as refreshCompetitiveStatsHandlerModule from './refreshCompetitiveStatsHandler';
import * as refreshSpellIconsHandlerModule from './refreshSpellIconsHandler';
import * as writeMatchStubHandlerModule from './writeMatchStubHandler';

export const refreshCompetitiveStatsHandler = refreshCompetitiveStatsHandlerModule.handler;
export const refreshSpellIconsHandler = refreshSpellIconsHandlerModule.handler;
export const writeMatchStubHandler = writeMatchStubHandlerModule.handler;
