// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// markdown-it (via react-native-markdown-display) requires the Node core
// "punycode" module, which Metro doesn't provide. Point it at the userland package.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  punycode: require.resolve('punycode/'),
};

// --- Web support for expo-sqlite (runs SQLite as WebAssembly) ---
config.resolver.assetExts.push('wasm');

// wa-sqlite needs SharedArrayBuffer, which browsers only expose to
// cross-origin-isolated pages. Send the required headers from the dev server.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  return middleware(req, res, next);
};

module.exports = config;
