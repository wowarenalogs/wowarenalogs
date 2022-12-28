import '../styles/globals.css';

import { ApolloClient, ApolloProvider, createHttpLink, InMemoryCache } from '@apollo/client';
import type { AppProps } from 'next/app';
import { SessionProvider, SessionProviderProps } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from 'react-query';

import WebLayout from '../components/WebLayout';

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
  return (
    <SessionProvider session={props.pageProps.session}>
      <QueryClientProvider client={queryClient}>
        <ApolloProvider client={client}>
          <WebLayout>
            <props.Component {...props.pageProps} />
          </WebLayout>
        </ApolloProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}

export default App;
