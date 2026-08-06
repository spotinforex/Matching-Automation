"""
estimate_cost.py

Estimates the Google Maps API cost of a match run WITHOUT spending any
money or making any network calls.

How it works:
    The number of billable Geocoding / Distance Matrix calls a run makes
    depends entirely on your data (unique addresses, landmark distribution,
    skill overlap, how many YPs fall through to hop-expansion) — not on
    which DistanceService implementation answers the calls. So this script
    runs your REAL Matcher against a FakeCoordinateDistanceService that
    mimics GoogleMapsDistanceService's exact caching behavior (same cache
    keys, same "only counts as billable on a cache miss" logic) but never
    touches the network. The resulting call counts are the real counts a
    live run would produce; only the dollar figure is an estimate, since
    that depends on current Google pricing and your account's free tier
    usage elsewhere.

Usage:
    # Dry run against synthetic data shaped like your real dataset
    python estimate_cost.py --yps 1069 --mcps 240 --landmarks 12 --skills 4

    # Dry run against your REAL uploaded data (requires utils/data_loader.py
    # to be importable, i.e. run this from your project root)
    python estimate_cost.py --yp-file data/yps.xlsx --mcp-file data/mcps.xlsx

IMPORTANT: pricing below is entered manually and WILL drift out of date.
Confirm current rates at:
    https://developers.google.com/maps/billing-and-pricing/pricing
before treating the dollar figure as more than a rough estimate. Google
changed Maps Platform pricing significantly in March 2025 (removed the old
$200/month blanket credit in favor of per-SKU free tiers), so don't trust
older figures you might have seen elsewhere.
"""

import argparse
import hashlib
import math
import random
import sys
from dataclasses import dataclass, field
from typing import Optional, Tuple

# --- Try to use the real project modules if this is run from the project root ---
try:
    from logic.matcher import Matcher
except ImportError:
    print(
        "ERROR: could not import logic.matcher.Matcher — run this script from your "
        "project root (the directory containing main.py), so 'logic' is importable.",
        file=sys.stderr,
    )
    sys.exit(1)

try:
    from logic.services import DistanceService
except ImportError:
    # Fall back to a minimal local ABC if the path differs — the script only
    # needs geocode()/travel_time() to exist with the right signatures.
    from abc import ABC, abstractmethod

    class DistanceService(ABC):
        @abstractmethod
        def geocode(self, address, landmark_fallback=None): ...
        @abstractmethod
        def travel_time(self, origin, destination): ...


# ---------------------------------------------------------------------------
# Fake distance service: zero cost, zero network, but mirrors the REAL
# GoogleMapsDistanceService's caching semantics exactly, so call counts are
# accurate.
# ---------------------------------------------------------------------------

class FakeCoordinateDistanceService(DistanceService):
    """
    - geocode(): always "succeeds" (never raises), returning a deterministic
      pseudo-coordinate derived from a hash of the address, so the same
      address always maps to the same point (like a real geocoder would).
      This is a conservative/optimistic assumption: it assumes every address
      resolves on the FIRST try (no landmark fallback needed), which means
      this script reports a lower-bound / best-case geocoding call count. If
      a meaningful fraction of your real addresses are messy enough to need
      the landmark fallback, real geocoding billable calls could be modestly
      higher than what this reports (each fallback is a 2nd billable call).
    - travel_time(): computed via real Haversine distance between the fake
      coordinates at an assumed speed, purely so the matcher's sort/tie-break
      logic exercises realistically. The VALUE is not meaningful — only the
      CALL COUNT matters for this script's purpose.
    - Caching mirrors GoogleMapsDistanceService: geocode keyed by address
      string, travel_time keyed by (origin, destination, mode) — a call only
      counts as billable on a cache miss, exactly like the real service.
    """

    # Rough bounding box around Aba, Abia State, Nigeria — irrelevant to the
    # cost math, only used so fake coordinates cluster plausibly for the
    # matcher's landmark-ordering logic to behave sensibly.
    LAT_RANGE = (5.08, 5.14)
    LON_RANGE = (7.33, 7.42)

    def __init__(self):
        self.geocode_calls = 0        # billable (cache miss)
        self.geocode_cache_hits = 0
        self.travel_time_calls = 0    # billable elements (cache miss)
        self.travel_time_cache_hits = 0
        self._geocode_cache = {}
        self._travel_time_cache = {}

    def geocode(self, address: str, landmark_fallback: Optional[str] = None) -> Tuple[float, float]:
        key = (address or "").strip()
        if key in self._geocode_cache:
            self.geocode_cache_hits += 1
            return self._geocode_cache[key]

        self.geocode_calls += 1
        coords = self._pseudo_coords(key)
        self._geocode_cache[key] = coords
        return coords

    def travel_time(self, origin: Tuple[float, float], destination: Tuple[float, float]) -> float:
        cache_key = (origin, destination, "driving")
        if cache_key in self._travel_time_cache:
            self.travel_time_cache_hits += 1
            return self._travel_time_cache[cache_key]

        self.travel_time_calls += 1
        minutes = self._haversine_minutes(origin, destination)
        self._travel_time_cache[cache_key] = minutes
        return minutes

    def _pseudo_coords(self, text: str) -> Tuple[float, float]:
        h = hashlib.sha256(text.encode("utf-8")).hexdigest()
        lat_frac = int(h[:8], 16) / 0xFFFFFFFF
        lon_frac = int(h[8:16], 16) / 0xFFFFFFFF
        lat = self.LAT_RANGE[0] + lat_frac * (self.LAT_RANGE[1] - self.LAT_RANGE[0])
        lon = self.LON_RANGE[0] + lon_frac * (self.LON_RANGE[1] - self.LON_RANGE[0])
        return (lat, lon)

    @staticmethod
    def _haversine_minutes(origin, destination, avg_speed_kmh: float = 25.0) -> float:
        lat1, lon1 = origin
        lat2, lon2 = destination
        R = 6371.0
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
        distance_km = 2 * R * math.asin(math.sqrt(a))
        return (distance_km / avg_speed_kmh) * 60


