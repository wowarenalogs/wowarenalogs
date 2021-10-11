const { i18n } = require('./next-i18next.config');
const withTM = require('next-transpile-modules')(['@wowarenalogs/shared']);

module.exports = withTM({
  i18n,
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.node = {
        dgram: 'empty',
        fs: 'empty',
        net: 'empty',
        tls: 'empty',
        child_process: 'empty',
      };
    }
    return config;
  },
});
