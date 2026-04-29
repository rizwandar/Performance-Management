module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // expo-router lives in mobile/node_modules (not hoisted to the workspace root).
      // babel-preset-expo's hasModule('expo-router') resolves from the root node_modules
      // and returns false, so it skips adding this plugin automatically. We add it here
      // so that process.env.EXPO_ROUTER_APP_ROOT is inlined as a string literal before
      // Metro's collect-dependencies runs require.context validation.
      require('babel-preset-expo/build/expo-router-plugin').expoRouterBabelPlugin,
      'react-native-reanimated/plugin',
    ],
  }
}