# ---------------------------------------------------------------------------
# Minimal person model + synthetic data generator (used when --yp-file /
# --mcp-file aren't given)
# ---------------------------------------------------------------------------

@dataclass
class Entity:
    id: str
    address: str
    landmark: str
    skill: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    capacity: Optional[int] = None


def generate_synthetic_data(num_yps, num_mcps, num_landmarks, num_skills, seed):
    rng = random.Random(seed)
    landmarks = [f"landmark_{i}" for i in range(num_landmarks)]
    skills = [f"skill_{i}" for i in range(num_skills)]

    yps = [
        Entity(
            id=f"YP_{i:04d}",
            address=f"{rng.randint(1, 200)} Fake Street, {rng.choice(landmarks)}",
            landmark=rng.choice(landmarks),
            skill=rng.choice(skills),
        )
        for i in range(num_yps)
    ]

    mcps = [
        Entity(
            id=f"MCP_{i:04d}",
            address=f"{rng.randint(1, 200)} Fake Avenue, {rng.choice(landmarks)}",
            landmark=rng.choice(landmarks),
            skill=rng.choice(skills),
            capacity=rng.randint(2, 8),
        )
        for i in range(num_mcps)
    ]

    return yps, mcps


def load_real_data(yp_file, mcp_file):
    try:
        from utils.data_loader import load_yps, load_mcps
    except ImportError:
        print(
            "ERROR: could not import utils.data_loader — run this script from your "
            "project root so 'utils' is importable.",
            file=sys.stderr,
        )
        sys.exit(1)
    return load_yps(yp_file), load_mcps(mcp_file)


# ---------------------------------------------------------------------------
# Simple free landmark ordering (no distance-service calls — landmark-level
# pair counts are tiny vs. person-level pair counts, so computing this for
# free via plain Haversine keeps the estimate simple without meaningfully
# undercounting cost).
# ---------------------------------------------------------------------------

def build_free_landmark_order(yps, mcps):
    from collections import defaultdict

    points_by_landmark = defaultdict(list)
    for p in yps + mcps:
        if p.latitude is not None:
            points_by_landmark[p.landmark].append((p.latitude, p.longitude))

    centroids = {}
    for landmark, points in points_by_landmark.items():
        avg_lat = sum(p[0] for p in points) / len(points)
        avg_lon = sum(p[1] for p in points) / len(points)
        centroids[landmark] = (avg_lat, avg_lon)

    order = {}
    for landmark, centroid in centroids.items():
        others = [(l2, FakeCoordinateDistanceService._haversine_minutes(centroid, c2))
                  for l2, c2 in centroids.items() if l2 != landmark]
        others.sort(key=lambda x: x[1])
        order[landmark] = [l2 for l2, _ in others]

    return order


# ---------------------------------------------------------------------------
# Cost math
# ---------------------------------------------------------------------------

def estimate_dollar_cost(count, free_tier, rate_per_1000):
    billable = max(0, count - free_tier)
    return billable / 1000 * rate_per_1000


