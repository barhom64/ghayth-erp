const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Allow Metro to resolve packages from root node_modules (pnpm hoisted)
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../../node_modules'),
  path.resolve(__dirname, '../../node_modules/.pnpm/node_modules'),
];

config.watchFolders = [
  path.resolve(__dirname, '../../lib'),
  path.resolve(__dirname, '../../node_modules'),
];

module.exports = config;
