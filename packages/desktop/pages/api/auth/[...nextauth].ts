import { Firestore } from '@google-cloud/firestore';
import { FirestoreNextAuthAdapter } from '@wowarenalogs/shared';
import NextAuth from 'next-auth';

const firestore = new Firestore({
  ignoreUndefinedProperties: true,
});

export default NextAuth({
  providers: [
    {
      id: 'battlenet-us',
      name: 'Battle.net',
      type: 'oauth',
      wellKnown: 'https://oauth.battle.net/.well-known/openid-configuration',
      async profile(profile, _tokens) {
        return {
          id: profile.sub,
          battletag: profile.battle_tag,
          name: profile.battle_tag,
        };
      },
      clientId: process.env.BLIZZARD_CLIENT_ID,
      clientSecret: process.env.BLIZZARD_CLIENT_SECRET,
    },
  ],
  adapter: FirestoreNextAuthAdapter(firestore),
  jwt: {
    secret: process.env.JWT_SECRET,
    maxAge: 90 * 24 * 60 * 60, // 90 days
  },
  callbacks: {
    jwt: async (params) => {
      if (params.account && params.profile) {
        params.profile.region = params.account.provider?.replace('battlenet-', '');
      }
      return Promise.resolve(params.profile ? params.profile : params.token);
    },
    session: async (params) => {
      params.session.user = params.user;
      return Promise.resolve(params.session);
    },
  },
});
