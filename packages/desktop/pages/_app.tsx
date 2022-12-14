import '../styles/globals.css';

import { ApolloClient, ApolloProvider, createHttpLink, InMemoryCache } from '@apollo/client';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { SessionProvider, SessionProviderProps } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from 'react-query';

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
      refetchOnWindowFocus: false,
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

  if (router.pathname.indexOf('/login') > -1) {
    // bypass main layout when rendering the desktop login page
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

export default App;
