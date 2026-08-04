from fastapi import FastAPI

from logic.matcher import Matcher
from logic.services import DistanceService
from logic.models import YoungProfessional, MCP

app = FastAPI()

distance_service = DistanceService()
matcher = Matcher(distance_service)


@app.post("/match")
def match(
    yps: list[YoungProfessional],
    mcps: list[MCP],
    landmark_order: dict
):

    result = matcher.run(
        yps,
        mcps,
        landmark_order,
        hop_limit=3
    )

    return result