// eslint-disable-next-line @typescript-eslint/no-unused-vars
import dotenv from 'dotenv/config';

import * as deliverWebhookHandlerModule from './deliverWebhookHandler';
import * as refreshCompetitiveStatsHandlerModule from './refreshCompetitiveStatsHandler';
import * as writeMatchStubHandlerModule from './writeMatchStubHandler';

export const deliverWebhookHandler = deliverWebhookHandlerModule.handler;
export const refreshCompetitiveStatsHandler = refreshCompetitiveStatsHandlerModule.handler;
export const writeMatchStubHandler = writeMatchStubHandlerModule.handler;
