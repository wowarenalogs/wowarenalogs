import { UserSubscriptionTier } from '../graphql-server/types';
import { IUser } from '../graphql/__generated__/graphql';

type UserFeature = 'combat-log-raw-view' | 'combat-log-something-else' | 'check-pvp-link';

type UserFeatureResolver = (user: IUser) => boolean;

const rareFeatureTest: UserFeatureResolver = (user) => user.subscriptionTier === UserSubscriptionTier.Rare;
const hasTagTest = (tag: string) => (user: IUser) => user.tags?.includes('tester') || false;

const registeredFeatures: Record<UserFeature, UserFeatureResolver> = {
  'combat-log-raw-view': hasTagTest('tester'),
  'check-pvp-link': hasTagTest('tester'),
  'combat-log-something-else': rareFeatureTest,
};

export function canUseFeature(user: IUser | null | undefined, feature: UserFeature): boolean {
  if (!user) return false;
  return registeredFeatures[feature](user);
}
