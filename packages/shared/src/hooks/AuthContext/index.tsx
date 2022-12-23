import { Session, User } from 'next-auth';
import { signOut, useSession } from 'next-auth/react';
import React, { useCallback, useContext, useEffect } from 'react';

import {
  getAnalyticsDeviceId,
  getAnalyticsSessionId,
  logAnalyticsEvent,
  setAnalyticsUserProperties,
} from '../../utils/analytics';
import { useClientContext } from '../ClientContext';

interface WALUser extends User {
  battlenetId: string;
  battletag: string;
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
  children: React.ReactNode | React.ReactNode[];
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
  const clientContext = useClientContext();

  const signIn = useCallback(() => {
    // following predefined schema by google analytics convention.
    // see https://developers.google.com/analytics/devguides/collection/ga4/reference/events?client_type=gtag#login
    clientContext.showLoginModal('/login', () => {
      logAnalyticsEvent('login', {
        method: 'bnet',
      });
      window.location.reload();
    });
  }, [clientContext]);

  let userId = null;
  let battleTag = null;
  let battlenetId = null;
  if (contextData.session?.user) {
    userId = contextData.session.user?.id;
    battleTag = contextData.session.user?.battletag;
    battlenetId = contextData.session.user?.battlenetId;
  }

  if (!userId) {
    userId = `anonymous:${getAnalyticsDeviceId()}:${getAnalyticsSessionId()}`;
  }
  if (!battlenetId) {
    battlenetId = userId;
  }

  return {
    isLoadingAuthData: contextData.loading,
    isAuthenticated: contextData.session?.user != null,
    userId,
    battleTag,
    battlenetId,
    signIn,
    signOut,
  };
};
