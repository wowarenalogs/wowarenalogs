import { Session, User } from 'next-auth';
import { useSession } from 'next-auth/client';
import React, { useCallback, useContext, useEffect } from 'react';

interface WALUser extends User {
  battletag: string;
  region: string;
  id: string;
}

interface WALSession extends Session {
  user: WALUser;
}

interface IAuthContextData {
  session: WALSession | null | undefined;
  loading: boolean;
}

const AuthContext = React.createContext<IAuthContextData>({
  session: null,
  loading: true,
});

interface IProps {
  children: React.ReactNode | React.ReactNodeArray;
}

export const AuthProvider = (props: IProps) => {
  const [session, loading] = useSession();

  useEffect(() => {
    if (!loading) {
      // TODO: set analytics props
      // setAnalyticsUserProperties({
      //   id: (session as WALSession)?.user?.id || undefined,
      //   isAuthenticated: session?.user ? true : false,
      // });
    }
  }, [session, loading]);

  return (
    <AuthContext.Provider
      value={{
        session: session as WALSession,
        loading,
      }}
    >
      {props.children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const contextData = useContext(AuthContext);

  let userId = null;
  let battleTag = null;
  let region = null;
  if (contextData.session?.user) {
    region = contextData.session.user.region;
    userId = contextData.session.user?.id;
    battleTag = contextData.session.user?.battletag;
  }

  if (!userId) {
    userId = `anonymous`; // TODO: fix device id //`anonymous:${getAnalyticsDeviceId()}:${getAnalyticsSessionId()}`;
  }

  return {
    isLoadingAuthData: contextData.loading,
    isAuthenticated: contextData.session?.user != null,
    userId,
    battleTag,
    region,
  };
};