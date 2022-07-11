import { ApolloServer } from 'apollo-server-micro';
import { getSession } from 'next-auth/react';

import { resolvers } from './resolvers';
import { typeDefs } from './types';

export const graphqlServer = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => {
    return getSession({ req }).then((session) => {
      return {
        user: session?.user,
      };
    });
  },
});