def main():
    print("Starting estimate_cost.py")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    data_group = parser.add_argument_group("data source (choose synthetic OR real files)")
    data_group.add_argument("--yp-file", help="Path to real YP .xlsx (requires utils/data_loader.py)")
    data_group.add_argument("--mcp-file", help="Path to real MCP .xlsx (requires utils/data_loader.py)")
    data_group.add_argument("--yps", type=int, default=1069, help="Synthetic YP count (default: 1069)")
    data_group.add_argument("--mcps", type=int, default=240, help="Synthetic MCP count (default: 240)")
    data_group.add_argument("--landmarks", type=int, default=12, help="Synthetic landmark count (default: 12)")
    data_group.add_argument("--skills", type=int, default=4, help="Synthetic skill count (default: 4)")
    data_group.add_argument("--seed", type=int, default=42, help="Random seed for synthetic data (default: 42)")

    parser.add_argument("--hop-limit", type=int, default=5, help="Hop limit passed to Matcher.run() (default: 3)")

    pricing_group = parser.add_argument_group("pricing (VERIFY at https://developers.google.com/maps/billing-and-pricing/pricing)")
    pricing_group.add_argument("--geocoding-rate", type=float, default=5.0, help="$ per 1,000 Geocoding requests (default: 5.0)")
    pricing_group.add_argument("--geocoding-free-tier", type=int, default=0, help="Free Geocoding events/month already available on your account (default: 10000)")
    pricing_group.add_argument("--distance-rate", type=float, default=5.0, help="$ per 1,000 Distance Matrix elements (default: 5.0)")
    pricing_group.add_argument("--distance-free-tier", type=int, default=0, help="Free Distance Matrix elements/month (default: 0 — Legacy SKU free tier is unconfirmed as of writing)")

    args = parser.parse_args()

    if bool(args.yp_file) != bool(args.mcp_file):
        parser.error("--yp-file and --mcp-file must be given together")

    if args.yp_file:
        print(f"Loading real data from {args.yp_file} / {args.mcp_file} ...")
        yps, mcps = load_real_data(args.yp_file, args.mcp_file)
    else:
        print(
            f"Generating synthetic data: {args.yps} YPs, {args.mcps} MCPs, "
            f"{args.landmarks} landmarks, {args.skills} skills (seed={args.seed}) ..."
        )
        yps, mcps = generate_synthetic_data(args.yps, args.mcps, args.landmarks, args.skills, args.seed)

    fake_service = FakeCoordinateDistanceService()
    matcher = Matcher(fake_service)

    print("Running geocode_missing() ...")
    matcher.geocode_missing(yps, mcps)

    print("Building landmark order (free, no distance-service calls) ...")
    landmark_order = build_free_landmark_order(yps, mcps)

    print(f"Running matcher (hop_limit={args.hop_limit}) ...")
    result = matcher.run(yps, mcps, landmark_order, hop_limit=args.hop_limit)

    geocode_cost = estimate_dollar_cost(fake_service.geocode_calls, args.geocoding_free_tier, args.geocoding_rate)
    distance_cost = estimate_dollar_cost(fake_service.travel_time_calls, args.distance_free_tier, args.distance_rate)
    total_cost = geocode_cost + distance_cost

    print()
    print("=" * 60)
    print("COST ESTIMATE (based on real algorithm behavior)")
    print("=" * 60)
    print(f"Input:                     {len(yps)} YPs, {len(mcps)} MCPs")
    print(f"Matched:                   {len(result['matches'])}")
    print(f"Waitlisted:                {len(result['waitlist'])}")
    print(f"MCPs dropped (geocode):    {len(result.get('dropped_mcps', []))}")
    print()
    print("Geocoding API")
    print(f"  Billable calls:          {fake_service.geocode_calls}  (cache hits avoided: {fake_service.geocode_cache_hits})")
    print(f"  Free tier assumed:       {args.geocoding_free_tier}")
    print(f"  Rate:                    ${args.geocoding_rate:.2f} / 1,000")
    print(f"  Estimated cost:          ${geocode_cost:.2f}")
    print()
    print("Distance Matrix API")
    print(f"  Billable elements:       {fake_service.travel_time_calls}  (cache hits avoided: {fake_service.travel_time_cache_hits})")
    print(f"  Free tier assumed:       {args.distance_free_tier}")
    print(f"  Rate:                    ${args.distance_rate:.2f} / 1,000")
    print(f"  Estimated cost:          ${distance_cost:.2f}")
    print()
    print(f"TOTAL ESTIMATED COST:     ${total_cost:.2f}")
    print("=" * 60)
    print()
    print("NOTE: this assumes every address geocodes successfully on the first")
    print("try (no landmark fallback needed) and does not include the small,")
    print("landmark-count-scaled cost of building the fallback hop order. Real")
    print("cost could be modestly higher. Verify current rates at:")
    print("  https://developers.google.com/maps/billing-and-pricing/pricing")


if __name__ == "__main__":
    main()