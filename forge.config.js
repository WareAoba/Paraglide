// forge.config.js
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');

module.exports = {
  packagerConfig: {
    name: "Paraglide",
    executableName: "Paraglide",
    asar: {
      unpack: "**/{node_modules/node-global-key-listener,public}/**/*",
      compression: 'maximum'
    },
    icon: process.platform === 'darwin' 
    ? path.resolve(__dirname, 'public/icons/mac/icon.icns')
    : path.resolve(__dirname, 'public/icons/win/icon.ico'),
    appBundleId: 'com.paraglide.app',
    appCategoryType: "public.app-category.productivity",
    extendInfo: path.resolve(__dirname, 'public/mac/Info.plist'),
    ignore: [
      // 불필요한 파일 제외
  // 기존 패턴
     /\.git/,
     /node_modules[\/\\].*[/\\]test[/\\].*/,
     /node_modules[\/\\].*[/\\]docs[/\\].*/,
     /node_modules[\/\\].*[/\\]example[/\\].*/,
     /\.map$/,
     /\.md$/,
     /\.test\.js$/,
     /\.spec\.js$/,
  
     // 추가할 패턴
     /node_modules[\/\\].*[/\\]\.github[/\\].*/, // GitHub 관련 파일
     /node_modules[\/\\].*[/\\]typescript[/\\].*/, // TypeScript 정의 파일
     /\.ts$/,  // TypeScript 소스
     /\.tsx$/,
     /\.d\.ts$/,
     /\.tsbuildinfo$/,
     /\.eslintrc.*/, // lint 설정
     /\.prettierrc.*/, // prettier 설정
     /\.babelrc.*/, // babel 설정
     /\.editorconfig/, // 에디터 설정
     /thumbs\.db$/, // Windows 썸네일
     /\.DS_Store$/, // macOS 메타데이터
     /node_modules[\/\\].*[/\\]CHANGELOG.*/, // 변경 로그
     /node_modules[\/\\].*[/\\]LICENSE.*/, // 라이선스 파일
     /node_modules[\/\\].*[/\\]README.*/, // README 파일
     /\.npmignore$/,
     /\.gitignore$/,
     /\.yarn-integrity$/,
     /yarn-debug\.log$/,
     /yarn-error\.log$/,
     /npm-debug\.log$/,
     /node_modules[\/\\].*[/\\]bin[/\\].*/, // 실행 파일
     /node_modules[\/\\].*[/\\]obj[/\\].*/, // 중간 빌드 파일
     /\.zip$/,  // 압축 파일
     /\.tar$/,
     /\.gz$/,
     /node_modules[\/\\].*[/\\]samples[/\\].*/, // 예제 파일
     /node_modules[\/\\].*[/\\]demo[/\\].*/, // 데모 파일
     /\.min\.(js|css)\.map$/, // 최소화된 파일의 소스맵
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
    {
      name: '@electron-forge/maker-dmg',
      config: {
        icon: path.resolve(__dirname, 'public/icons/mac/icon.icns'),
        format: 'ULFO'
      }
    },
    {
      // Windows용 portable exe
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
      config: {
        // Windows 설정
        options: {
          icon: path.resolve(__dirname, 'public/icons/win/icon.ico')
        }
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