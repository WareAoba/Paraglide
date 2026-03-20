# Paraglide Connector — UXP Plugin 개발용 직접 설치 스크립트
# 사용법: PowerShell에서 .\build.ps1 실행
#
# 이 스크립트는 CCX 설치가 아니라 개발용 로컬 설치입니다.
# UXP Develop 경로에 플러그인을 직접 복사합니다.
# 사전 조건: Creative Cloud Desktop에서 UXP 개발자 모드 활성화

$ErrorActionPreference = "Stop"
$pluginDir = $PSScriptRoot
$pluginId = "com.paraglide.connector"

# 설치 대상 경로 (UXP Develop)
$targetDir = Join-Path $env:APPDATA "Adobe\UXP\Develop\$pluginId"

# 복사할 파일 목록
$files = @(
    "manifest.json",
    "index.html",
    "plugin.js",
    "logo_dark.png",
    "logo_light.png",
    "TitleDark.png",
    "TitleLight.png"
)

Write-Host ""
Write-Host "Paraglide Connector — Photoshop UXP Plugin 설치" -ForegroundColor Cyan
Write-Host "대상: $targetDir" -ForegroundColor Gray
Write-Host ""

# 대상 디렉토리 생성
if (!(Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}
$iconsTarget = Join-Path $targetDir "icons"
if (!(Test-Path $iconsTarget)) {
    New-Item -ItemType Directory -Path $iconsTarget -Force | Out-Null
}

# 파일 복사
foreach ($f in $files) {
    $src = Join-Path $pluginDir $f
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $targetDir $f) -Force
        Write-Host "  복사: $f" -ForegroundColor DarkGray
    } else {
        Write-Warning "파일 없음: $f"
    }
}

# icons 폴더 복사
$iconFiles = Get-ChildItem -Path (Join-Path $pluginDir "icons") -Filter "*.png"
foreach ($icon in $iconFiles) {
    Copy-Item $icon.FullName (Join-Path $iconsTarget $icon.Name) -Force
    Write-Host "  복사: icons\$($icon.Name)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "설치 완료!" -ForegroundColor Green
Write-Host ""
Write-Host "다음 단계:" -ForegroundColor Yellow
Write-Host "  1. Creative Cloud Desktop에서 UXP 개발자 모드 활성화 확인"
Write-Host "  2. Photoshop 재시작"
Write-Host "  3. Photoshop 메뉴: Plugins → Paraglide"
Write-Host ""
Write-Host "제거하려면:" -ForegroundColor Gray
Write-Host "  Remove-Item '$targetDir' -Recurse -Force"
