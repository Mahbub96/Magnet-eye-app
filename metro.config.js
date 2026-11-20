// Metro configuration (Expo default plus one fix).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// react-three-fiber loads `three` with require(), which resolves to three's CommonJS build.
// That build calls process.emitWarning, which does not exist in React Native, and crashes the
// app at start. Always use three's ES module build instead.
const threeModule = path.resolve(__dirname, 'node_modules/three/build/three.module.js');
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') return { type: 'sourceFile', filePath: threeModule };
  return resolveRequest ? resolveRequest(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
