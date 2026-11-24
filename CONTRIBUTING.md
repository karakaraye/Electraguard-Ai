# Contributing to ElectraGuard

## Branches and commits

Branch from the current `production-readiness` tip. Use a descriptive branch name and keep each pull request focused on one change. Write an imperative commit subject and add a short body when the reason needs context. Include verification results, changes to API behaviour, and any pending work in the pull request.

## Style and tests

Follow the nearby Django and TypeScript conventions. Keep permission checks close to the operation and preserve organisation scoping. Use fictional fixtures. From `backend/`, run `python manage.py migrate`, `python manage.py makemigrations --check`, and `python manage.py test` using an isolated database. From `frontend/`, use `npm ci`, `npm run lint`, `npm run typecheck`, and `npm run build`. Exercise affected flows in the running app.

## Secrets and dependencies

Keep secrets in the ignored local environment file or the deployment secret store. Use placeholders in examples. Keep backend requirements and the frontend lockfile current when a dependency changes. Explain new runtime dependencies in the pull request.

## Documentation and licence

Update the API contract for changes to requests, responses, errors, or privacy behaviour. Keep reproduction commands and supported environments accurate. Contributions follow the repository [licence](LICENSE). Preserve attribution and separate licence terms for bundled datasets.

## AI assistance

The team used AI coding assistants, and every change was reviewed, tested, and checked in the running app.
