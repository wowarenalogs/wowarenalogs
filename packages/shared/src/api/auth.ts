import { Firestore } from '@google-cloud/firestore';
import fs from 'fs';
import NextAuth from 'next-auth';
import path from 'path';

import { FirestoreNextAuthAdapter } from '../utils/FirestoreNextAuthAdapter';

const firestore = new Firestore({
  projectId: process.env.NODE_ENV === 'development' ? 'wowarenalogs-public-dev' : 'wowarenalogs',
  ignoreUndefinedProperties: true,
  credentials:
    process.env.NODE_ENV === 'development'
      ? JSON.parse(fs.readFileSync(path.join(process.cwd(), '../cloud/wowarenalogs-public-dev.json'), 'utf8'))
      : undefined,
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
      checks: ['pkce', 'nonce'],
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
