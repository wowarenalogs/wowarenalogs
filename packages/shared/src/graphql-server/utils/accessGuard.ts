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

/**
 * Gatekeeping for match discovery and raw log access.
 *
 * Both paths require a signed-in Battle.net user. Anonymous ids are minted
 * client-side, so nothing keyed on them can be a real limit, and bots would
 * simply mint a fresh one per request.
 *
 * Search (the discovery resolvers) is unmetered beyond sign-in, the `blocked`
 * tag, and an embargo on very recent matches. What is metered is the raw log:
 * the bucket is private, and the only way to read a log is a short-lived
 * signed URL issued here, charged against a per-user, per-UTC-day quota of
 * *distinct* logs. Usage is one Firestore doc per user per day, keyed
 * `<userId>_<YYYY-MM-DD>`, holding the list of match ids opened.
 *
 * Every decision emits one structured JSON log line (`event: access_*`) so
 * per-user volume can be graphed and alerted on in Cloud Logging.
 */

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

// Structured stdout line; Cloud Logging parses JSON into queryable entries.
const logAccessEvent = (fields: Record<string, unknown>) => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(fields));
};

const utcDay = () => new Date().toISOString().slice(0, 10);

const SIGN_IN_MESSAGE = 'Sign in with Battle.net to view matches.';

const hasTag = (user: User, tag: string) => (user.tags ?? []).includes(tag);

/** Loads the signed-in user's profile; throws for anonymous or blocked callers. */
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

/** Gate for the discovery resolvers. Returns the caller for logging. */
export async function authorizeSearchAsync(context: ApolloContext, query: SearchQueryName): Promise<User> {
  if (SEARCH_DISABLED) {
    throw new ApolloError(SEARCH_DISABLED_MESSAGE, 'SEARCH_DISABLED');
  }
  return requireUserAsync(context, query);
}

/** One line per discovery query so per-user search volume is visible. */
export function logSearchQuery(caller: User, query: SearchQueryName, args: Record<string, unknown>, returned: number) {
  logAccessEvent({
    event: 'access_search',
    query,
    userId: caller.id,
    args,
    returned,
  });
}

/**
 * Issues a short-lived signed URL for one raw log, charging the caller's daily
 * quota if this match hasn't been opened today. The check-and-charge runs in a
 * Firestore transaction so concurrent requests can't slip past the limit.
 * Profiles tagged `admin` skip the charge entirely.
 */
export async function issueLogDownloadUrlAsync(context: ApolloContext, matchId: string): Promise<LogDownloadGrant> {
  if (!matchId || matchId.includes('/')) {
    throw new UserInputError('Invalid match id.');
  }
  const caller = await requireUserAsync(context, 'logDownload');
  const quota = LOG_DAILY_DOWNLOAD_QUOTA;
  const day = utcDay();
  const usageRef = firestore.doc(`${logUsageCollection}/${caller.id}_${day}`);

  const chargeQuotaAsync = () =>
    firestore.runTransaction(async (tx) => {
      const usageDoc = await tx.get(usageRef);
      const opened = (usageDoc.data()?.matchIds as string[] | undefined) ?? [];
      if (opened.includes(matchId)) {
        return opened.length;
      }
      if (opened.length >= quota) {
        logAccessEvent({
          event: 'access_denied',
          reason: 'log_quota',
          userId: caller.id,
          matchId,
          usedToday: opened.length,
          quota,
        });
        throw new ApolloError(
          `Daily log limit reached (${quota} distinct matches). It resets at midnight UTC.`,
          'LOG_QUOTA_EXCEEDED',
          { usedToday: opened.length, quota },
        );
      }
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
      return opened.length + 1;
    });

  const exempt = hasTag(caller, ACCESS_ADMIN_TAG);
  const usedAfter = exempt ? 0 : await chargeQuotaAsync();

  const expiresAt = Date.now() + LOG_URL_TTL_MS;
  const [url] = await bucket.file(matchId).getSignedUrl({ version: 'v4', action: 'read', expires: expiresAt });

  logAccessEvent({
    event: 'access_log',
    userId: caller.id,
    matchId,
    usedToday: usedAfter,
    quota,
    exempt,
  });

  return { url, expiresAt, downloadsUsedToday: usedAfter, downloadsQuota: quota };
}
