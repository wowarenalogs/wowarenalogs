import { graphqlServer } from '@wowarenalogs/shared/src/graphql-server';

export const config = {
  api: {
    bodyParser: false,
  },
};

const startServer = graphqlServer.start();

const main = async (req: any, res: any) => {
  await startServer;
  await graphqlServer.createHandler({ path: '/api/graphql' })(req, res);
};

export default main;
