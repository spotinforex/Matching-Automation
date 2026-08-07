from typing import Optional
from pydantic import BaseModel


class YoungProfessional(BaseModel):
    id: str
    name: str
    skill: str
    address: str
    landmark: str
    phone_number: Optional[str] = None
    gender: Optional[str] = None
    is_pwd: bool = False
    trade_type: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class MCP(BaseModel):
    id: str
    name: str
    skill: str
    address: str
    landmark: str
    gender: Optional[str] = None
    trade_type: Optional[str] = None
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


class MatchRunResponse(BaseModel):
    matches: list[MatchResult]
    waitlist: list[WaitlistEntry]
    matched_count: int
    waitlisted_count: int