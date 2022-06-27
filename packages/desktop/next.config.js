const { i18n } = require('./next-i18next.config');
const withTM = require('next-transpile-modules')(['@wowarenalogs/shared']);

module.exports = withTM({
  i18n,
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.target = 'web';
      config.plugins.push(
        new webpack.DefinePlugin({
          'process.env': {},
        }),
      );
    }
    config.node = {
      ...config.node,
      __dirname: true,
    };
    config.externals.push('fsevents');
    return config;
  },
});
