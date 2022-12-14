/* eslint-disable @typescript-eslint/no-explicit-any */
import * as firestore from '@google-cloud/firestore';
import { Adapter, AdapterAccount, AdapterSession, AdapterUser, VerificationToken } from 'next-auth/adapters';

function docSnapshotToObject<T>(snapshot?: firestore.DocumentSnapshot<firestore.DocumentData>): T | null {
  if (!snapshot?.exists) {
    return null;
  }
  const data: any = snapshot.data();
  if (data.expires) {
    data.expires = data.expires.toDate();
  }
  return { id: snapshot.id, ...data };
}

function querySnapshotToObject<T>(snapshot: firestore.QuerySnapshot<firestore.DocumentData>): T | null {
  if (snapshot.empty) {
    return null;
  }
  const doc = snapshot.docs[0];

  const data: any = doc.data();
  if (data.expires) {
    data.expires = data.expires.toDate();
  }
  return { id: doc.id, ...data };
}

/** Firebase does not like `undefined` values */
function stripUndefined(obj: any) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => typeof value !== 'undefined'));
}

export function FirestoreNextAuthAdapter(client: firestore.Firestore): Adapter {
  const Users = client.collection('users');
  const Sessions = client.collection('sessions');
  const Accounts = client.collection('accounts');
  const VerificationTokens = client.collection('verificationTokens');

  return {
    async createUser(newUser) {
      const userRef = await Users.add(stripUndefined(newUser));
      const snapshot = await userRef.get();
      const user = docSnapshotToObject<AdapterUser>(snapshot);
      if (!user) {
        throw new Error('[createUser] failed to create user');
      }
      return user;
    },

    async getUser(id) {
      const snapshot = await Users.doc(id).get();
      return docSnapshotToObject<AdapterUser>(snapshot);
    },

    async getUserByEmail(email) {
      if (!email) return null;

      const snapshot = await Users.where('email', '==', email).limit(1).get();
      return querySnapshotToObject<AdapterUser>(snapshot);
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const accountQuery = Accounts.where('provider', '==', provider)
        .where('providerAccountId', '==', providerAccountId)
        .limit(1);
      const accountSnapshots = await accountQuery.get();
      const accountSnapshot = accountSnapshots.docs[0];

      if (accountSnapshot?.exists) {
        const { userId } = accountSnapshot.data();
        const userDoc = await Users.doc(userId).get();
        return docSnapshotToObject<AdapterUser>(userDoc);
      }

      return null;
    },

    async updateUser(partialUser) {
      const userRef = Users.doc(partialUser.id as string);
      await userRef.set(stripUndefined(partialUser), { merge: true });
      const snapshot = await userRef.get();
      const user = docSnapshotToObject<AdapterUser>(snapshot);
      if (!user) {
        throw new Error('[updateUser] failed to update user');
      }
      return user;
    },

    async deleteUser(userId) {
      const userRef = Users.doc(userId);
      const accountsQuery = Accounts.where('userId', '==', userId);
      const sessionsQuery = Sessions.where('userId', '==', userId);

      await client.runTransaction(async (transaction) => {
        const accounts = await accountsQuery.get();
        const sessions = await sessionsQuery.get();

        transaction.delete(userRef);
        accounts.forEach((account) => transaction.delete(account.ref));
        sessions.forEach((session) => transaction.delete(session.ref));
      });
    },

    async linkAccount(account) {
      const accountRef = await Accounts.add(stripUndefined(account));
      const accountSnapshot = await accountRef.get();
      return docSnapshotToObject<AdapterAccount>(accountSnapshot);
    },

    async unlinkAccount({ provider, providerAccountId }) {
      const accountQuery = Accounts.where('provider', '==', provider)
        .where('providerAccountId', '==', providerAccountId)
        .limit(1);
      const accountSnapshots = await accountQuery.get();
      const accountSnapshot = accountSnapshots.docs[0];

      if (accountSnapshot?.exists) {
        await accountSnapshot.ref.delete();
      }
    },

    async createSession(session) {
      const sessionRef = await Sessions.add(stripUndefined(session));
      const sessionSnapshot = await sessionRef.get();
      const result = docSnapshotToObject<AdapterSession>(sessionSnapshot);
      if (!result) {
        throw new Error('[createSession] Failed to create session');
      }
      return result;
    },

    async getSessionAndUser(sessionToken) {
      const sessionQuery = Sessions.where('sessionToken', '==', sessionToken).limit(1);
      const sessionSnapshots = await sessionQuery.get();
      const sessionSnapshot = sessionSnapshots.docs[0];
      const session = docSnapshotToObject<AdapterSession>(sessionSnapshot);
      if (session) {
        const userDoc = await Users.doc(session.userId).get();
        const user = docSnapshotToObject<AdapterUser>(userDoc);
        if (user) {
          return { session, user };
        }
      }
      return null;
    },

    async updateSession(partialSession) {
      const sessionQuery = Sessions.where('sessionToken', '==', partialSession.sessionToken).limit(1);
      const sessionSnapshots = await sessionQuery.get();
      const sessionSnapshot = sessionSnapshots.docs[0];

      if (sessionSnapshot?.exists) {
        await sessionSnapshot.ref.set(stripUndefined(partialSession), { merge: true });
        const sessionDoc = await sessionSnapshot.ref.get();
        const session = docSnapshotToObject<AdapterSession>(sessionDoc);
        if (session) {
          return session;
        }
      }

      return null;
    },

    async deleteSession(sessionToken) {
      const sessionQuery = Sessions.where('sessionToken', '==', sessionToken).limit(1);
      const sessionSnapshots = await sessionQuery.get();
      const sessionSnapshot = sessionSnapshots.docs[0];

      if (sessionSnapshot?.exists) {
        await sessionSnapshot.ref.delete();
      }
    },

    async createVerificationToken(verificationToken) {
      const verificationTokenRef = await VerificationTokens.add(stripUndefined(verificationToken));
      const verificationTokenSnapshot = await verificationTokenRef.get();
      return docSnapshotToObject<VerificationToken>(verificationTokenSnapshot);
    },

    async useVerificationToken({ identifier, token }) {
      const verificationTokensQuery = VerificationTokens.where('identifier', '==', identifier)
        .where('token', '==', token)
        .limit(1);
      const verificationTokenSnapshots = await verificationTokensQuery.get();
      const verificationTokenSnapshot = verificationTokenSnapshots.docs[0];

      if (verificationTokenSnapshot?.exists) {
        await verificationTokenSnapshot.ref.delete();
        return docSnapshotToObject<VerificationToken>(verificationTokenSnapshot);
      }

      return null;
    },
  };
}
