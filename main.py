"""
main.py

FastAPI wrapper around the YP <-> MCP matching pipeline.

Endpoints:
    POST /upload/yp     - upload the YP source .xlsx, parses & stores in memory
    POST /upload/mcp    - upload the MCP source .xlsx, parses & stores in memory
    POST /match/run     - runs geocoding + matching end-to-end, returns results
    GET  /health        - liveness check
    GET /match/export  - download the last match run as a formatted .xlsx

Plug in your real geocoding/travel-time implementation in distance_service.py
(GoogleMapsDistanceService) and set it below where DISTANCE_SERVICE is built.
Everything else (matcher.py, landmark_order.py, data_loader.py) is already
wired to work with any DistanceService implementation.
"""

import os
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from utils.data_loader import load_yps, load_mcps
from logic.services import HaversineDistanceService, GoogleMapsDistanceService  # noqa: F401
from utils.excel_export import build_results_workbook
from logic.landmark import build_landmark_order
from logic.matcher import Matcher
from configs.schemas import MatchRunResponse, MatchResult, WaitlistEntry
from dotenv import load_dotenv
import logging

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

load_dotenv()

app = FastAPI(title="Matching Automation")

# ---------------------------------------------------------------------------
# In-memory app state (swap for a DB/session store for multi-user/production use)
# ---------------------------------------------------------------------------

state = {
    "yps": None,
    "mcps": None,
    "last_result": None,
}

# ---------------------------------------------------------------------------
# Distance service.
#
# The API key is read from the GOOGLE_MAPS_API_KEY environment variable —
# never hardcode it here or commit it. Set it before starting the app, e.g.:
#   export GOOGLE_MAPS_API_KEY="your-key-here"
#   uvicorn main:app --reload
#
# Falls back to the offline Haversine estimate if the env var isn't set, so
# the app still boots (with a warning) for local testing without a key.
# ---------------------------------------------------------------------------

_google_api_key = os.environ.get("GOOGLE_API_KEY")

if _google_api_key:
    DISTANCE_SERVICE = GoogleMapsDistanceService(api_key=_google_api_key)
else:
    print(
        "WARNING: GOOGLE_MAPS_API_KEY not set — falling back to the offline "
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
def run_match(HOP_LIMIT: int = 3):
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

    build_results_workbook(state["last_result"], output_path)

    return FileResponse(
        path=output_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        background=BackgroundTask(shutil.rmtree, tmp_dir, ignore_errors=True),
    )