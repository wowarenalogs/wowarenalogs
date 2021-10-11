import LRUCache from 'lru-cache';
import type { NextApiRequest, NextApiResponse } from 'next';

// Tokens are region specific!
const tokens: Record<string, string> = {
  eu: 'invalid',
  us: 'invalid',
  apac: 'invalid',
  cn: 'invalid',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiCache = new LRUCache<string, any>({
  max: 100 * 1024 * 1024 /* cache size will be 100 MB using `return n.length` as length() function */,
  length: function (n, key) {
    return JSON.stringify(n).length;
  },
  maxAge: 1000 * 60 * 60, // 60m
});

const clientId = process.env.BLIZZARD_CLIENT_ID;
const clientSecret = process.env.BLIZZARD_CLIENT_SECRET;

function createBlizzardFetch(route: string[], namespace: string, locale: string) {
  const froute = `https://${route[0]}.api.blizzard.com/${route
    .slice(1)
    .join('/')}?namespace=${namespace}&locale=${locale}`;
  return (token: string) =>
    fetch(encodeURI(froute + `&access_token=${token}`), {
      headers: {
        Accept: 'application/json',
      },
    });
}

interface AuthResult {
  access_token: string;
  expires_in: string;
  sub: string;
  token_type: string;
}

async function refreshToken(region: string): Promise<string> {
  const apiResult = await fetch(`https://${region}.battle.net/oauth/token?grant_type=client_credentials`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
  });
  const jsonResult: AuthResult = await apiResult.json();
  return jsonResult['access_token'];
}

export async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { route, namespace, locale } = req.query;
  const region = route[0];
  const key = JSON.stringify(route);
  if (apiCache.has(key)) {
    res.status(200).json(apiCache.get(key));
    return;
  }
  const apiCall = createBlizzardFetch(route as string[], namespace as string, locale as string);
  let apiResult = await apiCall(tokens[region]);
  if (apiResult.status === 401) {
    // If we 401, refresh the token and try again
    tokens[region] = await refreshToken(region);
    apiResult = await apiCall(tokens[region]);
  }
  const jsonResponse = await apiResult.json();
  apiCache.set(key, jsonResponse);
  res.status(200).json(jsonResponse);
}
