"""
main.py

FastAPI wrapper around the YP <-> MCP matching pipeline.

Endpoints:
    POST /upload/yp          - upload the YP source .xlsx, parses & stores in memory
    POST /upload/mcp         - upload the MCP source .xlsx, parses & stores in memory
    POST /match/run          - runs geocoding + matching end-to-end, returns results
    GET  /match/export       - download the last match run as a formatted .xlsx
    POST /evaluation/compare - compares the last match run against an uploaded manual
                                match reference sheet (drift/accuracy report)
    GET  /evaluation/export  - download the last evaluation as a formatted .xlsx
    GET  /health             - liveness check

Plug in your real geocoding/travel-time implementation in distance_service.py
(GoogleMapsDistanceService) and set it below where DISTANCE_SERVICE is built.
Everything else (matcher.py, landmark_order.py, data_loader.py) is already
wired to work with any DistanceService implementation.
"""

import json
import os
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
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
from dotenv import load_dotenv
import logging

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
    allow_methods=["GET", "POST"],
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

if _google_api_key:
    _real_service = GoogleMapsDistanceService(api_key=_google_api_key)

    if _database_url:
        DISTANCE_SERVICE = CachedDistanceService(_real_service, database_url=_database_url)
        logger.info("Using GoogleMapsDistanceService with a Postgres-backed cache (DATABASE_URL set).")
    else:
        DISTANCE_SERVICE = _real_service
        logger.warning(
            "DATABASE_URL not set — geocode/travel-time cache is in-memory only "
            "and will reset on every restart/redeploy, re-billing Google for addresses "
            "you've already paid for. Set DATABASE_URL to a Postgres connection string "
            "(e.g. from Supabase) to persist the cache."
        )
else:
    logger.warning(
        "GOOGLE_MAPS_API_KEY not set — falling back to the offline "
        "Haversine estimate. Real matches will be inaccurate until this is set."
    )
    DISTANCE_SERVICE = HaversineDistanceService(coordinate_lookup={})



@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/upload/yp")
async def upload_yp(file: UploadFile = File(...)):
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
    return {"loaded": len(yps)}


@app.post("/upload/mcp")
async def upload_mcp(file: UploadFile = File(...)):
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
    return {"loaded": len(mcps)}


@app.post("/match/run", response_model=MatchRunResponse)
def run_match(HOP_LIMIT: int = 3, MATCH_CAP: int | None = None, SHORTLIST_SIZE: int = 10):
    if not state["yps"]:
        raise HTTPException(400, "No YP data loaded — call /upload/yp first")
    if not state["mcps"]:
        raise HTTPException(400, "No MCP data loaded — call /upload/mcp first")

    matcher = Matcher(DISTANCE_SERVICE)

    # geocode first so landmark centroids are available for the fallback order
    matcher.geocode_missing(state["yps"], state["mcps"])
    landmark_order = build_landmark_order(state["yps"] + state["mcps"], DISTANCE_SERVICE)

    result = matcher.run(
        state["yps"],
        state["mcps"],
        landmark_order,
        hop_limit=HOP_LIMIT,
        match_cap=MATCH_CAP,
        shortlist_size=SHORTLIST_SIZE,
    )

    matches = [MatchResult(**m) for m in result["matches"]]
    waitlist = [WaitlistEntry(**w) for w in result["waitlist"]]

    response = MatchRunResponse(
        matches=matches,
        waitlist=waitlist,
        matched_count=len(matches),
        waitlisted_count=len(waitlist),
    )
    state["last_result"] = response
    # A fresh match run invalidates any evaluation computed against the
    # previous one — clear it rather than silently letting /evaluation/export
    # serve a stale report for a match run that no longer exists.
    state["last_evaluation"] = None
    return response


@app.get("/match/export")
def export_results():
    """
    Export the last match run to a formatted .xlsx and return it as a download.
    Sheets: Matches, Waitlist, Summary.
    """
    if state["last_result"] is None:
        raise HTTPException(404, "No match run yet — call POST /match/run first")

    tmp_dir = tempfile.mkdtemp()
    filename = f"match_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    output_path = str(Path(tmp_dir) / filename)

    build_results_workbook(state["last_result"], state["yps"], state["mcps"], output_path)

    return FileResponse(
        path=output_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        background=BackgroundTask(shutil.rmtree, tmp_dir, ignore_errors=True),
    )


@app.post("/evaluation/compare")
async def compare_evaluation(manual_match_file: UploadFile = File(...), criteria_config_json: str | None = None):
    """
    Compares the last match run (POST /match/run) against a manually-matched
    reference sheet, uploaded here, and returns a drift report: exact/
    equivalent/divergent counts, per-criterion compliance rates (distance,
    trade area, specialization, capacity, gender preference, PWD proximity),
    and a full per-YP audit trail.

    Reuses state["yps"]/state["mcps"]/state["last_result"] directly rather
    than requiring re-upload of the YP/MCP files or the automated match —
    the manual match sheet is the only new input this endpoint needs.

    criteria_config_json: optional JSON string overriding
    match_evaluation.DEFAULT_CRITERIA_CONFIG, e.g.
    '{"pwd_proximity_threshold_km": 2.5}'.
    """
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
            state["yps"],
            state["mcps"],
            manual_pairs,
            automated_pairs,
            config=criteria_config,
            # Passing the app's real DISTANCE_SERVICE (not None) lets
            # compare_matches() backfill coordinates for anyone still
            # missing them — but since /match/run already geocoded
            # everyone in state["yps"]/state["mcps"], and DISTANCE_SERVICE
            # is cache-backed when DATABASE_URL is set, this call is a
            # no-op / free cache hit for everyone already resolved, not a
            # fresh billable geocode pass.
            distance_service=DISTANCE_SERVICE,
        )
    except Exception:
        logger.exception("compare_evaluation() failed")
        raise HTTPException(500, "Evaluation failed — check server logs.")

    state["last_evaluation"] = report
    return report


@app.get("/evaluation/export")
def export_evaluation():
    """
    Export the last evaluation (POST /evaluation/compare) to a formatted
    .xlsx and return it as a download. Sheets: Summary, Detail.
    """
    if state["last_evaluation"] is None:
        raise HTTPException(404, "No evaluation yet — call POST /evaluation/compare first")

    tmp_dir = tempfile.mkdtemp()
    filename = f"evaluation_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    output_path = str(Path(tmp_dir) / filename)

    write_evaluation_workbook(state["last_evaluation"], output_path)

    return FileResponse(
        path=output_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        background=BackgroundTask(shutil.rmtree, tmp_dir, ignore_errors=True),
    )