import { Session, User } from 'next-auth';
import { useSession } from 'next-auth/react';
import React, { useContext, useEffect } from 'react';

import { getAnalyticsDeviceId, getAnalyticsSessionId, setAnalyticsUserProperties } from '../../utils/analytics';

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
  const { data, status } = useSession();

  useEffect(() => {
    if (status !== 'loading') {
      setAnalyticsUserProperties({
        id: (data as WALSession)?.user?.id || undefined,
        isAuthenticated: status === 'authenticated',
      });
    }
  }, [data, status]);

  return (
    <AuthContext.Provider
      value={{
        session: data as WALSession,
        loading: status === 'loading',
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
    userId = `anonymous:${getAnalyticsDeviceId()}:${getAnalyticsSessionId()}`;
  }

  return {
    isLoadingAuthData: contextData.loading,
    isAuthenticated: contextData.session?.user != null,
    userId,
    battleTag,
    region,
  };
};
