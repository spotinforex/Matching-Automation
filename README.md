# YP <-> MCP Matching Automation

Automated matching of Young People (YPs) to Master Craft Persons (MCPs) for
the MCIPP apprenticeship program in Aba, Abia State — replacing a manual,
spreadsheet based matching process with a geocoding aware, distance based
matching pipeline that runs in minutes instead of hours.

Live service: https://matching-automation.vercel.app

## What it does

1. **Upload** two Excel files: one listing YPs (with address, landmark, and
   skill), one listing MCPs (with address, landmark, skill, and capacity).
2. **Geocode** every address to real coordinates using the Google Maps
   Geocoding API. If the address alone does not resolve, it automatically
   falls back to geocoding the nearby landmark instead.
3. **Match** each YP to the closest available MCP with matching skill and
   open capacity, using real driving travel time (via Google's Distance
   Matrix API) rather than straight line distance.
4. **Expand outward** for anyone who cannot be matched within their own
   landmark: the matcher tries progressively farther landmarks (up to a
   configurable hop limit) before giving up.
5. **Waitlist** anyone who still cannot be placed, with a clear reason
   recorded (no capacity in range, or address could not be geocoded at all).
6. **Export** the full result set — matches, waitlist, and a round by round
   summary — as a formatted `.xlsx` workbook.

## How matching works, in plain terms

- YPs and MCPs in the *same* landmark (e.g. both near "Ariaria") are matched
  first, since that is the shortest and most convenient pairing.
- If a YP's home landmark has no MCP with room and the right skill, the
  system checks the next nearest landmark, then the one after that, up to
  `hop_limit` hops away.
- Among tied options, MCPs with more remaining room are preferred, so
  capacity gets spread out rather than piling onto the very first available
  match.
- "Travel time" throughout the results is minutes of estimated driving time
  between the YP and the MCP, not a straight line distance.

## API endpoints

| Method | Path            | Description                                              |
|--------|------------------|------------------------------------------------------------|
| GET    | `/health`         | Liveness check                                              |
| POST   | `/upload/yp`       | Upload the YP source `.xlsx`, parses and stores in memory   |
| POST   | `/upload/mcp`      | Upload the MCP source `.xlsx`, parses and stores in memory  |
| POST   | `/match/run`        | Runs geocoding + matching end to end, returns results (accepts an optional `HOP_LIMIT` query param, default 3) |
| GET    | `/match/export`     | Downloads the last match run as a formatted `.xlsx`           |

**Typical flow:** `POST /upload/yp` → `POST /upload/mcp` → `POST /match/run`
→ `GET /match/export`.

> **Note on state:** uploaded data and the last match result are currently
> held in an in memory dict on the server, not a database. This means the
> app must run as a single worker/instance — restarting it, or scaling to
> more than one instance, clears the uploaded data. Swap this for a proper
> DB/session store before running this for multiple concurrent users.

Cloud Run injects its own `PORT` environment variable at runtime, which the
container respects automatically.

## Logging

The app logs to stdout (unbuffered) at each stage of the pipeline —
geocoding progress and failures, per round match counts, tie break
decisions, and timing for geocoding vs. matching vs. export — to make it
possible to see exactly where time is being spent or where a run failed,
without needing to reproduce the issue locally. Set the log level in
`main.py`'s `logging.basicConfig(...)` call (currently `DEBUG`; drop to
`INFO` to reduce noise in production).

## Known limitations / next steps

- In memory state (see note above) — needs a real datastore for multi user
  or multi instance use.
- No maximum travel time cutoff — a YP can currently be matched to an MCP
  even if the nearest available option is very far away, rather than being
  waitlisted with a "too far" reason.
- Geocoding is sequential per address, so a large batch with many cache
  misses can take a while; this is the main driver of total run time.