Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot "..\public\para-icon.png"
$outPath = Join-Path $PSScriptRoot "..\public\icons\win\para-icon.ico"
$src = [System.Drawing.Image]::FromFile((Resolve-Path $srcPath))

$sizes = @(256, 48, 32, 16)
$pngDatas = @()

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($src, 0, 0, $size, $size)
    $g.Dispose()
    
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngDatas += ,($ms.ToArray())
    $ms.Dispose()
    $bmp.Dispose()
}
$src.Dispose()

# Build ICO file
$ico = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($ico)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$sizes.Length)

$dataOffset = 6 + ($sizes.Length * 16)

for ($i = 0; $i -lt $sizes.Length; $i++) {
    $s = $sizes[$i]
    $w = if ($s -eq 256) { 0 } else { $s }
    $h = if ($s -eq 256) { 0 } else { $s }
    $writer.Write([byte]$w)
    $writer.Write([byte]$h)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$pngDatas[$i].Length)
    $writer.Write([uint32]$dataOffset)
    $dataOffset += $pngDatas[$i].Length
}

for ($i = 0; $i -lt $pngDatas.Length; $i++) {
    $writer.Write($pngDatas[$i])
}

$writer.Flush()
[System.IO.File]::WriteAllBytes($outPath, $ico.ToArray())
$writer.Dispose()
$ico.Dispose()

# Verify
$result = [System.IO.File]::ReadAllBytes($outPath)
$firstBytes = ($result[0..7] | ForEach-Object { '{0:X2}' -f $_ }) -join ' '
Write-Host "Generated ICO: $outPath"
Write-Host "  Header: $firstBytes"
Write-Host "  Size: $($result.Length) bytes"
$imgCount = [BitConverter]::ToInt16($result, 4)
Write-Host "  Images: $imgCount"
for ($i = 0; $i -lt $imgCount; $i++) {
    $o = 6 + ($i * 16)
    $w = $result[$o]; if ($w -eq 0) { $w = 256 }
    $h = $result[$o+1]; if ($h -eq 0) { $h = 256 }
    $bpp = [BitConverter]::ToInt16($result, $o + 6)
    Write-Host "    Image $($i+1): ${w}x${h} ${bpp}bpp"
}
