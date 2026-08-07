from logic.matcher import Matcher
from configs.schemas import MCP, YoungProfessional


class DummyDistanceService:
    def geocode(self, address, landmark_fallback=None):
        return (0.0, 0.0)

    def travel_time(self, start, end):
        return 10.0


def build_yp(yp_id, gender, is_pwd=False):
    return YoungProfessional(
        id=yp_id,
        name=yp_id,
        skill="garment_both",
        address="address",
        landmark="downtown",
        gender=gender,
        is_pwd=is_pwd,
        latitude=1.0,
        longitude=1.0,
    )


def build_mcp(mcp_id, skill="garment_both", capacity=5):
    return MCP(
        id=mcp_id,
        name=mcp_id,
        skill=skill,
        address="address",
        landmark="downtown",
        latitude=1.0,
        longitude=1.0,
        capacity=capacity,
    )


def test_priority_order_prefers_pwd_women_before_men():
    matcher = Matcher(DummyDistanceService())
    yps = [
        build_yp("yp1", "male", False),
        build_yp("yp2", "female", True),
        build_yp("yp3", "male", True),
        build_yp("yp4", "female", False),
    ]
    mcps = [build_mcp("mcp1", capacity=2)]

    result = matcher.run(yps, mcps, {"downtown": []}, hop_limit=1)

    matched_ids = [m["yp_id"] for m in result["matches"]]
    assert matched_ids == ["yp2", "yp3"]


def test_trade_compatibility_handles_gender_and_subtype_rules():
    matcher = Matcher(DummyDistanceService())

    assert matcher.trade_matches("garment_female", "garment_both") is True
    assert matcher.trade_matches("garment_male", "garment_female") is False
    assert matcher.trade_matches("footwear_female", "footwear_both") is True
    assert matcher.trade_matches("leather_bag", "leather_wallet") is False
    assert matcher.trade_matches("leather_bag", "leather_bag") is True


def test_match_cap_stops_at_cap_and_waitlists_rest():
    matcher = Matcher(DummyDistanceService())
    yps = [
        build_yp("yp1", "female", True),
        build_yp("yp2", "female", True),
        build_yp("yp3", "male", False),
    ]
    mcps = [build_mcp("mcp1", capacity=2)]

    result = matcher.run(yps, mcps, {"downtown": []}, hop_limit=1, match_cap=2)

    assert len(result["matches"]) == 2
    assert result["waitlist"][0]["reason"] == "Match cap reached"


def test_hop_rounds_use_priority_and_preserve_unmatched_when_cap_is_hit():
    matcher = Matcher(DummyDistanceService())
    yps = [
        build_yp("yp1", "female", True),
        build_yp("yp2", "male", False),
    ]
    yps[0].landmark = "alpha"
    yps[1].landmark = "beta"
    mcps = [build_mcp("mcp1", capacity=1)]
    mcps[0].landmark = "gamma"

    result = matcher.run(
        yps,
        mcps,
        {"alpha": ["gamma"], "beta": ["gamma"]},
        hop_limit=1,
        match_cap=1,
    )

    assert [m["yp_id"] for m in result["matches"]] == ["yp1"]
    assert any(entry["yp_id"] == "yp2" and entry["reason"] == "Match cap reached" for entry in result["waitlist"])


def test_run_accepts_shortlist_size_override():
    matcher = Matcher(DummyDistanceService(), shortlist_size=10)
    yps = [build_yp("yp1", "female", True)]
    mcps = [build_mcp("mcp1", capacity=1)]

    result = matcher.run(yps, mcps, {"downtown": []}, hop_limit=1, shortlist_size=1)

    assert len(result["matches"]) == 1
