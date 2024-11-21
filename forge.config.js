// forge.config.js
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');

module.exports = {
  packagerConfig: {
    name: "Paraglide",
    executableName: "Paraglide",
    asar: {
      unpack: "**/{node_modules/node-global-key-listener,public}/**/*"
    },
    unpack: [
      "*.node",
      "**/*.dll",
      "**/public/**/*"
    ],
    icon: path.resolve(__dirname, process.platform === 'win32' 
      ? 'public/icons/win/icon.ico' 
      : 'public/icons/mac/icon.icns'),
    appBundleId: 'com.paraglide.app',
    appCategoryType: "public.app-category.productivity",
    extendInfo: path.resolve(__dirname, 'public/mac/Info.plist'),
    ignore: [
      // 불필요한 파일 제외
      /\.git/,
      /node_modules[\/\\].*[/\\]test[/\\].*/,
      /node_modules[\/\\].*[/\\]__tests__[/\\].*/,
      /src[/\\].*\.test\.js$/,
      /src[/\\].*\.spec\.js$/
    ],
    protocols: [{
        name: "Paraglide URL",
        schemes: ["paraglide"]
      }],  
    files: [
      "build/**/*",
      "src/main.js",
      "src/SystemListener.js",
      "package.json"
    ],
    directories: {
      output: 'out',
      buildResources: 'public'
    }
  },



  makers: [
    // macOS
    {
      name: '@electron-forge/maker-dmg',
      config: {
        icon: path.resolve(__dirname, 'public/icons/mac/icon.icns'),
        format: 'ULFO'
      }
    },
    // Windows
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Paraglide',
        authors: 'WareAoba',
        setupIcon: path.resolve(__dirname, 'public/icons/win/icon.ico')
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32']
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