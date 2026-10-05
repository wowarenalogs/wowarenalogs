import { FieldValue, Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import { ApolloError, AuthenticationError, ForbiddenError, UserInputError } from 'apollo-server-micro';
import fs from 'fs';
import path from 'path';

import {
  ACCESS_ADMIN_TAG,
  ACCESS_BLOCKED_TAG,
  LOG_DAILY_DOWNLOAD_QUOTA,
  LOG_URL_TTL_MS,
} from '../../utils/accessLimits';
import { SEARCH_DISABLED, SEARCH_DISABLED_MESSAGE } from '../../utils/searchStatus';
import { ApolloContext, User } from '../types';
import { getUserProfileAsync } from './getUserProfileAsync';
import { decideLogGrant, utcDayKey } from './logQuota';

const isDev = process.env.NODE_ENV === 'development';
const gcpCredentials = isDev
  ? JSON.parse(fs.readFileSync(path.join(process.cwd(), '../cloud/wowarenalogs-public-dev.json'), 'utf8'))
  : undefined;
const projectId = isDev ? 'wowarenalogs-public-dev' : 'wowarenalogs';

const logUsageCollection = isDev ? 'log-usage-dev' : 'log-usage-prod';
const logFilesBucket = isDev ? 'wowarenalogs-public-dev-log-files-prod' : 'wowarenalogs-log-files-prod';

const firestore = new Firestore({ projectId, credentials: gcpCredentials });
const storage = new Storage({ projectId, credentials: gcpCredentials });
const bucket = storage.bucket(logFilesBucket);

export type SearchQueryName =
  | 'latestMatches'
  | 'userMatches'
  | 'characterMatches'
  | 'recentMatchesWithCombatant'
  | 'matchesWithOwnerId';

export interface LogDownloadGrant {
  url: string;
  expiresAt: number;
  downloadsUsedToday: number;
  downloadsQuota: number;
}

const logAccessEvent = (fields: Record<string, unknown>) => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(fields));
};

const SIGN_IN_MESSAGE = 'Sign in with Battle.net to view matches.';

const hasTag = (user: User, tag: string) => (user.tags ?? []).includes(tag);

async function requireUserAsync(context: ApolloContext, feature: string): Promise<User> {
  if (!context.user) {
    logAccessEvent({ event: 'access_denied', reason: 'unauthenticated', feature });
    throw new AuthenticationError(SIGN_IN_MESSAGE);
  }
  const profile = await getUserProfileAsync(context);
  if (!profile) {
    throw new AuthenticationError(SIGN_IN_MESSAGE);
  }
  if (hasTag(profile, ACCESS_BLOCKED_TAG)) {
    logAccessEvent({ event: 'access_denied', reason: 'blocked', feature, userId: profile.id });
    throw new ForbiddenError('This account is not permitted to use this feature.');
  }
  return profile;
}

export async function authorizeSearchAsync(context: ApolloContext, query: SearchQueryName): Promise<User> {
  if (SEARCH_DISABLED) {
    throw new ApolloError(SEARCH_DISABLED_MESSAGE, 'SEARCH_DISABLED');
  }
  return requireUserAsync(context, query);
}

export function logSearchQuery(caller: User, query: SearchQueryName, args: Record<string, unknown>, returned: number) {
  logAccessEvent({
    event: 'access_search',
    query,
    userId: caller.id,
    args,
    returned,
  });
}

// The uploader's battlenetId is stored on the log object as `ownerid` metadata at upload time.
async function isOwnUploadAsync(caller: User, matchId: string): Promise<boolean> {
  if (!caller.battlenetId) {
    return false;
  }
  try {
    const [metadata] = await bucket.file(matchId).getMetadata();
    return metadata.metadata?.ownerid === caller.battlenetId;
  } catch {
    return false;
  }
}

export async function issueLogDownloadUrlAsync(context: ApolloContext, matchId: string): Promise<LogDownloadGrant> {
  if (!matchId || matchId.includes('/')) {
    throw new UserInputError('Invalid match id.');
  }
  const caller = await requireUserAsync(context, 'logDownload');
  const quota = LOG_DAILY_DOWNLOAD_QUOTA;
  const day = utcDayKey();
  const usageRef = firestore.doc(`${logUsageCollection}/${caller.id}_${day}`);

  const chargeQuotaAsync = () =>
    firestore.runTransaction(async (tx) => {
      const usageDoc = await tx.get(usageRef);
      const opened = (usageDoc.data()?.matchIds as string[] | undefined) ?? [];
      const decision = decideLogGrant(opened, matchId, quota);
      if (!decision.allowed) {
        logAccessEvent({
          event: 'access_denied',
          reason: 'log_quota',
          userId: caller.id,
          matchId,
          usedToday: decision.usedToday,
          quota,
        });
        throw new ApolloError(
          `You've reached today's limit of ${quota} matches. This limit exists because bots have been scraping ` +
            'combat logs in bulk and driving up our hosting costs. It resets at midnight UTC.',
          'LOG_QUOTA_EXCEEDED',
          { usedToday: decision.usedToday, quota },
        );
      }
      if (decision.charge) {
        tx.set(
          usageRef,
          {
            userId: caller.id,
            day,
            matchIds: FieldValue.arrayUnion(matchId),
            updatedAt: Date.now(),
          },
          { merge: true },
        );
      }
      return decision.usedAfter;
    });

  const usedTodayAsync = async () => {
    const usageDoc = await usageRef.get();
    return new Set((usageDoc.data()?.matchIds as string[] | undefined) ?? []).size;
  };

  const exempt = hasTag(caller, ACCESS_ADMIN_TAG);
  const ownUpload = !exempt && (await isOwnUploadAsync(caller, matchId));
  let usedAfter = 0;
  if (ownUpload) {
    usedAfter = await usedTodayAsync();
  } else if (!exempt) {
    usedAfter = await chargeQuotaAsync();
  }

  const expiresAt = Date.now() + LOG_URL_TTL_MS;
  const [url] = await bucket.file(matchId).getSignedUrl({ version: 'v4', action: 'read', expires: expiresAt });

  logAccessEvent({
    event: 'access_log',
    userId: caller.id,
    matchId,
    usedToday: usedAfter,
    quota,
    exempt,
    ownUpload,
  });

  return { url, expiresAt, downloadsUsedToday: usedAfter, downloadsQuota: quota };
}
