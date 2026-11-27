# Sets the settings for the demonstration stack in this PowerShell window.
# Use it by "dot-sourcing": . .\scripts\demo\env.ps1   (note the dot and the space at the start)
# Change the values below only if your database is not on this machine's default port.
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$env:POSTGRES_DB       = "eg_demo"
$env:POSTGRES_USER     = "eg"
$env:POSTGRES_PASSWORD = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "local-demo-only" }
$env:POSTGRES_HOST     = "127.0.0.1"
$env:POSTGRES_PORT     = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { "5432" }
$env:DJANGO_DEBUG      = "true"
$env:DJANGO_SECRET_KEY = if ($env:DJANGO_SECRET_KEY) { $env:DJANGO_SECRET_KEY } else { "demo-only-secret-key-change-me-0123456789abcdef" }
$env:FRONTEND_ORIGIN   = "http://localhost:3382"
$env:SIMULATOR_ENABLED = "true"
$env:PRIVATE_MEDIA_ROOT = Join-Path (Split-Path -Parent $root) "demo-media"   # a folder next to the repository, never inside it
$env:DJANGO_API_ORIGIN = "http://127.0.0.1:8182"
# Optional: choose the staff password and observer PIN yourself (otherwise they are generated).
# $env:DEMO_STAFF_PASSWORD = "choose-a-long-password"
# $env:DEMO_OBSERVER_PIN   = "482913"
$env:DEMO_ROOT = $root
$python = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) { $python = "python" }
$env:DEMO_PYTHON = $python
Write-Host "Demo settings loaded. Database: $env:POSTGRES_DB on port $env:POSTGRES_PORT."
