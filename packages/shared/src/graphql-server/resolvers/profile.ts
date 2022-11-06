import { ApolloContext, User } from '../types';
import { getUserProfileAsync } from '../utils/getUserProfileAsync';
import { setUserReferrerAsync } from '../utils/setUserReferrerAsync';

export function me(parent: unknown, args: Record<string, unknown>, context: ApolloContext): Promise<User | null> {
  return getUserProfileAsync(context);
}

export function setUserReferrer(
  _: unknown,
  args: { referrer: string | null },
  context: ApolloContext,
): Promise<User | null> {
  return setUserReferrerAsync(context, args.referrer);
}
