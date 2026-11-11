# Windows.Media.Ocr 识别平面图文字（给出词 + 像素坐标）
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File tools\ocr_win.ps1 <png> [lang]
param([string]$Path, [string]$Lang = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
function Await($op, $type) {
  $m = $asTaskGeneric.MakeGenericMethod($type)
  $t = $m.Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

if ($Lang -ne '') {
  $language = New-Object Windows.Globalization.Language($Lang)
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
} else {
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}
if ($null -eq $engine) { Write-Output 'NO_ENGINE'; exit 1 }
Write-Output ("ENGINE " + $engine.RecognizerLanguage.LanguageTag + " " + $bitmap.PixelWidth + "x" + $bitmap.PixelHeight)
$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
foreach ($line in $result.Lines) {
  foreach ($w in $line.Words) {
    $r = $w.BoundingRect
    Write-Output ("{0:F0},{1:F0},{2:F0},{3:F0}`t{4}" -f $r.X, $r.Y, $r.Width, $r.Height, $w.Text)
  }
}
