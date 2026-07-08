$ErrorActionPreference = "Stop"
$BackendRoot = Split-Path -Parent $PSScriptRoot
Set-Location $BackendRoot
Write-Host "[studio] Backend root: $BackendRoot"

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "[studio] Creating virtualenv..."
    python -m venv .venv
}

Write-Host "[studio] Installing editable package + dependencies..."
& ".\.venv\Scripts\pip.exe" install -e ".[dev]"

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "[studio] Created .env from .env.example"
}

Write-Host ""
Write-Host "[studio] Setup complete. Start the API with:"
Write-Host "  backend\start.bat"
Write-Host "or:"
Write-Host "  backend\.venv\Scripts\python -m studio"
