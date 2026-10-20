"""
main.py

FastAPI wrapper around the YP <-> MCP matching pipeline, now with auth.

Endpoints:
    POST /upload/yp          - upload the YP source .xlsx, parses & stores in memory
    POST /upload/mcp         - upload the MCP source .xlsx, parses & stores in memory
    POST /match/run          - runs geocoding + matching end-to-end, returns results   [run_match]
    GET  /match/export       - download the last match run as a formatted .xlsx        [run_match]
    GET  /match/runs         - list past match runs (summaries only)                   [run_match]
    GET  /match/runs/{id}    - view one past match run in full                         [run_match]
    GET  /match/runs/{id}/export - redownload a past match run as .xlsx                [run_match]
    POST /evaluation/compare - compares the last match run against a manual sheet       [evaluate]
    GET  /evaluation/export  - download the last evaluation as a formatted .xlsx        [evaluate]
    GET  /audit/logs         - list audit events                                        [audit_logs]
    GET  /endpoints          - list all registered endpoints                            [endpoints_list]
    GET  /health             - liveness check (public)
    /auth/*                  - login, change-password, me
    /admin/*                 - super-admin only: manage roles and users

Plug in your real geocoding/travel-time implementation in distance_service.py
(GoogleMapsDistanceService) and set it below where DISTANCE_SERVICE is built.
"""

import json
import os
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import Depends, FastAPI, UploadFile, File, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from utils.data_loader import load_yps, load_mcps
from logic.services import (  # noqa: F401
    HaversineDistanceService,
    GoogleMapsDistanceService,
    resolve_state,
)
from logic.cached_distance_service import CachedDistanceService
from utils.excel_export import build_results_workbook
from utils.evaluation import compare_matches, load_manual_matches, write_evaluation_workbook
from logic.landmark import build_landmark_order
from logic.matcher import Matcher
from configs.schemas import MatchRunResponse, MatchResult, WaitlistEntry
from utils.audit_log import ensure_audit_log_table, get_audit_logs, log_action
from utils.match_run_store import (
    ensure_match_runs_table,
    save_match_run,
    list_match_runs,
    get_match_run,
)
from utils.match_run_export import build_match_run_workbook
from dotenv import load_dotenv
import logging

# --- auth imports ---
from auth_system.dependencies import require_permission, get_current_user
from auth_system.routers.auth_router import router as auth_router
from auth_system.routers.admin_router import router as admin_router

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI(title="Matching Automation")

_default_dev_origins = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"
_allowed_origins_raw = os.environ.get("ALLOWED_ORIGINS", _default_dev_origins)
ALLOWED_ORIGINS = [origin.strip() for origin in _allowed_origins_raw.split(",") if origin.strip()]

