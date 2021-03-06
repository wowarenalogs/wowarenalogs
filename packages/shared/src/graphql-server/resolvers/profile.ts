import { ApolloContext, User } from '../types';
import { getUserProfileAsync } from '../utils/getUserProfileAsync';
import { setUserReferrerAsync } from '../utils/setUserReferrerAsync';

export async function me(parent: unknown, args: Record<string, unknown>, context: ApolloContext): Promise<User | null> {
  return await getUserProfileAsync(context);
}

export async function setUserReferrer(
  _: unknown,
  args: { referrer: string | null },
  context: ApolloContext,
): Promise<User | null> {
  return await setUserReferrerAsync(context, args.referrer);
}
