param(
  [Parameter(Mandatory = $true)][string]$ReportPath,
  [Parameter(Mandatory = $true)][string]$OutDir
)

Add-Type -AssemblyName System.Drawing

$report = Get-Content -Raw -Encoding UTF8 $ReportPath | ConvertFrom-Json
$items = $report.items
$perSheet = 9
$cols = 3
$rows = 3
$cellW = 500
$cellH = 400
$margin = 16
$sheetW = $cols * $cellW + ($cols + 1) * $margin
$sheetH = $rows * $cellH + ($rows + 1) * $margin

$fontHeader = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$fontBody = New-Object System.Drawing.Font('Segoe UI', 8.5, [System.Drawing.FontStyle]::Regular)
$fontSmall = New-Object System.Drawing.Font('Consolas', 7.5, [System.Drawing.FontStyle]::Regular)

$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 242, 234))
$cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(28, 28, 28))
$mutedBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(95, 95, 95))
$okBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(22, 128, 72))
$warnBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(196, 122, 14))
$errBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(190, 34, 34))
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(205, 200, 188), 1)

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]84)

$totalSheets = [math]::Ceiling($items.Count / $perSheet)
for ($s = 0; $s -lt $totalSheets; $s++) {
  $bmp = New-Object System.Drawing.Bitmap($sheetW, $sheetH)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.FillRectangle($bgBrush, 0, 0, $sheetW, $sheetH)

  $startIdx = $s * $perSheet
  $endIdx = [math]::Min($items.Count - 1, $startIdx + $perSheet - 1)

  for ($idx = $startIdx; $idx -le $endIdx; $idx++) {
    $local = $idx - $startIdx
    $col = $local % $cols
    $row = [math]::Floor($local / $cols)
    $x = $margin + $col * ($cellW + $margin)
    $y = $margin + $row * ($cellH + $margin)

    $item = $items[$idx]
    $g.FillRectangle($cardBrush, $x, $y, $cellW, $cellH)
    $g.DrawRectangle($borderPen, $x, $y, $cellW, $cellH)

    # Barra superior con estado
    $hdrBrush = $okBrush
    if ($item.severity -eq 'WARN') { $hdrBrush = $warnBrush }
    elseif ($item.severity -eq 'MISMATCH') { $hdrBrush = $errBrush }
    $g.FillRectangle($hdrBrush, $x, $y, $cellW, 26)

    $numStr = ('{0:D2}' -f [int]$item.index)
    $hdrText = "#$numStr [$($item.severity)] $($item.prefix) - $($item.title)"
    $hdrRect = New-Object System.Drawing.RectangleF(($x + 6), ($y + 4), ($cellW - 12), 20)
    $g.DrawString($hdrText, $fontHeader, $whiteBrush, $hdrRect)

    # Área de la fotografía (sin distorsión)
    $imgBoxX = $x + 8
    $imgBoxY = $y + 32
    $imgBoxW = $cellW - 16
    $imgBoxH = 242
    $g.FillRectangle($bgBrush, $imgBoxX, $imgBoxY, $imgBoxW, $imgBoxH)

    if ($item.localFile -and (Test-Path $item.localFile)) {
      try {
        $img = [System.Drawing.Image]::FromFile($item.localFile)
        $scale = [math]::Min($imgBoxW / $img.Width, $imgBoxH / $img.Height)
        $dw = [int]([math]::Round($img.Width * $scale))
        $dh = [int]([math]::Round($img.Height * $scale))
        $dx = $imgBoxX + [int](($imgBoxW - $dw) / 2)
        $dy = $imgBoxY + [int](($imgBoxH - $dh) / 2)
        $g.DrawImage($img, $dx, $dy, $dw, $dh)
        $img.Dispose()
      } catch {
        $errRect = New-Object System.Drawing.RectangleF($imgBoxX, ($imgBoxY + 90), $imgBoxW, 40)
        $g.DrawString('ERROR AL DECODIFICAR IMAGEN', $fontHeader, $errBrush, $errRect)
      }
    } else {
      $errRect = New-Object System.Drawing.RectangleF($imgBoxX, ($imgBoxY + 90), $imgBoxW, 40)
      $g.DrawString('IMAGEN FALTANTE', $fontHeader, $errBrush, $errRect)
    }

    # Texto narrado debajo de la foto
    $sayRect = New-Object System.Drawing.RectangleF(($x + 8), ($y + 280), ($cellW - 16), 80)
    $g.DrawString("VOZ: $($item.narration)", $fontBody, $textBrush, $sayRect)

    # Nombre de archivo al pie
    $fileRect = New-Object System.Drawing.RectangleF(($x + 8), ($y + 366), ($cellW - 16), 28)
    $g.DrawString("FILE: $($item.fileName)", $fontSmall, $mutedBrush, $fileRect)
  }

  $outFile = Join-Path $OutDir ("sheet_{0:D2}.jpg" -f ($s + 1))
  $bmp.Save($outFile, $jpegCodec, $encParams)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host "SHEET: $outFile"
}
