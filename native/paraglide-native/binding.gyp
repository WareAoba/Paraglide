{
  "targets": [
    {
      "target_name": "paraglide_native",
      "sources": ["src/addon.cpp"],
      "include_dirs": [
        "<!(node -e \"console.log(require('path').resolve(require('path').dirname(require.resolve('node-addon-api/package.json'))))\")"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "cflags_cc": ["-std=c++17"],
      "conditions": [
        ["OS=='win'", {
          "sources": ["src/platform_win.cpp"],
          "libraries": ["-luser32"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": ["/std:c++17"]
            }
          }
        }],
        ["OS=='mac'", {
          "sources": ["src/platform_mac.mm"],
          "libraries": [
            "-framework AppKit",
            "-framework CoreGraphics"
          ],
          "xcode_settings": {
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "OTHER_CPLUSPLUSFLAGS": ["-std=c++17"],
            "OTHER_LDFLAGS": [
              "-framework AppKit",
              "-framework CoreGraphics"
            ]
          }
        }],
        ["OS=='linux'", {
          "sources": ["src/platform_linux.cpp"],
          "libraries": ["-lX11", "-lXfixes", "-lXtst"],
          "cflags_cc": ["-std=c++17"]
        }]
      ]
    }
  ]
}
