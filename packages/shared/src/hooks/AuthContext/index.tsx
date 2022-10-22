import { getRedirectResult, OAuthProvider, onAuthStateChanged, signInWithRedirect, User } from 'firebase/auth';
import React, { useContext, useEffect } from 'react';

import { useFirebaseContext } from '../FirebaseContext';

interface IAuthContextData {
  signIn: () => void;
  signOut: () => void;
  user: User | null;
}

const AuthContext = React.createContext<IAuthContextData>({
  signIn: () => {},
  signOut: () => {},
  user: null,
});

interface IProps {
  children: React.ReactNode | React.ReactNode[];
}

const battlenetProvider = new OAuthProvider('oidc.battle.net');
battlenetProvider.addScope('openid');

export const AuthProvider = (props: IProps) => {
  const [user, setUser] = React.useState<User | null>(null);
  const { auth } = useFirebaseContext();

  const signIn = async () => {
    await signInWithRedirect(auth, battlenetProvider);
  };

  const signOut = async () => {
    await auth.signOut();
    setUser(null);
  };

  useEffect(() => {
    getRedirectResult(auth)
      .then((_result) => {
        console.log('redirect result', _result);
      })
      .catch((_error) => {
        signOut();
      });

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        signIn,
        signOut,
        user,
      }}
    >
      {props.children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const contextData = useContext(AuthContext);
  return contextData;
};
