const { i18n } = require('./next-i18next.config');
const withTM = require('next-transpile-modules')(['@wowarenalogs/shared']);

/** @type {import('next').NextConfig} */
const nextConfig = {
  i18n,
  reactStrictMode: true,
  images: {
    domains: ['images.wowarenalogs.com'],
  },
};

module.exports = withTM(nextConfig);
