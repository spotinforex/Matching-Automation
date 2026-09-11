"""
main.py

FastAPI wrapper around the YP <-> MCP matching pipeline, now with auth.

Endpoints:
    POST /upload/yp          - upload the YP source .xlsx, parses & stores in memory
    POST /upload/mcp         - upload the MCP source .xlsx, parses & stores in memory
    POST /match/run          - runs geocoding + matching end-to-end, returns results   [run_match]
    GET  /match/export       - download the last match run as a formatted .xlsx        [run_match]
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

from fastapi import Depends, FastAPI, UploadFile, File, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from utils.data_loader import load_yps, load_mcps
from logic.services import HaversineDistanceService, GoogleMapsDistanceService  # noqa: F401
from logic.cached_distance_service import CachedDistanceService
from utils.excel_export import build_results_workbook
from utils.evaluation import compare_matches, load_manual_matches, write_evaluation_workbook
from logic.landmark import build_landmark_order
from logic.matcher import Matcher
from configs.schemas import MatchRunResponse, MatchResult, WaitlistEntry
from utils.audit_log import ensure_audit_log_table, get_audit_logs, log_action
from dotenv import load_dotenv
import logging

# --- NEW: auth imports ---
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
    allow_methods=["GET", "POST", "PATCH","DELETE"],
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
}

_google_api_key = os.environ.get("GOOGLE_API_KEY")
_database_url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
if not _database_url:
    raise RuntimeError(
        "DATABASE_URL (or SUPABASE_DB_URL) is required — auth, audit logs, and the "
        "distance cache all depend on it now."
    )
ensure_audit_log_table(_database_url)

# --- NEW: make DATABASE_URL discoverable to auth dependencies via app.state ---
app.state.database_url = _database_url

# --- NEW: mount auth + admin routers ---
app.include_router(auth_router)
app.include_router(admin_router)

if _google_api_key:
    _real_service = GoogleMapsDistanceService(api_key=_google_api_key)
    DISTANCE_SERVICE = CachedDistanceService(_real_service, database_url=_database_url)
    logger.info("Using GoogleMapsDistanceService with a Postgres-backed cache (DATABASE_URL set).")
else:
    logger.warning(
        "GOOGLE_MAPS_API_KEY not set — falling back to the offline "
        "Haversine estimate. Real matches will be inaccurate until this is set."
    )
    DISTANCE_SERVICE = HaversineDistanceService(coordinate_lookup={})


@app.get("/health")
def health():
    return {"status": "ok"}


# --- NEW: endpoints_list scope — lists every registered route ---
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


# --- CHANGED: audit_logs scope required ---
@app.get("/audit/logs", dependencies=[Depends(require_permission("audit_logs"))])
def read_audit_logs(
    from_time: datetime | None = Query(None, description="Include events at or after this ISO-8601 time"),
    to_time: datetime | None = Query(None, description="Include events at or before this ISO-8601 time"),
    action: str | None = Query(None, description="Filter by audit action, for example run_match"),
    event_type: str | None = Query(None, alias="type", description="Alias for action"),
    status: str | None = Query(None, description="Filter by status, for example success"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
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
            limit=limit, offset=offset,
        )
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error

    return {"items": logs, "total": total, "limit": limit, "offset": offset}


# NOTE: /upload/yp and /upload/mcp are left open to anyone logged in (any
# authenticated user) rather than gated by one of the four named scopes,
# since they're just staging data for a match run. If you want them locked
# down too, add dependencies=[Depends(get_current_user)] the same way.

@app.post("/upload/yp", dependencies=[Depends(get_current_user)])
async def upload_yp(request: Request, file: UploadFile = File(...)):
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
        metadata={"filename": file.filename, "record_count": len(yps)},
    )
    return {"loaded": len(yps)}


@app.post("/upload/mcp", dependencies=[Depends(get_current_user)])
async def upload_mcp(request: Request, file: UploadFile = File(...)):
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
        metadata={"filename": file.filename, "record_count": len(mcps)},
    )
    return {"loaded": len(mcps)}


# --- CHANGED: run_match scope required ---
@app.post("/match/run", response_model=MatchRunResponse, dependencies=[Depends(require_permission("run_match"))])
def run_match(request: Request, HOP_LIMIT: int = 3, MATCH_CAP: int | None = None, SHORTLIST_SIZE: int = 10):
    if not state["yps"]:
        raise HTTPException(400, "No YP data loaded — call /upload/yp first")
    if not state["mcps"]:
        raise HTTPException(400, "No MCP data loaded — call /upload/mcp first")

    matcher = Matcher(DISTANCE_SERVICE)
    matcher.geocode_missing(state["yps"], state["mcps"])
    landmark_order = build_landmark_order(state["yps"] + state["mcps"], DISTANCE_SERVICE)

    result = matcher.run(
        state["yps"], state["mcps"], landmark_order,
        hop_limit=HOP_LIMIT, match_cap=MATCH_CAP, shortlist_size=SHORTLIST_SIZE,
    )

    matches = [MatchResult(**m) for m in result["matches"]]
    waitlist = [WaitlistEntry(**w) for w in result["waitlist"]]

    response = MatchRunResponse(
        matches=matches, waitlist=waitlist,
        matched_count=len(matches), waitlisted_count=len(waitlist),
    )
    state["last_result"] = response
    state["last_evaluation"] = None
    log_action(
        _database_url, action="run_match", endpoint="POST /match/run",
        actor_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={
            "hop_limit": HOP_LIMIT, "match_cap": MATCH_CAP, "shortlist_size": SHORTLIST_SIZE,
            "matched_count": len(matches), "waitlisted_count": len(waitlist),
        },
    )
    return response


# --- CHANGED: run_match scope required (it's exporting a match run) ---
@app.get("/match/export", dependencies=[Depends(require_permission("run_match"))])
def export_results(request: Request):
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
        metadata={"filename": filename},
    )
    return FileResponse(
        path=output_path, filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        background=BackgroundTask(shutil.rmtree, tmp_dir, ignore_errors=True),
    )


# --- CHANGED: evaluate scope required ---
@app.post("/evaluation/compare", dependencies=[Depends(require_permission("evaluate"))])
async def compare_evaluation(
    request: Request,
    manual_match_file: UploadFile = File(...),
    criteria_config_json: str | None = None,
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
            config=criteria_config, distance_service=DISTANCE_SERVICE,
        )
    except Exception:
        logger.exception("compare_evaluation() failed")
        raise HTTPException(500, "Evaluation failed — check server logs.")

    state["last_evaluation"] = report
    log_action(
        _database_url, action="compare_evaluation", endpoint="POST /evaluation/compare",
        actor_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={"filename": manual_match_file.filename},
    )
    return report


# --- CHANGED: evaluate scope required ---
@app.get("/evaluation/export", dependencies=[Depends(require_permission("evaluate"))])
def export_evaluation(request: Request):
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
        metadata={"filename": filename},
    )
    return FileResponse(
        path=output_path, filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        background=BackgroundTask(shutil.rmtree, tmp_dir, ignore_errors=True),
    )
