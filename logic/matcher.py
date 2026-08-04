from collections import defaultdict
import random


class Matcher:

    def __init__(self, distance_service):
        self.distance = distance_service

    ####################################################################
    # Stage 1
    ####################################################################

    def geocode_missing(self, yps, mcps):

        cache = {}

        for person in yps + mcps:

            if person.latitude is not None:
                continue

            if person.address not in cache:
                cache[person.address] = self.distance.geocode(person.address)

            person.latitude, person.longitude = cache[person.address]

    ####################################################################
    # Stage 2
    ####################################################################

    def group_by_landmark(self, people):

        groups = defaultdict(list)

        for p in people:
            groups[p.landmark].append(p)

        return groups

    ####################################################################
    # Stage 3
    ####################################################################

    def build_cost_matrix(self, yp_group, mcp_group):

        matrix = []

        for yp in yp_group:

            for mcp in mcp_group:

                # Skill constraint

                if yp.skill != mcp.skill:
                    continue

                t = self.distance.travel_time(
                    (yp.latitude, yp.longitude),
                    (mcp.latitude, mcp.longitude)
                )

                matrix.append((t, yp.id, mcp.id))

        matrix.sort(key=lambda x: x[0])

        return matrix

    ####################################################################
    # Greedy matching
    ####################################################################

    def greedy_match(
        self,
        yp_group,
        mcp_group,
        round_number
    ):

        matches = []
        unmatched = []

        load = {
            m.id: 0
            for m in mcp_group
        }

        mcp_lookup = {
            m.id: m
            for m in mcp_group
        }

        yp_lookup = {
            y.id: y
            for y in yp_group
        }

        assigned = set()

        matrix = self.build_cost_matrix(
            yp_group,
            mcp_group
        )

        for travel, yp_id, mcp_id in matrix:

            if yp_id in assigned:
                continue

            mcp = mcp_lookup[mcp_id]

            if load[mcp_id] >= mcp.capacity:
                continue

            same_time = [
                p for p in matrix
                if p[0] == travel and p[1] == yp_id
            ]

            if len(same_time) > 1:

                same_time.sort(
                    key=lambda x: load[x[2]]
                )

                best_load = load[same_time[0][2]]

                candidates = [
                    s
                    for s in same_time
                    if load[s[2]] == best_load
                ]

                travel, yp_id, mcp_id = random.choice(candidates)

            assigned.add(yp_id)
            load[mcp_id] += 1

            matches.append({
                "yp_id": yp_id,
                "mcp_id": mcp_id,
                "landmark": mcp.landmark,
                "travel_time": travel,
                "round": round_number
            })

        for yp in yp_group:
            if yp.id not in assigned:
                unmatched.append(yp)

        return matches, unmatched, load

    def run(
        self,
        yps,
        mcps,
        landmark_order,
        hop_limit=3
    ):

        self.geocode_missing(yps, mcps)

        yp_groups = self.group_by_landmark(yps)
        mcp_groups = self.group_by_landmark(mcps)

        all_matches = []
        waitlist = []

        remaining_capacity = {
            m.id: m.capacity
            for m in mcps
        }

        unmatched = []

        ####################################################
        # Round 1
        ####################################################

        for landmark in yp_groups:

            matches, left, loads = self.greedy_match(
                yp_groups[landmark],
                mcp_groups.get(landmark, []),
                1
            )

            all_matches.extend(matches)
            unmatched.extend(left)

            for mcp_id, used in loads.items():
                remaining_capacity[mcp_id] -= used

        ####################################################
        # Round 2+
        ####################################################

        for hop in range(1, hop_limit + 1):

            if not unmatched:
                break

            next_round = []

            for yp in unmatched:

                nearby = landmark_order.get(
                    yp.landmark,
                    []
                )

                if hop > len(nearby):
                    next_round.append(yp)
                    continue

                target_landmark = nearby[hop - 1]

                candidate_mcps = [
                    m
                    for m in mcp_groups.get(target_landmark, [])
                    if remaining_capacity[m.id] > 0
                    and m.skill == yp.skill
                ]

                if not candidate_mcps:
                    next_round.append(yp)
                    continue

                best = None
                best_time = float("inf")

                for mcp in candidate_mcps:

                    t = self.distance.travel_time(
                        (yp.latitude, yp.longitude),
                        (mcp.latitude, mcp.longitude)
                    )

                    if t < best_time:
                        best_time = t
                        best = mcp

                if best is None:
                    next_round.append(yp)
                    continue

                remaining_capacity[best.id] -= 1

                all_matches.append({
                    "yp_id": yp.id,
                    "mcp_id": best.id,
                    "landmark": best.landmark,
                    "travel_time": best_time,
                    "round": hop + 1
                })

            unmatched = next_round

        ####################################################
        # Waitlist
        ####################################################

        for yp in unmatched:
            waitlist.append({
                "yp_id": yp.id,
                "reason": "No capacity within hop limit"
            })

        return {
            "matches": all_matches,
            "waitlist": waitlist
        }