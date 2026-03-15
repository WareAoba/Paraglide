[CmdletBinding()]
param(
    [string]$AppDir,
    [string]$InnoCompilerPath,
    [switch]$SkipPackage
)

$ErrorActionPreference = 'Stop'

function Resolve-InnoCompiler {
    param(
        [string]$ExplicitPath
    )

    if ($ExplicitPath) {
        if (-not (Test-Path -LiteralPath $ExplicitPath)) {
            throw "지정한 Inno Setup 컴파일러를 찾을 수 없습니다: $ExplicitPath"
        }

        return (Resolve-Path -LiteralPath $ExplicitPath).Path
    }

    $command = Get-Command iscc.exe -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $candidates = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
        (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    if ($candidates.Count -gt 0) {
        return $candidates[0]
    }

    throw 'Inno Setup 6의 ISCC.exe를 찾지 못했습니다. Inno Setup 6을 설치하거나 -InnoCompilerPath로 경로를 지정하세요.'
}

function Resolve-AppOutputDir {
    param(
        [string]$ExplicitPath,
        [string]$RepoRoot
    )

    if ($ExplicitPath) {
        if (-not (Test-Path -LiteralPath $ExplicitPath)) {
            throw "지정한 패키지 폴더를 찾을 수 없습니다: $ExplicitPath"
        }

        return (Resolve-Path -LiteralPath $ExplicitPath).Path
    }

    $outDir = Join-Path $RepoRoot 'out'
    if (-not (Test-Path -LiteralPath $outDir)) {
        throw 'out 폴더를 찾지 못했습니다. 먼저 패키징을 실행했는지 확인하세요.'
    }

    $candidate = Get-ChildItem -LiteralPath $outDir -Directory |
        Where-Object { $_.Name -like 'Paraglide-win32-*' } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $candidate) {
        throw '윈도우 패키지 폴더를 찾지 못했습니다. electron-forge package --platform win32 결과가 out 아래에 있어야 합니다.'
    }

    return $candidate.FullName
}

function ConvertTo-InnoNumericVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Version
    )

    $numericPart = ($Version -split '-', 2)[0]
    $segments = @($numericPart -split '\.') | Where-Object { $_ -ne '' }

    if ($segments.Count -eq 0) {
        throw "버전 문자열에서 숫자 버전을 추출할 수 없습니다: $Version"
    }

    $normalized = foreach ($segment in $segments) {
        if ($segment -notmatch '^\d+$') {
            throw "Inno Setup용 숫자 버전으로 변환할 수 없습니다: $Version"
        }

        [string][int]$segment
    }

    while ($normalized.Count -lt 4) {
        $normalized += '0'
    }

    if ($normalized.Count -gt 4) {
        $normalized = $normalized[0..3]
    }

    return ($normalized -join '.')
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir '..')).Path
$packageJsonPath = Join-Path $repoRoot 'package.json'
$installerScriptPath = Join-Path $repoRoot 'installer\windows\Paraglide.iss'
$releaseDir = Join-Path $repoRoot 'releases\windows'

if (-not (Test-Path -LiteralPath $packageJsonPath)) {
    throw "package.json을 찾을 수 없습니다: $packageJsonPath"
}

if (-not (Test-Path -LiteralPath $installerScriptPath)) {
    throw "Inno Setup 스크립트를 찾을 수 없습니다: $installerScriptPath"
}

$packageInfo = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
$version = $packageInfo.version
$fileVersion = ConvertTo-InnoNumericVersion -Version $version

if (-not $SkipPackage) {
    Push-Location $repoRoot
    try {
        Write-Host '[installer:win] Building renderer bundle...'
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            throw 'npm run build 실패'
        }

        Write-Host '[installer:win] Packaging Electron app for win32...'
        & npx electron-forge package --platform win32
        if ($LASTEXITCODE -ne 0) {
            throw 'electron-forge package --platform win32 실패'
        }
    }
    finally {
        Pop-Location
    }
}

$compilerPath = Resolve-InnoCompiler -ExplicitPath $InnoCompilerPath
$sourceDir = Resolve-AppOutputDir -ExplicitPath $AppDir -RepoRoot $repoRoot

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

$isccArgs = @(
    "/DAppVersion=$version",
    "/DAppFileVersion=$fileVersion",
    "/DSourceDir=$sourceDir",
    "/DRepoRoot=$repoRoot",
    "/DOutputDir=$releaseDir",
    $installerScriptPath
)

Write-Host "[installer:win] SourceDir: $sourceDir"
Write-Host "[installer:win] ISCC: $compilerPath"
Write-Host '[installer:win] Compiling Inno Setup installer...'

& $compilerPath @isccArgs
if ($LASTEXITCODE -ne 0) {
    throw 'ISCC.exe 실행 실패'
}

Write-Host "[installer:win] Installer created in: $releaseDir"