# fetch-fonts.ps1
# Extrait la police Adobe Clean (© Adobe Inc.) depuis OneDrive vers public/fonts/.
# La police est volontairement HORS du depot Git (IP Adobe). A lancer apres un clone.
$ErrorActionPreference = "Stop"
$zip = "$env:OneDrive\Studio - Studio_2026\Video\Director Mode - Camera mode Prototype\Fonts\adobe_clean.zip"
$dst = Join-Path $PSScriptRoot "..\public\fonts"
$weights = @("AdobeClean-Regular.otf", "AdobeClean-Medium.otf", "AdobeClean-Bold.otf")

if (-not (Test-Path $zip)) {
  Write-Host "Source introuvable : $zip" -ForegroundColor Red
  Write-Host "OneDrive n'est peut-etre pas synchronise sur cette machine."
  Write-Host "Place manuellement dans public/fonts/ : $($weights -join ', ')"
  exit 1
}
New-Item -ItemType Directory -Force $dst | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
try {
  foreach ($w in $weights) {
    $entry = $archive.Entries | Where-Object { $_.Name -eq $w } | Select-Object -First 1
    if ($null -eq $entry) { Write-Host "Manquant dans le zip : $w" -ForegroundColor Yellow; continue }
    $out = Join-Path $dst $w
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $out, $true)
  }
} finally { $archive.Dispose() }
Write-Host "Police Adobe Clean copiee dans public/fonts/" -ForegroundColor Green
