import { Firestore } from '@google-cloud/firestore';
import { FirebaseAdapter } from '@next-auth/firebase-adapter';
import NextAuth from 'next-auth';

// Almost on V4
// See https://github.com/nextauthjs/next-auth/pull/3873
const firestore = new Firestore({
  ignoreUndefinedProperties: true,
});

// type BattleNetIssuer =
//   | 'https://www.battlenet.com.cn/oauth'
//   | 'https://us.battle.net/oauth'
//   | 'https://eu.battle.net/oauth'
//   | 'https://kr.battle.net/oauth'
//   | 'https://tw.battle.net/oauth';

export default NextAuth({
  providers: [
    {
      id: 'battlenet-us',
      name: 'Battle.net US',
      type: 'oauth',
      version: '2.0',
      params: { grant_type: 'authorization_code' },
      accessTokenUrl: 'https://us.battle.net/oauth/token',
      requestTokenUrl: 'https://us.battle.net/oauth/authorize',
      authorizationUrl: 'https://us.battle.net/oauth/authorize?response_type=code',
      profileUrl: 'https://us.battle.net/oauth/userinfo',
      async profile(profile, _tokens) {
        return {
          id: profile.id,
          battletag: profile.battletag,
          name: profile.battletag,
        };
      },
      clientId: process.env.BLIZZARD_CLIENT_ID,
      clientSecret: process.env.BLIZZARD_CLIENT_SECRET,
    },
    {
      id: 'battlenet-eu',
      name: 'Battle.net EU',
      type: 'oauth',
      version: '2.0',
      params: { grant_type: 'authorization_code' },
      accessTokenUrl: 'https://eu.battle.net/oauth/token',
      requestTokenUrl: 'https://eu.battle.net/oauth/authorize',
      authorizationUrl: 'https://eu.battle.net/oauth/authorize?response_type=code',
      profileUrl: 'https://eu.battle.net/oauth/userinfo',
      async profile(profile, _tokens) {
        return {
          id: profile.id,
          battletag: profile.battletag,
          name: profile.battletag,
        };
      },
      clientId: process.env.BLIZZARD_CLIENT_ID,
      clientSecret: process.env.BLIZZARD_CLIENT_SECRET,
    },
    {
      id: 'battlenet-apac',
      name: 'Battle.net APAC',
      type: 'oauth',
      version: '2.0',
      params: { grant_type: 'authorization_code' },
      accessTokenUrl: 'https://apac.battle.net/oauth/token',
      requestTokenUrl: 'https://apac.battle.net/oauth/authorize',
      authorizationUrl: 'https://apac.battle.net/oauth/authorize?response_type=code',
      profileUrl: 'https://apac.battle.net/oauth/userinfo',
      async profile(profile, _tokens) {
        return {
          id: profile.id,
          battletag: profile.battletag,
          name: profile.battletag,
        };
      },
      clientId: process.env.BLIZZARD_CLIENT_ID,
      clientSecret: process.env.BLIZZARD_CLIENT_SECRET,
    },
    {
      id: 'battlenet-cn',
      name: 'Battle.net CN',
      type: 'oauth',
      version: '2.0',
      params: { grant_type: 'authorization_code' },
      accessTokenUrl: 'https://www.battlenet.com.cn/oauth/token',
      requestTokenUrl: 'https://www.battlenet.com.cn/oauth/authorize',
      authorizationUrl: 'https://www.battlenet.com.cn/oauth/authorize?response_type=code',
      profileUrl: 'https://www.battlenet.com.cn/oauth/userinfo',
      async profile(profile, _tokens) {
        return {
          id: profile.id,
          battletag: profile.battletag,
          name: profile.battletag,
        };
      },
      clientId: process.env.BLIZZARD_CLIENT_ID,
      clientSecret: process.env.BLIZZARD_CLIENT_SECRET,
    },
  ],
  adapter: FirebaseAdapter(firestore),
  session: {
    jwt: true,
    // Seconds - How long until an idle session expires and is no longer valid.
    maxAge: 90 * 24 * 60 * 60, // 90 days
  },
  jwt: {
    secret: process.env.JWT_SECRET,
  },
  callbacks: {
    jwt: async (token, user, account, profile, _isNewUser) => {
      if (account && profile) {
        profile.region = account.provider?.replace('battlenet-', '');
      }
      return Promise.resolve(profile ? profile : token);
    },
    session: async (session, user, _sessionToken) => {
      session.user = user;
      return Promise.resolve(session);
    },
  },
});
