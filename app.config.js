module.exports = () => {
  const config = {
    name: "Out-in-Zmb",
    slug: "out-in-zmb",
    scheme: "outandaround",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    primaryColor: "#fdab53",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#093430"
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.ttleisureland.outinzmb",
      buildNumber: "1",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSLocationWhenInUseUsageDescription: "Out-in-Zmb uses your location to show nearby members on the At Venue map and tag posts with your area.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "Out-in-Zmb uses your location to show nearby members on the At Venue map and tag posts with your area.",
        NSCameraUsageDescription: "Out-in-Zmb uses your camera to take profile photos and post images.",
        NSPhotoLibraryUsageDescription: "Out-in-Zmb accesses your photo library to upload profile photos and post images.",
        NSPhotoLibraryAddUsageDescription: "Out-in-Zmb saves photos to your library.",
        NSMicrophoneUsageDescription: "Out-in-Zmb may access your microphone for video features."
      }
    },
    android: {
      package: "com.ttleisureland.outinzmb",
      // Local dev/prebuild reads the git-ignored file straight off disk;
      // EAS Build injects the path via the GOOGLE_SERVICES_JSON file secret
      // instead, since the git-ignored file itself never reaches the builder.
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
      versionCode: 1,
      softwareKeyboardLayoutMode: "resize",
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "INTERNET"
      ],
      adaptiveIcon: {
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
        backgroundColor: "#093430"
      }
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-web-browser",
      "expo-apple-authentication",
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "Out-in-Zmb uses your location to show nearby members on the At Venue map and tag posts with your area."
        }
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "Out-in-Zmb accesses your photos to upload profile and post images.",
          cameraPermission: "Out-in-Zmb uses your camera to take profile and post photos."
        }
      ],
      "@react-native-community/datetimepicker",
      "expo-video",
      [
        "expo-notifications",
        {
          color: "#fdab53",
          sounds: []
        }
      ]
    ],
    owner: "ttmanzs-team"
  };

  const mapsKey = process.env.GOOGLE_MAPS_API_KEY ?? '';

  config.ios = {
    ...config.ios,
    config: { googleMapsApiKey: mapsKey },
  };

  config.android = {
    ...config.android,
    config: { googleMaps: { apiKey: mapsKey } },
  };

  config.extra = {
    eas: { projectId: process.env.EAS_PROJECT_ID ?? '' },
  };

  return { expo: config };
};
