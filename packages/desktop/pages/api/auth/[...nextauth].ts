import { Firestore } from '@google-cloud/firestore';
import { FirestoreNextAuthAdapter } from '@wowarenalogs/shared';
import NextAuth from 'next-auth';

const firestore = new Firestore({
  ignoreUndefinedProperties: true,
});

export default NextAuth({
  providers: [
    {
      id: 'battlenet',
      name: 'Battle.net',
      type: 'oauth',
      wellKnown: 'https://oauth.battle.net/.well-known/openid-configuration',
      async profile(profile, _tokens) {
        return {
          id: profile.sub,
          battlenetId: parseInt(profile.sub),
          battletag: profile.battle_tag,
          name: profile.battle_tag,
        };
      },
      clientId: process.env.BLIZZARD_CLIENT_ID,
      clientSecret: process.env.BLIZZARD_CLIENT_SECRET,
    },
  ],
  adapter: FirestoreNextAuthAdapter(firestore),
  callbacks: {
    session: async (params) => {
      params.session.user = params.user;
      return Promise.resolve(params.session);
    },
  },
});