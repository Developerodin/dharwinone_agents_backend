$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Starting DharwinOne backend stack (Next-only)..."
Write-Host "  Next.js API   -> http://localhost:8787  (npm run dev:8787)"
Write-Host "  Telephony     -> http://localhost:8788"
Write-Host ""
Write-Host "  Python studio is deprecated — not started."
Write-Host "  Harness workers: TypeScript in-process + cloud LLM (set OPENAI_API_KEY)."
Write-Host "  Dev gate: npm run check:next"

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run dev:8787"
Start-Sleep -Seconds 1
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\telephony'; npm start"

Write-Host "Next.js + telephony launched in separate windows."
