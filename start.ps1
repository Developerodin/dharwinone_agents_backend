$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "[studio] Run backend\scripts\setup.ps1 first to create .venv and .env"
    exit 1
}
& ".\.venv\Scripts\python.exe" -m studio
