# CLAUDE.md - Project Guide

## WHAT: Project Overview

Offline-first collaborative task management app. Users create/edit/delete tasks and comments while offline; changes sync bidirectionally when connectivity returns. Supports 5-50 users per org with ~10K tasks.

**Monorepo with two apps:**
- `backend/` — Django REST API (source of truth)
- `frontend/` — React SPA + PWA (offline-capable client)
- `doc/` — Architecture design documents (reference only, not code)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript 5.3, Vite 5, Tailwind CSS 3.4 |
| State/DB | Dexie 3 (IndexedDB), Zustand 4, React Query 5 |
| Backend | Django 5.0, Django REST Framework 3.14, Python 3.12 |
| Auth | JWT via SimpleJWT (access + refresh tokens) |
| Database | PostgreSQL (server), IndexedDB via Dexie (client) |
| Sync | Vector clocks, delta sync, 30s interval |
| Background | Celery 5.3 + Redis (cache, broker, pub/sub) |
| PWA | VitePWA plugin + custom service worker (`public/sw.js`) |
| Testing | Playwright (e2e), pytest + factory-boy (backend) |

## WHY: Purpose of Each Part

### Backend (`backend/`)
Three Django apps:

**`core/`** — Identity & multi-tenancy
- Models: Organization, User (custom AbstractBaseUser), Device, Project
- Custom JWT login that registers devices and returns device ID
- Permissions: IsOrganizationMember, IsOrganizationAdmin
- Middleware: request timing, device tracking, last-seen updates
- Management command: `create_test_data` for seeding

**`tasks/`** — Domain logic
- Models: Task, Comment, TaskHistory (immutable audit log)
- Tasks have: vector_clock, version (optimistic locking), checksum, soft delete
- Comments support threading (parent_id) and soft delete
- All mutations logged to TaskHistory automatically

**`sync/`** — Synchronization engine
- Models: SyncLog, Conflict, Tombstone
- Vector clock utilities: compare, merge, increment, detect conflicts
- Push endpoint: accepts batched changes, detects conflicts via clock comparison
- Pull endpoint: returns delta changes since timestamp + tombstones
- Conflict resolution: local wins, server wins, or custom merge
- Celery tasks: cleanup tombstones (90d), cleanup logs (30d), metrics

**`taskmanager/`** — Django project config (settings, urls, celery, wsgi)

### Frontend (`frontend/src/`)

**`services/`** — External communication
- `apiClient.ts` — Axios client with JWT interceptors, auto-refresh on 401, all API methods
- `syncManager.ts` — Singleton orchestrating pull-then-push sync cycle, conflict detection, status subscriptions

**`db/`** — Local persistence
- `index.ts` — Dexie schema (tasks, comments, sync_queue, device_info), hooks for auto-generating UUIDs/timestamps/vector clocks
- `repositories/TaskRepository.ts` — Task CRUD, filtering, live queries, sync integration, position management
- `repositories/CommentRepository.ts` — Comment CRUD, threading, live queries

**`hooks/`** — React business logic
- `useTasks.ts` — Task list/detail/mutations/stats/search with live Dexie queries
- `useComments.ts` — Comment list/threaded/mutations
- `useSync.ts` — Sync status, manual sync trigger, conflict management
- `useOnlineStatus.ts` — Network connectivity detection

**`components/`** — UI
- `LoginPage.tsx` — Auth form (test creds: user1@test.com / testpass123)
- `AuthenticatedApp.tsx` — Main layout: header, filters, task list, modals
- `TaskCard.tsx` — Task display with sync status indicators
- `TaskListDraggable.tsx` — Drag-and-drop ordering (@dnd-kit)
- `TaskListVirtualized.tsx` — Virtual scroll for large lists (@tanstack/react-virtual)
- `TaskDetail.tsx` — Full task view + comments
- `TaskForm.tsx` — Create/edit form
- `TaskFilters.tsx` — Filter sidebar
- `CommentSection.tsx` — Threaded comments
- `SyncStatusIndicator.tsx` — Sync status in header
- `OfflineIndicator.tsx` — Yellow offline banner
- `ConflictResolver.tsx` — Conflict resolution modal

