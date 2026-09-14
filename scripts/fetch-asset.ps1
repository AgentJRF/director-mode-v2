# fetch-asset.ps1
# Copie l'asset produit (© Adobe Inc.) depuis OneDrive vers public/asset/.
# NOTE: le glb est desormais committe dans le depot, donc ce script n'est en general PAS necessaire.
# Il ne sert qu'a re-copier une version a jour de l'asset depuis OneDrive si besoin.
$ErrorActionPreference = "Stop"
$asset = "Outdoor_Bag_Blue_orange_V03.glb"
$src = "$env:OneDrive\Studio - Studio_2026\Video\Director Mode - Camera mode Prototype\Main Asset"
$dst = Join-Path $PSScriptRoot "..\public\asset"

if (-not (Test-Path "$src\$asset")) {
  Write-Host "Source introuvable : $src\$asset" -ForegroundColor Red
  Write-Host "OneDrive n'est peut-etre pas synchronise. L'asset est normalement deja dans public/asset/ (committe)."
  exit 1
}
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item "$src\$asset" "$dst\" -Force
Write-Host "Asset copie dans public/asset/$asset" -ForegroundColor Green