if "ALLOWED_ORIGINS" not in os.environ:
    logger.warning(
        "ALLOWED_ORIGINS not set — defaulting CORS to local dev origins %s. "
        "Set ALLOWED_ORIGINS before deploying.",
        ALLOWED_ORIGINS,
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-memory app state (swap for a DB/session store for multi-user/production use)
# ---------------------------------------------------------------------------

state = {
    "yps": None,
    "mcps": None,
    "last_result": None,
    "last_evaluation": None,
    "distance_service": None,  # the service (i.e. state scope) used by the last /match/run
}

_google_api_key = os.environ.get("GOOGLE_API_KEY")
_database_url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
if not _database_url:
    raise RuntimeError(
        "DATABASE_URL (or SUPABASE_DB_URL) is required — auth, audit logs, the "
        "distance cache, and match run history all depend on it now."
    )
ensure_audit_log_table(_database_url)
try:
    ensure_match_runs_table(_database_url)
except RuntimeError as e:
    # Fail fast and clearly at startup rather than let every later call to
    # save/list/get a match run blow up with a confusing "relation
    # match_runs does not exist" deep in a request.
    raise RuntimeError(f"Startup failed: {e}") from e

# --- make DATABASE_URL discoverable to auth dependencies via app.state ---
app.state.database_url = _database_url

# --- mount auth + admin routers ---
app.include_router(auth_router)
app.include_router(admin_router)

# Geographic scope used when /match/run is called without a STATE param.
# Defaults keep the original Aba, Abia State behavior. Set DEFAULT_STATE=any
# to default to "no state filter", or DEFAULT_STATE=Lagos (etc.) to move the
# default; DEFAULT_CITY only sharpens the address hint, it is never a filter.
try:
    DEFAULT_STATE = resolve_state(os.environ.get("DEFAULT_STATE", "Abia"))
except ValueError as e:
    raise RuntimeError(f"Invalid DEFAULT_STATE env var: {e}") from e
DEFAULT_CITY = (os.environ.get("DEFAULT_CITY", "Aba") or "").strip() or None

if not _google_api_key:
    logger.warning(
        "GOOGLE_API_KEY not set — falling back to the offline "
        "Haversine estimate. Real matches will be inaccurate until this is set."
    )

# One distance service per (state, city) scope, built lazily and reused, so
# each scope keeps its own in-memory geocode/travel-time caches across runs.
# A service's scope is fixed at construction (never mutated), which keeps
# concurrent requests for different states from stepping on each other.
_distance_services: dict = {}


def get_distance_service(state_name: str | None, city: str | None = None):
    key = (state_name, city)
    if key not in _distance_services:
        if _google_api_key:
            real = GoogleMapsDistanceService(api_key=_google_api_key, state=state_name, city_hint=city)
            _distance_services[key] = CachedDistanceService(real, database_url=_database_url)
            logger.info(
                "Using GoogleMapsDistanceService (state=%s, city=%s) with a Postgres-backed cache.",
                state_name or "any", city,
            )
        else:
            _distance_services[key] = HaversineDistanceService(coordinate_lookup={})
    return _distance_services[key]


# Default-scope service; also the fallback for evaluation when no run has happened yet.
DISTANCE_SERVICE = get_distance_service(DEFAULT_STATE, DEFAULT_CITY)


@app.get("/health")
def health():
    return {"status": "ok"}


# --- Matches auth_system.dependencies.require_super_admin: user records
# carry a boolean is_super_admin flag. A super admin sees every user's
# match runs; everyone else sees only their own. ---
def _is_super_admin(current_user: dict) -> bool:
    return bool(current_user.get("is_super_admin"))


# --- endpoints_list scope — lists every registered route ---
@app.get("/endpoints", dependencies=[Depends(require_permission("endpoints_list"))])
def list_endpoints():
    return sorted(
        [
            {"path": route.path, "methods": sorted(route.methods - {"HEAD", "OPTIONS"})}
            for route in app.routes
            if hasattr(route, "methods")
        ],
        key=lambda r: r["path"],
    )


# --- audit_logs scope required; actor + actor_email filters added ---
@app.get("/audit/logs")
def read_audit_logs(
    from_time: datetime | None = Query(None, description="Include events at or after this ISO-8601 time"),
    to_time: datetime | None = Query(None, description="Include events at or before this ISO-8601 time"),
    action: str | None = Query(None, description="Filter by audit action, for example run_match"),
    event_type: str | None = Query(None, alias="type", description="Alias for action"),
    status: str | None = Query(None, description="Filter by status, for example success"),
    actor_id: int | None = Query(None, description="Filter by the numeric id of the user who performed the action"),
    actor_email: str | None = Query(None, description="Filter by the email of the user who performed the action"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_permission("audit_logs")),
):
    if from_time and to_time and from_time > to_time:
        raise HTTPException(400, "from_time must be earlier than or equal to to_time")
    if action and event_type and action != event_type:
        raise HTTPException(400, "Use either action or type, not conflicting values for both")

    try:
        logs, total = get_audit_logs(
            _database_url,
            from_time=from_time, to_time=to_time,
            action=action or event_type, status=status,
            actor_id=actor_id, actor_email=actor_email,
            limit=limit, offset=offset,
        )
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error

    return {"items": logs, "total": total, "limit": limit, "offset": offset}


@app.post("/upload/yp")
async def upload_yp(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Expected an Excel file (.xlsx/.xls)")
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    try:
        yps = load_yps(tmp_path)
    except ValueError as e:
        raise HTTPException(400, str(e))
    finally:
        Path(tmp_path).unlink(missing_ok=True)
    state["yps"] = yps
    log_action(
        _database_url, action="upload_yp", endpoint="POST /upload/yp",
        actor_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        actor_id=current_user["id"], actor_email=current_user["email"],
        actor_name=current_user.get("full_name"),
        metadata={"filename": file.filename, "record_count": len(yps)},
    )
    return {"loaded": len(yps)}


@app.post("/upload/mcp")
async def upload_mcp(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Expected an Excel file (.xlsx/.xls)")
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    try:
        mcps = load_mcps(tmp_path)
    except ValueError as e:
        raise HTTPException(400, str(e))
    finally:
        Path(tmp_path).unlink(missing_ok=True)
    state["mcps"] = mcps
    log_action(
        _database_url, action="upload_mcp", endpoint="POST /upload/mcp",
        actor_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        actor_id=current_user["id"], actor_email=current_user["email"],
        actor_name=current_user.get("full_name"),
        metadata={"filename": file.filename, "record_count": len(mcps)},
    )
    return {"loaded": len(mcps)}


# --- run_match scope required; actor captured for audit log.
# Every run is now also persisted to the match_runs table (see
# utils/match_run_store.py) so it can be listed/reopened later via
# GET /match/runs and GET /match/runs/{id} — independent of in-memory
# `state`, which only ever holds the most recent run and is lost on
# restart. The new row's id is returned in the X-Match-Run-Id response
# header; it isn't added to the MatchRunResponse body itself, since that
# model is shared with other callers and changing its shape belongs in
# configs/schemas.py as a deliberate edit (add `run_id: int | None = None`
# there if you want it in the JSON body too).
@app.post("/match/run", response_model=MatchRunResponse)
def run_match(
    request: Request,
    response: Response,
    HOP_LIMIT: int = 3,
    MATCH_CAP: int | None = None,
    SHORTLIST_SIZE: int = 10,
    STATE: str | None = Query(
        None,
        description=(
            "Restrict geocoding to one Nigerian state (e.g. Lagos, Akwa Ibom, FCT) "
            "with a hard Google filter, or 'any' for no state filter. "
            "Omit to use the server default (DEFAULT_STATE, Abia unless configured)."
        ),
    ),
    CITY: str | None = Query(
        None,
        description="Optional city hint to sharpen short addresses (never a hard filter). Ignored when STATE is omitted.",
    ),
    current_user: dict = Depends(require_permission("run_match")),
):
    if not state["yps"]:
        raise HTTPException(400, "No YP data loaded — call /upload/yp first")
    if not state["mcps"]:
        raise HTTPException(400, "No MCP data loaded — call /upload/mcp first")

    # Resolve the geographic scope for this run. STATE omitted -> server
    # defaults (state + city). STATE given -> exactly what was asked for;
    # "any" (or none/open/all/blank) means no state filter at all.
    if STATE is None:
        scope_state, scope_city = DEFAULT_STATE, DEFAULT_CITY
    else:
        try:
            scope_state = resolve_state(STATE)
        except ValueError as e:
            raise HTTPException(400, str(e))
        scope_city = (CITY or "").strip() or None

    distance_service = get_distance_service(scope_state, scope_city)
    state["distance_service"] = distance_service

    matcher = Matcher(distance_service)
    matcher.geocode_missing(state["yps"], state["mcps"])
    landmark_order = build_landmark_order(state["yps"] + state["mcps"], distance_service)

    result = matcher.run(
        state["yps"], state["mcps"], landmark_order,
        hop_limit=HOP_LIMIT, match_cap=MATCH_CAP, shortlist_size=SHORTLIST_SIZE,
    )

    matches = [MatchResult(**m) for m in result["matches"]]
    waitlist = [WaitlistEntry(**w) for w in result["waitlist"]]

    match_response = MatchRunResponse(
        matches=matches, waitlist=waitlist,
        matched_count=len(matches), waitlisted_count=len(waitlist),
    )
    state["last_result"] = match_response
    state["last_evaluation"] = None

    # The matching itself already succeeded at this point — don't throw that
    # work away just because persisting it hit a DB error. Log it, leave the
    # X-Match-Run-Id header off, and still return the match result.
    run_id = None
    try:
        run_id = save_match_run(
            _database_url,
            actor_id=current_user["id"],
            actor_email=current_user["email"],
            actor_name=current_user.get("full_name"),
            hop_limit=HOP_LIMIT,
            match_cap=MATCH_CAP,
            shortlist_size=SHORTLIST_SIZE,
            matches=result["matches"],
            waitlist=result["waitlist"],
            dropped_mcps=result["dropped_mcps"],
        )
        response.headers["X-Match-Run-Id"] = str(run_id)
    except RuntimeError:
        logger.exception("run_match() matched successfully but could not save the run to history")

    log_action(
        _database_url, action="run_match", endpoint="POST /match/run",
        actor_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        actor_id=current_user["id"], actor_email=current_user["email"],
        actor_name=current_user.get("full_name"),
        metadata={
            "hop_limit": HOP_LIMIT, "match_cap": MATCH_CAP, "shortlist_size": SHORTLIST_SIZE,
            "state": scope_state or "any", "city": scope_city,
            "matched_count": len(matches), "waitlisted_count": len(waitlist),
            "match_run_id": run_id,
        },
    )
    return match_response


# --- run_match scope required (exporting a match run); actor captured ---
@app.get("/match/export")
def export_results(request: Request, current_user: dict = Depends(require_permission("run_match"))):
    if state["last_result"] is None:
        raise HTTPException(404, "No match run yet — call POST /match/run first")
    tmp_dir = tempfile.mkdtemp()
    filename = f"match_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    output_path = str(Path(tmp_dir) / filename)
    build_results_workbook(state["last_result"], state["yps"], state["mcps"], output_path)
    log_action(
        _database_url, action="export_matches", endpoint="GET /match/export",
        actor_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        actor_id=current_user["id"], actor_email=current_user["email"],
        actor_name=current_user.get("full_name"),
        metadata={"filename": filename},
    )
    return FileResponse(
        path=output_path, filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        background=BackgroundTask(shutil.rmtree, tmp_dir, ignore_errors=True),
    )


# --- run_match scope required; lists past runs (summaries only — no
# matches/waitlist/dropped_mcps payload, to keep this cheap). Reuses the
# run_match scope rather than introducing a new permission, on the
# assumption that whoever can trigger a match run can also see run history;
# split this into its own scope (e.g. "match_runs_list") if that's too broad
# for your permission model.
#
# A super admin sees every user's runs; everyone else sees only their own
# (actor_id filter applied in list_match_runs(), not here, so there's one
# place deciding what "my runs" means). ---
@app.get("/match/runs")
def list_runs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_permission("run_match")),
):
    actor_filter = None if _is_super_admin(current_user) else current_user["id"]
    try:
        items, total = list_match_runs(_database_url, limit=limit, offset=offset, actor_id=actor_filter)
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error
    return {"items": items, "total": total, "limit": limit, "offset": offset}


# --- run_match scope required; full record for one past run, including
# matches/waitlist/dropped_mcps.
#
# A super admin can open any run id; everyone else can only open a run they
# own — a run that exists but belongs to someone else returns the same 404
# as a run that doesn't exist at all, so this endpoint never confirms other
# users' run ids are valid. ---
@app.get("/match/runs/{run_id}")
def get_run(
    run_id: int,
    current_user: dict = Depends(require_permission("run_match")),
):
    actor_filter = None if _is_super_admin(current_user) else current_user["id"]
    try:
        run = get_match_run(_database_url, run_id, actor_id=actor_filter)
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error
    if run is None:
        raise HTTPException(404, f"No match run found with id={run_id}")
    return run


# --- run_match scope required; redownloads a past run as .xlsx. Same
# ownership rule as GET /match/runs/{run_id}: super admin can export any
# run, everyone else only their own (same run-vs-nonexistent 404 either
# way). Built from the stored matches/waitlist/dropped_mcps only — IDs, not
# full YP/MCP names/addresses, since those aren't persisted (see
# utils/match_run_export.py for why). ---
@app.get("/match/runs/{run_id}/export")
def export_run(
    request: Request,
    run_id: int,
    current_user: dict = Depends(require_permission("run_match")),
):
    actor_filter = None if _is_super_admin(current_user) else current_user["id"]
    try:
        run = get_match_run(_database_url, run_id, actor_id=actor_filter)
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error
    if run is None:
        raise HTTPException(404, f"No match run found with id={run_id}")

    tmp_dir = tempfile.mkdtemp()
    filename = f"match_run_{run_id}_{run['created_at'].strftime('%Y%m%d_%H%M%S')}.xlsx"
    output_path = str(Path(tmp_dir) / filename)
    try:
        build_match_run_workbook(run, output_path)
    except RuntimeError as error:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(500, str(error)) from error

    log_action(
        _database_url, action="export_match_run", endpoint="GET /match/runs/{run_id}/export",
        actor_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        actor_id=current_user["id"], actor_email=current_user["email"],
        actor_name=current_user.get("full_name"),
        metadata={"match_run_id": run_id, "filename": filename},
    )
    return FileResponse(
        path=output_path, filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        background=BackgroundTask(shutil.rmtree, tmp_dir, ignore_errors=True),
    )


# --- evaluate scope required; actor captured ---
@app.post("/evaluation/compare")
async def compare_evaluation(
    request: Request,
    manual_match_file: UploadFile = File(...),
    criteria_config_json: str | None = None,
    current_user: dict = Depends(require_permission("evaluate")),
):
    if not state["yps"] or not state["mcps"]:
        raise HTTPException(400, "No YP/MCP data loaded — call /upload/yp and /upload/mcp first")
    if state["last_result"] is None:
        raise HTTPException(404, "No match run yet — call POST /match/run first")
    if not manual_match_file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Expected an Excel file (.xlsx/.xls) for manual_match_file")

    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        shutil.copyfileobj(manual_match_file.file, tmp)
        tmp_path = tmp.name
    try:
        manual_pairs = load_manual_matches(tmp_path)
    except ValueError as e:
        raise HTTPException(400, str(e))
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    automated_pairs = [
        {"yp_id": m.yp_id, "mcp_id": m.mcp_id, "travel_time": m.travel_time}
        for m in state["last_result"].matches
    ]

    criteria_config = None
    if criteria_config_json:
        try:
            criteria_config = json.loads(criteria_config_json)
        except json.JSONDecodeError as e:
            raise HTTPException(400, f"criteria_config_json is not valid JSON: {e}")

    try:
        report = compare_matches(
            state["yps"], state["mcps"], manual_pairs, automated_pairs,
            config=criteria_config,
            distance_service=state.get("distance_service") or DISTANCE_SERVICE,
        )
    except Exception:
        logger.exception("compare_evaluation() failed")
        raise HTTPException(500, "Evaluation failed — check server logs.")

    state["last_evaluation"] = report
    log_action(
        _database_url, action="compare_evaluation", endpoint="POST /evaluation/compare",
        actor_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        actor_id=current_user["id"], actor_email=current_user["email"],
        actor_name=current_user.get("full_name"),
        metadata={"filename": manual_match_file.filename},
    )
    return report


# --- evaluate scope required; actor captured ---
@app.get("/evaluation/export")
def export_evaluation(request: Request, current_user: dict = Depends(require_permission("evaluate"))):
    if state["last_evaluation"] is None:
        raise HTTPException(404, "No evaluation yet — call POST /evaluation/compare first")
    tmp_dir = tempfile.mkdtemp()
    filename = f"evaluation_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    output_path = str(Path(tmp_dir) / filename)
    write_evaluation_workbook(state["last_evaluation"], output_path)
    log_action(
        _database_url, action="export_evaluation", endpoint="GET /evaluation/export",
        actor_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        actor_id=current_user["id"], actor_email=current_user["email"],
        actor_name=current_user.get("full_name"),
        metadata={"filename": filename},
    )
    return FileResponse(
        path=output_path, filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        background=BackgroundTask(shutil.rmtree, tmp_dir, ignore_errors=True),
    )