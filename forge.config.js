// forge.config.js
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');

module.exports = {
  packagerConfig: {
    name: "Paraglide",
    executableName: "Paraglide",
    win32metadata: {
      CompanyName: "WareAoba",
      FileDescription: "Paraglide",
      OriginalFilename: "Paraglide.exe",
      ProductName: "Paraglide",
      InternalName: "Paraglide",
      requestedExecutionLevel: 'asInvoker',
      manifestVersion: '1.0.0.0'
    },
    signAndEditExecutable: true,
    certificateFile: process.env.WINDOWS_CODESIGN_FILE,
    certificatePassword: process.env.WINDOWS_CODESIGN_PASSWORD,
    asar: {
      unpack: "**/public/**/*",
      compression: 'normal',
      smartUnpack: true
    },
    dir: './',
    icon: process.platform === 'darwin' 
    ? path.resolve(__dirname, 'public/icons/mac/icon.icns')
    : path.resolve(__dirname, 'public/icons/win/icon.ico'),
    appBundleId: 'com.paraglide.app',
    appCategoryType: "public.app-category.productivity",
    extendInfo: path.resolve(__dirname, 'public/mac/Info.plist'),
    ignore: [
     // === 프로젝트 폴더 제외 (패키징에 불필요) ===
     /[/\\]sample([/\\]|$)/,      // 2.7GB 샘플 파일들!
     /[/\\]tests([/\\]|$)/,       // 테스트 파일
     /[/\\]installer([/\\]|$)/,   // 인스톨러 스크립트
     /[/\\]scripts([/\\]|$)/,     // 빌드 스크립트
     /[/\\]releases([/\\]|$)/,    // 릴리즈 출력
     /[/\\]out([/\\]|$)/,         // 빌드 결과
     /[/\\]public([/\\]|$)/,      // dist에 이미 복사됨
     /[/\\]\.vite([/\\]|$)/,      // Vite 캐시

     // === 불필요한 파일 ===
     /\.git/,
     /\.psd$/,                    // PSD 원본 파일
     /\.map$/,
     /\.md$/,
     /\.test\.js$/,
     /\.spec\.js$/,
     /\.iss$/,
     /\.ts$/,
     /\.tsx$/,
     /\.d\.ts$/,
     /\.tsbuildinfo$/,
     /\.eslintrc.*/,
     /\.prettierrc.*/,
     /\.babelrc.*/,
     /\.editorconfig/,
     /thumbs\.db$/,
     /\.DS_Store$/,
     /\.npmignore$/,
     /\.gitignore$/,
     /\.yarn-integrity$/,
     /\.lock$/,
     /lock\.json$/,
     /\.log$/,
     /\.tmp$/,
     /\.cache$/,
     /\.zip$/,
     /\.tar$/,
     /\.gz$/,
     /\.env/,
     /forge\.config\.js$/,
     /vite\.config\.js$/,
     /vitest\.config\.js$/,

     // === node_modules 정리 ===
     /node_modules[/\\].*[/\\]test[/\\].*/,
     /node_modules[/\\].*[/\\]docs[/\\].*/,
     /node_modules[/\\].*[/\\]example[/\\].*/,
     /node_modules[/\\].*[/\\]\.github[/\\].*/,
     /node_modules[/\\].*[/\\]CHANGELOG.*/,
     /node_modules[/\\].*[/\\]LICENSE.*/,
     /node_modules[/\\].*[/\\]coverage[/\\].*/,
     /node_modules[/\\].*[/\\]__tests__[/\\].*/,
     /node_modules[/\\].*[/\\]__mocks__[/\\].*/,
     /node_modules[/\\].*[/\\]samples[/\\].*/,
     /node_modules[/\\].*[/\\]demo[/\\].*/,
     /node_modules[/\\].*[/\\]types[/\\].*/,
     /node_modules[/\\].*[/\\]typescript[/\\].*/,
     /node_modules[/\\].*[/\\]obj[/\\].*/,

    ],
    protocols: [{
        name: "Paraglide URL",
        schemes: ["paraglide"]
      }],  
    files: [
      "dist/**/*",
      "src/main.js",
      "src/SystemListener.jsx",
      "src/main/**/*",
      "src/store/**/*",
      "package.json"
    ],
    directories: {
      output: 'out',
      buildResources: 'assets'  // 리소스 디렉토리
    },
    extraResource: [
      "./dist",          // Vite 빌드 출력을 리소스로 포함
      "./native/paraglide_native.node",  // 네이티브 클립보드/키 주입 모듈
      ...(process.platform === 'win32' ? ["./native/sendesc.exe"] : []),  // Windows Esc 키 전송 데몬
    ]
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
          icon: path.resolve(__dirname, 'public/icons/win/icon.ico'),
          certificateFile: process.env.WINDOWS_CODESIGN_FILE,
          certificatePassword: process.env.WINDOWS_CODESIGN_PASSWORD,
          signWithParams: '/tr http://timestamp.digicert.com /td sha256 /fd sha256'
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
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ]
};