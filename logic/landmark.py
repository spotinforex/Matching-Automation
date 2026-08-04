"""
landmark_order.py

Builds the landmark_order structure Matcher.run() needs for the Round-2+
fallback cascade: for each landmark, an ordered list of the next-closest
landmarks to try, nearest first.

Distance between landmarks is computed from centroids: the average
coordinate of every YP + MCP already geocoded within that landmark.
Call this AFTER geocoding (or pass already-geocoded people in).
"""

from collections import defaultdict


def build_landmark_order(people, distance_service) -> dict[str, list[str]]:
    """
    people: combined list of YPs + MCPs (already geocoded — i.e. .latitude/
            .longitude populated). Landmarks with no geocoded points are skipped.
    Returns: {landmark: [next_closest_landmark, 2nd_closest, ...]}
    """
    coords_by_landmark = defaultdict(list)
    for p in people:
        if p.latitude is not None and p.longitude is not None:
            coords_by_landmark[p.landmark].append((p.latitude, p.longitude))

    centroids = {}
    for landmark, coords in coords_by_landmark.items():
        avg_lat = sum(c[0] for c in coords) / len(coords)
        avg_lon = sum(c[1] for c in coords) / len(coords)
        centroids[landmark] = (avg_lat, avg_lon)

    landmark_order: dict[str, list[str]] = {}
    for landmark, centroid in centroids.items():
        others = [
            (distance_service.travel_time(centroid, other_centroid), other_landmark)
            for other_landmark, other_centroid in centroids.items()
            if other_landmark != landmark
        ]
        others.sort(key=lambda x: x[0])
        landmark_order[landmark] = [name for _, name in others]

    return landmark_order