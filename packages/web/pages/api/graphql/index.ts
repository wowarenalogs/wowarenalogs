import { graphqlServer } from '@wowarenalogs/shared/src/graphql-server';
import { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: {
    bodyParser: false,
  },
};

const startServer = graphqlServer.start();

const main = async (req: NextApiRequest, res: NextApiResponse) => {
  await startServer;
  await graphqlServer.createHandler({ path: '/api/graphql' })(req, res);
};

export default main;
