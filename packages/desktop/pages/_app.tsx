import '../styles/globals.css';

import { ApolloClient, ApolloProvider, createHttpLink, InMemoryCache } from '@apollo/client';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';

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
        keyFields: ['id', 'spec'],
      },
    },
  }),
  link,
});

function App(props: AppProps) {
  return (
    <ApolloProvider client={client}>
      <DesktopLayout {...props} />
    </ApolloProvider>
  );
}

export default App;
