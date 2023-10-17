import { ApolloServer } from 'apollo-server-micro';
import { getSession } from 'next-auth/react';

import { resolvers } from './resolvers';
import { typeDefs } from './types/gql';

export const graphqlServer = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ req }) => {
    const session = await getSession({ req });
    return {
      user: session?.user,
    };
  },
});