**`types/index.ts`** — All TypeScript interfaces (Task, Comment, SyncQueueEntry, etc.)

**`utils/`** — Helpers (date formatting, fractional indexing for drag-drop)

**`App.tsx`** — Auth routing: checks JWT → shows LoginPage or AuthenticatedApp

## Project Structure Map

```
backend/
  core/
    models.py          # Organization, User, Device, Project
    views.py           # ViewSets + CustomTokenObtainPairView
    serializers.py     # All core serializers
    permissions.py     # IsOrganizationMember, IsOrganizationAdmin
    middleware.py      # RequestTiming, DeviceTracking, LastSeen
    urls/auth.py       # /api/auth/login/, /api/auth/refresh/
  tasks/
    models.py          # Task, Comment, TaskHistory
    views.py           # TaskViewSet, CommentViewSet
    serializers.py     # Task/Comment serializers
    urls.py            # /api/tasks/, /api/comments/
  sync/
    models.py          # SyncLog, Conflict, Tombstone
    views.py           # sync_push, sync_pull, ConflictViewSet
    serializers.py     # Sync request/response serializers
    utils.py           # Vector clock operations
    tasks.py           # Celery cleanup/metrics tasks
    urls.py            # /api/sync/push/, /api/sync/pull/, /api/sync/conflicts/
  taskmanager/
    settings.py        # All Django config
    urls.py            # Root URL routing
    celery.py          # Celery app setup
  requirements.txt
  manage.py

frontend/
  public/
    sw.js              # Service worker (caching, background sync)
    manifest.json      # PWA manifest
  src/
    main.tsx           # Entry point + SW registration
    App.tsx            # Auth routing
    types/index.ts     # All TypeScript types
    services/
      apiClient.ts     # Axios + JWT + all API methods
      syncManager.ts   # Sync orchestrator singleton
    db/
      index.ts         # Dexie schema + device ID management
      repositories/
        TaskRepository.ts
        CommentRepository.ts
    hooks/
      useTasks.ts, useComments.ts, useSync.ts, useOnlineStatus.ts
    components/
      LoginPage.tsx, AuthenticatedApp.tsx, TaskCard.tsx,
      TaskDetail.tsx, TaskForm.tsx, TaskFilters.tsx,
      TaskListDraggable.tsx, TaskListVirtualized.tsx,
      CommentSection.tsx, SyncStatusIndicator.tsx,
      OfflineIndicator.tsx, ConflictResolver.tsx
    utils/
      dateFormat.ts, fractionalIndexing.ts
  e2e/                 # Playwright tests
  package.json
  vite.config.ts
  tsconfig.json
  tailwind.config.js
  playwright.config.ts
```

## HOW: Working on This Project

### Running the Backend

```bash
cd backend
source venv/bin/activate
python manage.py runserver              # http://localhost:8000
python manage.py create_test_data       # Seed test data
python manage.py cleanup_sync_data      # Manual cleanup
python manage.py migrate                # Run migrations
```

Requires: PostgreSQL running, `.env` configured (DB_NAME, DB_USER, DB_PASSWORD, SECRET_KEY, etc.)

### Running the Frontend

```bash
cd frontend
npm run dev                             # http://localhost:3000
npm run build                           # Production build (tsc && vite build)
npm run preview                         # Preview production build
```

### Running Tests

```bash
# E2E tests (requires both backend and frontend running)
cd frontend
npx playwright test e2e/ --reporter=list

# Backend tests
cd backend
source venv/bin/activate
pytest
```

### Verifying Changes

1. **TypeScript**: `cd frontend && npx tsc --noEmit` (strict mode)
2. **Lint**: `cd frontend && npm run lint`
3. **Build**: `cd frontend && npm run build`
4. **Backend**: `cd backend && python manage.py check`
5. **E2E**: `cd frontend && npx playwright test e2e/ --reporter=list`

