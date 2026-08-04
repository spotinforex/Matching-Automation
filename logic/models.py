from typing import Optional
from pydantic import BaseModel


class YoungProfessional(BaseModel):
    id: str
    skill: str
    address: str
    landmark: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class MCP(BaseModel):
    id: str
    skill: str
    address: str
    landmark: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    capacity: int = 5


class MatchResult(BaseModel):
    yp_id: str
    mcp_id: str
    landmark: str
    travel_time: float
    round: int


class WaitlistEntry(BaseModel):
    yp_id: str
    reason: str