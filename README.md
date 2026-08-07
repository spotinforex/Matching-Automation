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

## How matching works, in plain terms

- YPs and MCPs in the *same* landmark (for example both near "Ariaria") are
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

## API endpoints

| Method | Path            | Description                                              |
|--------|------------------|------------------------------------------------------------|
| GET    | `/health`         | Liveness check                                              |
| POST   | `/upload/yp`       | Upload the YP source `.xlsx`, parses and stores in memory   |
| POST   | `/upload/mcp`      | Upload the MCP source `.xlsx`, parses and stores in memory  |
| POST   | `/match/run`        | Runs geocoding + matching end to end, returns results (accepts optional `HOP_LIMIT`, `MATCH_CAP`, and shortlist controls such as `SHORTLIST_LIMIT`) |
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
decisions, priority ordering, deduplication summaries, and timing for
geocoding vs. matching vs. export — to make it possible to see exactly
where time is being spent or where a run failed, without needing to
reproduce the issue locally. Set the log level in `main.py`'s
`logging.basicConfig(...)` call (currently `DEBUG`; drop to `INFO` to reduce
noise in production).

