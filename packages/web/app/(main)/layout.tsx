'use client';

import { ApolloClient, ApolloProvider, createHttpLink, InMemoryCache } from '@apollo/client';
import { AuthProvider } from '@wowarenalogs/shared/src';
import dynamic from 'next/dynamic';
import { SessionProvider } from 'next-auth/react';
import { Suspense, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';

import WebLayout from '../../components/WebLayout';
import { AppConfigContextProvider } from '../../hooks/AppConfigContext';

const DesktopLayout = dynamic(() => import('../../components/DesktopLayout').then((mod) => mod.DesktopLayout), {
  ssr: false,
});

const link = createHttpLink({
  uri: '/api/graphql',
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

export default function MainGroupLayout({ children }: { children: React.ReactNode }) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setIsDesktop(typeof window !== 'undefined' && !!window.wowarenalogs?.app);
  }, []);

  if (isDesktop) {
    return (
      <Suspense>
        <SessionProvider>
          <QueryClientProvider client={queryClient}>
            <ApolloProvider client={client}>
              <AppConfigContextProvider>
                <DesktopLayout>{children}</DesktopLayout>
              </AppConfigContextProvider>
            </ApolloProvider>
          </QueryClientProvider>
        </SessionProvider>
      </Suspense>
    );
  }

  return (
    <Suspense>
      <SessionProvider>
        <QueryClientProvider client={queryClient}>
          <ApolloProvider client={client}>
            <AuthProvider>
              <WebLayout>{children}</WebLayout>
            </AuthProvider>
          </ApolloProvider>
        </QueryClientProvider>
      </SessionProvider>
    </Suspense>
  );
}
