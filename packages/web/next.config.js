const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@wowarenalogs/shared'],
  typescript: {
    // @pixi/react JSX types currently don't cover our custom pixi* tags
    // in this workspace build, so keep type-check bypass enabled for web build.
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
