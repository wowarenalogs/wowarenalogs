const path = require('path');

module.exports = {
  mode: 'production',
  target: 'electron-main',
  devtool: 'source-map',
  resolve: {
    extensions: ['.js', '.jsx', '.json', '.ts', '.tsx'],
  },
  entry: './dist/main.js',
  output: {
    filename: 'main.bundle.js',
    path: path.resolve(__dirname, 'dist'),
    assetModuleFilename: '[path][name].[ext]',
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
      {
        test: /\.node$/,
        generator: {
          filename: '[path][name][ext]',
        },
        use: {
          loader: 'node-loader',
          options: {
            name: '[name].[ext]',
          },
        },
      },
      {
        type: 'asset/resource',
        test: /\.(ini|dll|exe|effect|png|cube)$/,
      },
    ],
  },
};
