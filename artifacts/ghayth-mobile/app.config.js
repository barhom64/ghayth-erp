// Dynamic Expo config layered on top of the static app.json.
//
// Its ONLY job is to inject the web base path (`experiments.baseUrl`) when the
// app is exported for same-origin hosting under a sub-path (production web build
// served at https://erp.door.sa/mobile/). We gate it behind the EXPO_BASE_URL
// env var so the Replit dev preview (`expo start`, no EXPO_BASE_URL) keeps
// serving at the root of the Expo dev domain unchanged.
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_BASE_URL;
  if (baseUrl) {
    config.experiments = {
      ...(config.experiments || {}),
      baseUrl: baseUrl.replace(/\/+$/, ""),
    };
  }
  return config;
};
