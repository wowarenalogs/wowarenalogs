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
  maxAge: 1000 * 60 * 60, // 60m
  maxSize: 100 * 1024 * 1024,
  sizeCalculation: (e) => JSON.stringify(e).length,
});

const clientId = process.env.BLIZZARD_CLIENT_ID;
const clientSecret = process.env.BLIZZARD_CLIENT_SECRET;

function createBlizzardFetch(route: string[], namespace: string, locale: string) {
  const froute = `https://${route[0]}.api.blizzard.com/${route
    .slice(1)
    .join('/')}?namespace=${namespace}&locale=${locale}`;
  return (token: string) =>
    fetch(encodeURI(froute), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
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
  if (!apiResult.ok) {
    throw new Error(`Token refresh failed for region ${region}: ${apiResult.status}`);
  }
  const jsonResult: AuthResult = await apiResult.json();
  return jsonResult['access_token'];
}

export async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { route, namespace, locale } = req.query;
  if (!route) {
    res.status(400);
    return;
  }
  const region = route[0];
  const key = JSON.stringify(route);
  if (apiCache.has(key)) {
    res.status(200).json(apiCache.get(key));
    return;
  }
  const apiCall = createBlizzardFetch(route as string[], namespace as string, locale as string);
  try {
    if (tokens[region] === 'invalid') {
      tokens[region] = await refreshToken(region);
    }
    let apiResult = await apiCall(tokens[region]);
    if (apiResult.status === 401 || apiResult.status === 403) {
      tokens[region] = await refreshToken(region);
      apiResult = await apiCall(tokens[region]);
    }
    if (!apiResult.ok) {
      res.status(apiResult.status).json({ error: `Blizzard API returned ${apiResult.status}` });
      return;
    }
    const text = await apiResult.text();
    if (!text) {
      res.status(502).json({ error: 'Empty response from Blizzard API' });
      return;
    }
    const jsonResponse = JSON.parse(text);
    apiCache.set(key, jsonResponse);
    res.status(200).json(jsonResponse);
  } catch (e) {
    console.error('Blizzard API proxy error:', e);
    res.status(502).json({ error: 'Failed to fetch from Blizzard API' });
  }
}
