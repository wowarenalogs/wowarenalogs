import { ApolloContext } from '../types';
import { issueLogDownloadUrlAsync, LogDownloadGrant } from '../utils/accessGuard';

/**
 * The only route to a raw combat log. The bucket is private; the client asks
 * here for a short-lived signed URL and the request is charged to the caller's
 * daily quota of distinct logs. See accessGuard.ts.
 */
export function logDownloadUrl(
  _parent: unknown,
  args: { matchId: string },
  context: ApolloContext,
): Promise<LogDownloadGrant> {
  return issueLogDownloadUrlAsync(context, args.matchId);
}
