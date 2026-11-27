# Throws away everything in the demo database and builds a fresh polling day. Demo database only.
. "$PSScriptRoot\env.ps1"
Set-Location (Join-Path $env:DEMO_ROOT "backend")
Write-Host "This erases the database '$env:POSTGRES_DB' on port $env:POSTGRES_PORT."
$answer = Read-Host "Type YES to continue"
if ($answer -ne "YES") { exit 1 }
& $env:DEMO_PYTHON -c "import os, psycopg; c = psycopg.connect(host=os.environ['POSTGRES_HOST'], port=os.environ['POSTGRES_PORT'], user=os.environ['POSTGRES_USER'], password=os.environ['POSTGRES_PASSWORD'], dbname=os.environ['POSTGRES_DB'], autocommit=True); c.execute('DROP SCHEMA public CASCADE'); c.execute('CREATE SCHEMA public'); print('database emptied')"
Remove-Item -Force (Join-Path (Split-Path -Parent $env:DEMO_ROOT) "demo-signins.json") -ErrorAction SilentlyContinue
& "$PSScriptRoot\seed.ps1"
