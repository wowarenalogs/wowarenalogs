const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@wowarenalogs/shared'],
  typescript: {
    // @pixi/react types can lag React versions; these are safe to ignore since
    // they only affect the desktop replay feature.
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
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@wowarenalogs/parser': path.resolve(__dirname, '..', 'parser', 'dist', 'parser.esm.js'),
    };

    return config;
  },
};

module.exports = nextConfig;
