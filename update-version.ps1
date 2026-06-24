# update-version.ps1 - Atualiza a versao PWA do projeto Educ Academico
# Gera versao no formato: YYYY.MM.DD.HH (data/hora atual)

$date = Get-Date
$version = "{0}.{1:D2}.{2:D2}.{3:D2}" -f $date.Year, $date.Month, $date.Day, $date.Hour

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Atualizar sw.js
$swPath = Join-Path $projectRoot "sw.js"
if (Test-Path $swPath) {
    $content = Get-Content $swPath -Raw
    $content = $content -replace 'const APP_VERSION = "[^"]*"', "const APP_VERSION = `"$version`""
    Set-Content $swPath -Value $content -NoNewline
    Write-Host "sw.js atualizado para versao: $version" -ForegroundColor Green
}

# Atualizar index.html
$htmlPath = Join-Path $projectRoot "index.html"
if (Test-Path $htmlPath) {
    $content = Get-Content $htmlPath -Raw
    # Atualizar window.EDUC_APP_VERSION
    $content = $content -replace 'window\.EDUC_APP_VERSION = "[^"]*"', "window.EDUC_APP_VERSION = `"$version`""
    # Atualizar todos os ?v= nos links e scripts
    $content = $content -replace '\?v=[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+', "?v=$version"
    Set-Content $htmlPath -Value $content -NoNewline
    Write-Host "index.html atualizado para versao: $version" -ForegroundColor Green
}

Write-Host ""
Write-Host "Versao PWA atualizada: $version" -ForegroundColor Cyan
