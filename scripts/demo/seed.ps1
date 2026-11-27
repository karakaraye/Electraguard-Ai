# Loads the Kano reference list and builds the demonstration polling day. Safe to run again.
. "$PSScriptRoot\env.ps1"
Set-Location (Join-Path $env:DEMO_ROOT "backend")
& $env:DEMO_PYTHON manage.py migrate
& $env:DEMO_PYTHON manage.py load_reference_areas --file ../data/reference/official-synthetic-areas.json
& $env:DEMO_PYTHON manage.py seed_demo_day
