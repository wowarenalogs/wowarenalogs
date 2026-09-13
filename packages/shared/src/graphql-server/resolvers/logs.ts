import { ApolloContext } from '../types';
import { issueLogDownloadUrlAsync, LogDownloadGrant } from '../utils/accessGuard';

export function logDownloadUrl(
  _parent: unknown,
  args: { matchId: string },
  context: ApolloContext,
): Promise<LogDownloadGrant> {
  return issueLogDownloadUrlAsync(context, args.matchId);
}
