import { graphqlServer } from '@wowarenalogs/shared/src/graphql-server';
import { NextApiRequest, NextApiResponse, NextConfig } from 'next';

export const config: NextConfig = {
  api: {
    bodyParser: false,
  },
};

const startServer = graphqlServer.start();

const main = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'OPTIONS') {
    res.end();
    return false;
  }
  await startServer;
  return graphqlServer.createHandler({ path: '/api/graphql' })(req, res);
};

export default main;
