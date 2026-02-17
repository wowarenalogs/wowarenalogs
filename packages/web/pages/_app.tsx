import '../styles/globals.css';

import { ApolloClient, ApolloProvider, createHttpLink, InMemoryCache } from '@apollo/client';
import { AuthProvider } from '@wowarenalogs/shared/src';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { SessionProvider, SessionProviderProps } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';

import WebLayout from '../components/WebLayout';
import { AppConfigContextProvider } from '../hooks/AppConfigContext';

const DesktopLayout = dynamic(
  () => {
    const promise = import('../components/DesktopLayout').then((mod) => mod.DesktopLayout);
    return promise;
  },
  { ssr: false },
);

const link = createHttpLink({
  uri: '/api/graphql',
  // TODO: FIX ENV
  // credentials: env.stage === 'development' ? 'include' : 'same-origin',
  credentials: 'include',
});

const client = new ApolloClient({
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
      nextFetchPolicy: 'cache-and-network',
    },
  },
  cache: new InMemoryCache({
    typePolicies: {
      CombatUnitStub: {
        keyFields: false,
      },
    },
  }),
  link,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 600,
      retry: (_failureCount: unknown, error: unknown) => {
        if ((error as Error)?.message === 'Fetch error 404') {
          return false;
        }
        return true;
      },
    },
  },
});

function App(props: AppProps<SessionProviderProps>) {
  const router = useRouter();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    // Detect if running in Electron via the bridge
    setIsDesktop(typeof window !== 'undefined' && !!window.wowarenalogs?.app);
  }, []);

  if (isDesktop) {
    // Desktop login bypass
    if (router.pathname.indexOf('/login') > -1 || router.pathname.indexOf('/desktop_login') > -1) {
      return <props.Component {...props.pageProps} />;
    }
    return (
      <SessionProvider session={props.pageProps.session}>
        <QueryClientProvider client={queryClient}>
          <ApolloProvider client={client}>
            <AppConfigContextProvider>
              <DesktopLayout {...props} />
            </AppConfigContextProvider>
          </ApolloProvider>
        </QueryClientProvider>
      </SessionProvider>
    );
  }

  // Auth routes get a minimal layout (no sidebar/nav) — especially for popup windows
  if (router.pathname === '/login' || router.pathname.startsWith('/api/auth')) {
    return (
      <SessionProvider session={props.pageProps.session}>
        <props.Component {...props.pageProps} />
      </SessionProvider>
    );
  }

  // Normal web layout
  return (
    <SessionProvider session={props.pageProps.session}>
      <QueryClientProvider client={queryClient}>
        <ApolloProvider client={client}>
          <AuthProvider>
            <WebLayout>
              <props.Component {...props.pageProps} />
            </WebLayout>
          </AuthProvider>
        </ApolloProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}

export default App;