### API Endpoints Quick Reference

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/auth/login/ | Login (returns JWT + device) |
| POST | /api/auth/refresh/ | Refresh access token |
| GET | /api/tasks/ | List tasks (paginated) |
| POST | /api/tasks/ | Create task |
| PATCH | /api/tasks/:id/ | Update task |
| DELETE | /api/tasks/:id/ | Soft delete task |
| GET | /api/tasks/:id/history/ | Task audit trail |
| GET | /api/comments/?task=:id | List comments for task |
| POST | /api/comments/ | Create comment |
| PATCH | /api/comments/:id/ | Update comment |
| DELETE | /api/comments/:id/ | Soft delete comment |
| POST | /api/sync/push/ | Push local changes to server |
| GET | /api/sync/pull/?since=:ts | Pull changes since timestamp |
| GET | /api/sync/conflicts/ | List unresolved conflicts |
| POST | /api/sync/conflicts/:id/resolve/ | Resolve a conflict |
| GET | /api/docs/ | Swagger API documentation |

### API Response Pattern

All list endpoints return paginated responses:
```json
{ "count": 42, "next": "url", "previous": "url", "results": [...] }
```
Always use `.results` to get the array.

### Custom Headers

- `Authorization: Bearer <access_token>` — JWT auth
- `X-Device-ID: <uuid>` — Device identifier for sync
- `X-Client-Version: <string>` — Client version

### Key Constants

- Sync interval: 30 seconds
- Sync batch size: 100
- Tombstone expiry: 90 days
- JWT access token lifetime: 24 hours
- JWT refresh token lifetime: 7 days
- API pagination default: 50 items

### Data Flow (Offline-First)

```
User action → Hook (useTasks) → Repository → Dexie (IndexedDB)
  → sync_queue entry → [30s or manual] → syncManager.sync()
  → Phase 1: pullFromServer (GET /api/sync/pull/)
  → Phase 2: pushToServer (POST /api/sync/push/)
  → Conflicts detected → ConflictResolver UI or auto-resolve
```

### Auth Flow

```
Login → POST /api/auth/login/ {email, password, deviceFingerprint}
  → Response: {access, refresh, user, device}
  → Store tokens in localStorage
  → Set server device ID in IndexedDB
  → Initialize SyncManager → start periodic sync
```

## Implementation Status (What's Built vs Designed-Only)

See `doc/OFFLINE_FIRST_AUDIT.md` for full audit details.

**Built and working:**
- Offline CRUD (tasks + comments) with IndexedDB-first writes
- Sync queue, periodic sync (30s), auto-sync on reconnect
- Vector clock conflict detection (frontend + backend)
- Manual conflict resolution UI (local/server/custom)
- Delta sync with pagination, batch push
- Tombstones + soft deletes, audit trail (TaskHistory)
- JWT auth with auto-refresh, device tracking
- PWA with service worker caching

**Designed in docs but NOT implemented:**
- Operational Transformation (text merge) — zero code
- Auto-conflict resolution (higher-priority-wins, union merge, etc.) — zero code
- WebSocket real-time updates — no Django Channels
- Rate limiting on sync endpoints — no throttle classes
- Attachments/file sync — no frontend model or upload code
- End-to-end encryption — no Web Crypto API usage
- Status transition validation — placeholder `pass` in serializer
- Storage quota handling — no quota checks
- Push notifications — SW handler exists but no backend sender

## Known Issues & Gotchas

1. **API responses are paginated** — use `response.data.results`, not `response.data`
2. **Serializer read_only_fields** — server-set fields (vector_clock, last_modified_by, last_modified_device) must be in `read_only_fields` or DRF validates them as required input
3. **Service worker context** — `self.registration` only exists inside SW, not in browser window; check inside `navigator.serviceWorker.ready.then()`
4. **Auth state** — managed by React state in App.tsx, not a router; don't do hard redirects on 401
5. **All models use UUID primary keys** and soft deletes (deleted_at)
6. **Custom user model** — `AUTH_USER_MODEL = 'core.User'`, email-based login
7. **Path alias** — Frontend uses `@/` → `src/` (configured in vite.config.ts and tsconfig.json)
8. **Test credentials** — user1@test.com / testpass123 (after running create_test_data)
