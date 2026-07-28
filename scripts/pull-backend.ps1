# Sync backend/ from the agents backend GitHub repo (remote: backend -> dharwinone_agents_backend).
# backend/ is part of the DharwinOne monorepo; there is no nested .git here.
# Do NOT run: git pull backend main  (unrelated histories vs monorepo main).

param(
    [switch]$Stage
)

$ErrorActionPreference = 'Stop'

$Root = (git rev-parse --show-toplevel 2>$null).Trim()
if (-not $Root) {
    Write-Error 'Run this from inside the DharwinOne repository (e.g. cd backend).'
    exit 1
}

Set-Location $Root

$BackendDir = Join-Path $Root 'backend'
if (-not (Test-Path -LiteralPath $BackendDir -PathType Container)) {
    Write-Error "Expected directory: $BackendDir"
    exit 1
}

Write-Host 'Fetching remote backend...'
git fetch backend
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$RemoteRef = 'backend/main'
$Short = (git rev-parse --short $RemoteRef).Trim()
git branch -f backend-main $RemoteRef | Out-Null

$ZipPath = Join-Path $env:TEMP ("dharwin-backend-sync-{0}.zip" -f [guid]::NewGuid().ToString('n'))
try {
    Write-Host "Updating backend/ from $RemoteRef ($Short)..."
    git archive --format=zip -o $ZipPath $RemoteRef
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Expand-Archive -Path $ZipPath -DestinationPath $BackendDir -Force
} finally {
    if (Test-Path -LiteralPath $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }
}

Write-Host "Done. backend/ now matches $RemoteRef ($Short)."
Write-Host 'Ignored paths (.venv, .env, data/) are unchanged; deleted-upstream files may remain until you remove them.'
Write-Host 'To commit on monorepo main: git add backend && git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>" -m "chore(backend): sync from agents backend"'

if ($Stage) {
    git add backend/
    Write-Host 'Staged changes under backend/.'
}
