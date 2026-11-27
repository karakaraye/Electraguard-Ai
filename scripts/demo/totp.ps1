# Prints the current six-digit sign-in code for a demo staff account.  Example:
#   .\scripts\demo\totp.ps1 coordinator.ngozi@demo.electraguard.test
param([Parameter(Mandatory = $true)][string]$Email)
. "$PSScriptRoot\env.ps1" | Out-Null
Set-Location (Join-Path $env:DEMO_ROOT "backend")
& $env:DEMO_PYTHON manage.py demo_totp $Email
