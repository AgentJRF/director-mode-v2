# fetch-asset.ps1
# Copie l'asset packshot (© Adobe Inc.) depuis OneDrive vers public/asset/.
# L'asset est volontairement HORS du dépôt Git (IP Adobe). À lancer après un clone.
$ErrorActionPreference = "Stop"
$src = "$env:OneDrive\Studio - Studio_2026\Video\Director Mode - Camera mode Prototype\Main Asset"
$dst = Join-Path $PSScriptRoot "..\public\asset"

if (-not (Test-Path $src)) {
  Write-Host "Source introuvable : $src" -ForegroundColor Red
  Write-Host "OneDrive n'est peut-etre pas synchronise sur cette machine."
  Write-Host "Place manuellement dans public/asset/ : studio_packshot.gltf, studio_packshot_binary.bin, studio_packshot_images/"
  exit 1
}
New-Item -ItemType Directory -Force "$dst\studio_packshot_images" | Out-Null
Copy-Item "$src\studio_packshot.gltf" "$dst\" -Force
Copy-Item "$src\studio_packshot_binary.bin" "$dst\" -Force
Copy-Item "$src\studio_packshot_images\*" "$dst\studio_packshot_images\" -Force
Write-Host "Asset copie dans public/asset/" -ForegroundColor Green
