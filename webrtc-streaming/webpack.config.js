const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/mediasoup-client-bundle.js',
  output: {
    filename: 'mediasoup-client.bundle.js',
    path: path.resolve(__dirname, 'public'),
    library: 'mediasoupClient',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  resolve: {
    extensions: ['.js']
  },
  devtool: 'source-map'
};
