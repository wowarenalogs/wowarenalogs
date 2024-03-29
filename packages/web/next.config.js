const withTM = require('next-transpile-modules')(['@wowarenalogs/shared']);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['images.wowarenalogs.com'],
    unoptimized: true,
  },
};

module.exports = withTM(nextConfig);
