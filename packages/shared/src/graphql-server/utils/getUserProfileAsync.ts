import { Firestore } from '@google-cloud/firestore';
import fs from 'fs';
import path from 'path';

import { ApolloContext, User, UserSubscriptionTier } from '../types';

const userProfileCollection = process.env.NODE_ENV === 'development' ? 'user-profile-dev' : 'user-profile-prod';

const firestore = new Firestore({
  projectId: process.env.NODE_ENV === 'development' ? 'wowarenalogs-public-dev' : 'wowarenalogs',
  credentials:
    process.env.NODE_ENV === 'development'
      ? JSON.parse(fs.readFileSync(path.join(process.cwd(), '../cloud/wowarenalogs-public-dev.json'), 'utf8'))
      : undefined,
});

export async function getUserProfileAsync(context: ApolloContext): Promise<User | null> {
  if (context.user == null) {
    return null;
  }

  const userId = context.user.id;
  const battlenetId = context.user.battlenetId;
  const userProfileDocs = await firestore
    .collection(userProfileCollection)
    .where('battlenetId', '==', battlenetId)
    .limit(1)
    .get();

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
    battlenetId,
    battletag: context.user.battletag ? context.user.battletag.toLowerCase() : null,
    referrer: null,
    subscriptionTier,
    tags: [],
  };
  if (userProfileDocs.size === 0) {
    await firestore.doc(`${userProfileCollection}/${userId}`).set(userObject);
    return userObject;
  } else {
    return {
      ...userObject,
      ...userProfileDocs.docs[0].data(),
      subscriptionTier,
    };
  }
}
