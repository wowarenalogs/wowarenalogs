const withTM = require('next-transpile-modules')(['@wowarenalogs/shared']);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['images.wowarenalogs.com'],
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

module.exports = withTM(nextConfig);
