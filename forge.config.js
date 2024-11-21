// forge.config.js
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');

module.exports = {
  packagerConfig: {
    name: "Paraglide",
    executableName: "Paraglide",
    asar: {
      unpack: "**/public/**/*"
    },
    icon: path.resolve(__dirname, 'public/icons/mac/icon.icns'),
    appBundleId: 'com.paraglide.app',
    appCategoryType: "public.app-category.productivity",
    extendInfo: path.resolve(__dirname, 'public/mac/Info.plist'),
    osxSign: {
        identity: null,  // 개발용
        "entitlements": "entitlements.plist",
        "entitlements-inherit": "entitlements.plist",
      },
    protocols: [{
        name: "Paraglide URL",
        schemes: ["paraglide"]
      }],  
    files: [
      "build/**/*",
      "src/main.js",
      "src/SystemListener.js",
      "public/**/*"
    ],
    directories: {
      output: 'out',
      buildResources: 'public'
    }
  },
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {
        icon: path.resolve(__dirname, 'public/icons/mac/icon.icns'),
        format: 'ULFO'
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin']
    }
  ],
  plugins: [
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ]
};