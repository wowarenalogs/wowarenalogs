import { Firestore } from '@google-cloud/firestore';
import fs from 'fs';
import path from 'path';

import { ApolloContext, User } from '../types';
import { getUserProfileAsync } from './getUserProfileAsync';

const userProfileCollection = process.env.NODE_ENV === 'development' ? 'user-profile-dev' : 'user-profile-prod';

const firestore = new Firestore({
  credentials:
    process.env.NODE_ENV === 'development'
      ? JSON.parse(fs.readFileSync(path.join(process.cwd(), '../cloud/wowarenalogs-public-dev.json'), 'utf8'))
      : undefined,
});

export async function setUserReferrerAsync(context: ApolloContext, referrer: string | null): Promise<User | null> {
  if (context.user == null) {
    return null;
  }

  const userProfile = await getUserProfileAsync(context);
  if (userProfile === null) {
    return null;
  }

  const previousReferrer = userProfile.referrer;
  const newReferrer = referrer ? referrer.toLowerCase() : null;
  if (previousReferrer === newReferrer) {
    return userProfile;
  }

  if (newReferrer === userProfile.battletag) {
    throw new Error('referrer cannot be the user itself');
  }

  await firestore.doc(`${userProfileCollection}/${userProfile.id}`).set(
    {
      referrer: newReferrer,
    },
    { merge: true },
  );

  return {
    ...userProfile,
    referrer: newReferrer,
  };
}
