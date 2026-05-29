module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated's babel plugin must be listed last. It also powers
    // react-native-skia's worklet-based drawing hooks.
    plugins: ['react-native-reanimated/plugin'],
  };
};
