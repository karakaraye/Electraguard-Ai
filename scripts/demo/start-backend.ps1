# Starts the demo backend on http://127.0.0.1:8182 (leave this window open).
. "$PSScriptRoot\env.ps1"
New-Item -ItemType Directory -Force $env:PRIVATE_MEDIA_ROOT | Out-Null
Set-Location (Join-Path $env:DEMO_ROOT "backend")
& $env:DEMO_PYTHON manage.py migrate
& $env:DEMO_PYTHON manage.py runserver 127.0.0.1:8182 --noreload
