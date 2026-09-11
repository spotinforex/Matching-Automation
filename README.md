# YP <-> MCP Matching Automation

Automated matching of Young People (YPs) to Master Craft Persons (MCPs) for
the MCIPP apprenticeship program in Aba, Abia State — replacing a manual,
spreadsheet based matching process with a geocoding aware, distance based
matching pipeline that runs in minutes instead of hours.

Live service: https://matching-automation.vercel.app

## What it does

1. **Upload** two Excel files: one listing YPs (with address, landmark, and
   trade), one listing MCPs (with address, landmark, trade, and capacity).
2. **Geocode** every address to real coordinates using the Google Maps
   Geocoding API. If the address alone does not resolve, it automatically
   falls back to geocoding the nearby landmark instead.
3. **Match** each YP to the best available MCP using a priority-aware pipeline
   that considers PWD status, gender compatibility, trade compatibility,
   landmark proximity, remaining MCP capacity, and travel time.
4. **Expand outward** for anyone who cannot be matched within their own
   landmark: the matcher tries progressively farther landmarks (up to a
   configurable hop limit) before giving up.
5. **Deduplicate** imported records so repeated YP/MCP rows do not create
   duplicate match candidates, while still preserving rows with blank IDs by
   generating safe fallback IDs.
6. **Waitlist** anyone who still cannot be placed, with a clear reason
   recorded (for example no capacity in range, no compatible trade match, or
   address could not be geocoded at all).
7. **Export** the full result set — matches, waitlist, and a round by round
   summary — as a formatted `.xlsx` workbook with richer columns for gender,
   PWD, trade area, and trade type for both YPs and MCPs.
8. **Compare against manual matching**: upload a manually-matched reference
   sheet and get a drift/accuracy report — exact/equivalent/divergent counts,
   per-criterion compliance rates, and a full per-YP audit trail — then
   export that report as its own `.xlsx`.

## How matching works, in plain terms

- YPs and MCPs in the _same_ landmark (for example both near "Ariaria") are
  matched first, since that is the shortest and most convenient pairing.
- The matcher now applies a clear priority order so that PWD YPs are handled
  first, then women-first matching is preferred where applicable, and only
  then other candidates are considered.
- Trade compatibility is broader than a single exact label: the matcher
  recognizes garment, footwear, and leather-related categories, and uses the
  canonical trade type to judge whether a YP and MCP are compatible.
- If a YP's home landmark has no MCP with room and the right trade fit, the
  system checks the next nearest landmark, then the one after that, up to
  `hop_limit` hops away.
- Among tied options, MCPs with more remaining room are preferred, so
  capacity gets spread out rather than piling onto the very first available
  match.
- A hard MCP capacity cap is enforced during matching, so once an MCP reaches
  its maximum allowed placements it no longer receives additional matches.
- "Travel time" throughout the results is minutes of estimated driving time
  between the YP and the MCP, not a straight line distance.

## Authentication & access control

The app is internal-only — there is no self-signup. A super admin creates
every account, assigns it to a department, and gives it a role built from
four permission scopes:

| Scope            | Covers                                               |
| ---------------- | ---------------------------------------------------- |
| `run_match`      | `POST /match/run`, `GET /match/export`               |
| `evaluate`       | `POST /evaluation/compare`, `GET /evaluation/export` |
| `audit_logs`     | `GET /audit/logs`                                    |
| `endpoints_list` | `GET /endpoints`                                     |

A **super admin** account bypasses every scope check and is the only role
allowed to manage roles and users (`/admin/*`).

**Login is email + password only** — there's no username field.

**New accounts get a generated password**, emailed to them automatically,
and must change it on first login. Roles are named permission bundles
scoped to a department (e.g. "Matching Analyst" in Operations with
`run_match` + `evaluate`) — create as many as your departments need via
`POST /admin/roles`, then assign them to users via `POST /admin/users`.

See `auth_system/README.md` for full setup (env vars, first-super-admin
bootstrap, SMTP config) and the complete `/auth/*` and `/admin/*` endpoint
reference.

