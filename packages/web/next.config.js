/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@wowarenalogs/shared'],
  typescript: {
    // @inlet/react-pixi has type incompatibilities with React 18 types.
    // These are safe to ignore as they only affect the desktop replay feature.
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.wowarenalogs.com',
      },
    ],
    unoptimized: true,
  },
  async headers() {
    return [
      {
        has: [
          {
            type: 'header',
            key: 'Origin',
            value: 'https://studio.apollographql.com',
          },
        ],
        source: '/api/graphql',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: 'https://studio.apollographql.com',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'POST, GET, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'content-type',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
