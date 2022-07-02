import { Firestore } from '@google-cloud/firestore';

import { ApolloContext, User, UserSubscriptionTier } from '../types';

const userProfileCollection = process.env.NODE_ENV === 'development' ? 'user-profile-dev' : 'user-profile-prod';

const firestore = new Firestore();

export async function getUserProfileAsync(context: ApolloContext): Promise<User | null> {
  if (context.user == null) {
    return null;
  }

  const userId = context.user.id;
  const userProfileDocPath = `${userProfileCollection}/${userId}`;
  const userProfile = await firestore.doc(userProfileDocPath).get();

  let subscriptionTier = UserSubscriptionTier.Common;
  if (context.user.battletag) {
    const collectionReference = firestore.collection(userProfileCollection);
    const referralDocs = await collectionReference
      .where('referrer', '==', `${context.user.battletag.toLowerCase()}`)
      .limit(1)
      .get();
    subscriptionTier = referralDocs.size > 0 ? UserSubscriptionTier.Rare : UserSubscriptionTier.Common;
  }

  const userObject = {
    id: userId,
    battletag: context.user.battletag ? context.user.battletag.toLowerCase() : null,
    referrer: null,
    subscriptionTier,
    tags: [],
  };
  if (!userProfile.exists) {
    await firestore.doc(`${userProfileCollection}/${userId}`).set(userObject);
    return userObject;
  } else {
    return {
      ...userObject,
      ...userProfile.data(),
      subscriptionTier,
    };
  }
}
