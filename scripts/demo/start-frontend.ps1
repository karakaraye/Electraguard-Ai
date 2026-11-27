# Builds (first time only) and starts the demo site on http://localhost:3382 (leave this window open).
. "$PSScriptRoot\env.ps1"
Set-Location (Join-Path $env:DEMO_ROOT "frontend")
if (-not (Test-Path ".next\BUILD_ID")) { node node_modules/next/dist/bin/next build --webpack }
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3382
