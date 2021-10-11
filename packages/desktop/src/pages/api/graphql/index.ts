import { graphqlServer } from '@wowarenalogs/shared/src/graphql-server';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default graphqlServer.createHandler({ path: '/api/graphql' });