## API endpoints

| Method | Path                    | Auth / scope       | Description                                                                                                                                         |
| ------ | ----------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`               | Public             | Liveness check                                                                                                                                      |
| POST   | `/auth/login`           | Public             | Email + password → JWT                                                                                                                              |
| POST   | `/auth/change-password` | Any logged-in user | Set a new password (clears the forced-change flag)                                                                                                  |
| GET    | `/auth/me`              | Any logged-in user | Current user's identity, department, role, and permissions                                                                                          |
| POST   | `/admin/roles`          | Super admin        | Create a role (name, department, permission scopes)                                                                                                 |
| GET    | `/admin/roles`          | Super admin        | List all roles                                                                                                                                      |
| POST   | `/admin/users`          | Super admin        | Create a user; emails them a generated temp password                                                                                                |
| GET    | `/admin/users`          | Super admin        | List all users                                                                                                                                      |
| PATCH  | `/admin/users/{id}`     | Super admin        | Update a user's name, department, role, or active status                                                                                            |
| DELETE | `/admin/users/{id}`     | Super admin        | Delete a user (blocked for your own account or the last super admin)                                                                                |
| POST   | `/upload/yp`            | Any logged-in user | Upload the YP source `.xlsx`, parses and stores in memory                                                                                           |
| POST   | `/upload/mcp`           | Any logged-in user | Upload the MCP source `.xlsx`, parses and stores in memory                                                                                          |
| POST   | `/match/run`            | `run_match`        | Runs geocoding + matching end to end, returns results (accepts optional `HOP_LIMIT`, `MATCH_CAP`, and shortlist controls such as `SHORTLIST_LIMIT`) |
| GET    | `/match/export`         | `run_match`        | Downloads the last match run as a formatted `.xlsx`                                                                                                 |
| POST   | `/evaluation/compare`   | `evaluate`         | Compares the last match run against a manually-matched reference sheet                                                                              |
| GET    | `/evaluation/export`    | `evaluate`         | Downloads the last evaluation as a formatted `.xlsx`                                                                                                |
| GET    | `/audit/logs`           | `audit_logs`       | Lists audit events, with filters (`actor_email`, `actor_id`, `action`, `status`, `from_time`, `to_time`)                                            |
| GET    | `/endpoints`            | `endpoints_list`   | Lists every registered route and its methods                                                                                                        |

**Typical flow:** `POST /auth/login` → `POST /upload/yp` → `POST /upload/mcp`
→ `POST /match/run` → `GET /match/export`.

> **Note on state:** uploaded data and the last match result are still held
> in an in-memory dict on the server, not a database — this part hasn't
> changed. This means the app must run as a single worker/instance —
> restarting it, or scaling to more than one instance, clears the uploaded
> data. Swap this for a proper DB/session store before running this for
> multiple concurrent users. Users, roles, and audit logs, by contrast,
> **are** persisted in Postgres/Supabase (`DATABASE_URL`) and survive
> restarts.

Cloud Run injects its own `PORT` environment variable at runtime, which the
container respects automatically.

## Audit logging

Every logged action (`run_match`, `export_matches`, `compare_evaluation`,
`export_evaluation`, `upload_yp`, `upload_mcp`) now records **who** did it —
`actor_id`, `actor_email`, and `actor_name` — alongside the existing IP,
user agent, and action-specific metadata. `GET /audit/logs` can be filtered
by `actor_email` or `actor_id` to pull one person's history. Log entries
written before this change have `null` actor fields.

## Logging

The app logs to stdout (unbuffered) at each stage of the pipeline —
geocoding progress and failures, per round match counts, tie break
decisions, priority ordering, deduplication summaries, and timing for
geocoding vs. matching vs. export — to make it possible to see exactly
where time is being spent or where a run failed, without needing to
reproduce the issue locally. Set the log level in `main.py`'s
`logging.basicConfig(...)` call (currently `DEBUG`; drop to `INFO` to reduce
noise in production).
