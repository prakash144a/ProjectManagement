# Phase 1 Task Product

This repository now contains a runnable Phase 1 implementation from `docs/ai-native-task-management-architecture.md`.

Phase 1 covers:

- Auth foundation through workspace-scoped demo identity, users, memberships, roles, organizations, workspaces, and teams.
- Projects, tasks, task detail, comments, and URL-based attachments.
- List and board task views.
- Workspace search across tasks and projects.
- Notifications for assignment and comments.
- Billing foundation with subscription state and a mock checkout intent.

The implementation intentionally uses only the Python standard library so it runs in this empty repo without dependency installation. The API boundaries are shaped so FastAPI, managed auth, Stripe, and PostgreSQL can replace the local HTTP server, demo identity, mock billing, and SQLite persistence later.

## Run

```bash
python3 -m pm_app.server --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000`.

The app creates `pm_phase1.sqlite3` with seeded demo data on first run.

## Test

```bash
python3 -m unittest discover -s tests
```

## API Snapshot

- `GET /api/session`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/{id}`
- `PATCH /api/tasks/{id}`
- `POST /api/tasks/{id}/comments`
- `POST /api/tasks/{id}/attachments`
- `GET /api/search?q=...`
- `GET /api/notifications`
- `PATCH /api/notifications/{id}`
- `GET /api/billing/account`
- `POST /api/billing/checkout-intent`

