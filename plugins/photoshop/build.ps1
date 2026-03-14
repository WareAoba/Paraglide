# Paraglide Connector — UXP Plugin 패키징 스크립트
# 사용법: PowerShell에서 .\build.ps1 실행

$ErrorActionPreference = "Stop"
$pluginDir = $PSScriptRoot
$outputName = "Paraglide-Connector.ccx"
$outputPath = Join-Path $pluginDir $outputName

# 패키징할 파일 목록
$files = @(
    "manifest.json",
    "index.html",
    "plugin.js",
    "logo_dark.png",
    "logo_light.png",
    "TitleDark.png",
    "TitleLight.png"
)

# icons 폴더의 모든 png 파일
$iconFiles = Get-ChildItem -Path (Join-Path $pluginDir "icons") -Filter "*.png" | ForEach-Object { "icons\$($_.Name)" }

# 기존 ccx 파일 삭제
if (Test-Path $outputPath) {
    Remove-Item $outputPath -Force
}

# 임시 폴더에 파일 수집
$tempDir = Join-Path $env:TEMP "paraglide-ccx-build"
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempDir "icons") | Out-Null

foreach ($f in $files) {
    $src = Join-Path $pluginDir $f
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $tempDir $f)
    } else {
        Write-Warning "파일 없음: $f"
    }
}

foreach ($f in $iconFiles) {
    $src = Join-Path $pluginDir $f
    Copy-Item $src (Join-Path $tempDir $f)
}

# ZIP 생성 후 .ccx로 이름 변경
$zipPath = $outputPath -replace '\.ccx$', '.zip'
Compress-Archive -Path (Join-Path $tempDir "*") -DestinationPath $zipPath -Force
Rename-Item $zipPath $outputName

# 임시 폴더 정리
Remove-Item $tempDir -Recurse -Force

$size = (Get-Item $outputPath).Length
Write-Host ""
Write-Host "빌드 완료: $outputName ($size bytes)" -ForegroundColor Green
Write-Host ""
Write-Host "설치 방법:" -ForegroundColor Cyan
Write-Host "  1. Creative Cloud Desktop 열기"
Write-Host "  2. Stock & Marketplace > 플러그인 탭"
Write-Host "  3. 우측 상단 ... 메뉴 > '파일에서 플러그인 설치'"
Write-Host "  4. $outputName 선택"
Write-Host ""
Write-Host "또는 수동 설치:" -ForegroundColor Cyan
Write-Host "  폴더를 아래 경로에 복사:"
Write-Host "  %APPDATA%\Adobe\UXP\PluginsStorage\PHSP\Internal\"
