import logging
import random
import time
from collections import defaultdict

logger = logging.getLogger(__name__)


class Matcher:

    def __init__(self, distance_service):
        self.distance = distance_service

    ####################################################################
    # Stage 1
    ####################################################################

    def geocode_missing(self, yps, mcps):
        """
        Geocodes every person missing coordinates. People whose address AND
        landmark fallback both fail to resolve are NOT silently skipped with
        null coordinates (that would just defer the crash to build_cost_matrix
        / travel_time later, with a much less useful stack trace). Instead
        they're collected here and returned so the caller (run()) can route
        them straight to the waitlist before matching ever starts.
        """

        cache = {}
        to_geocode = len([p for p in yps + mcps if p.latitude is None])
        logger.info("geocode_missing() starting: %d people need geocoding (of %d total)",
                    to_geocode, len(yps) + len(mcps))

        start = time.monotonic()
        resolved = 0
        failed = []

        for person in yps + mcps:

            if person.latitude is not None:
                continue

            if person.address not in cache:
                try:
                    cache[person.address] = self.distance.geocode(
                        person.address,
                        landmark_fallback=person.landmark,
                    )
                except ValueError:
                    logger.error(
                        "geocode_missing() could not geocode person id=%s address=%r landmark=%r "
                        "— routing to waitlist",
                        getattr(person, "id", "?"), person.address, person.landmark,
                    )
                    failed.append(person)
                    continue

            person.latitude, person.longitude = cache[person.address]
            resolved += 1

        elapsed = time.monotonic() - start
        logger.info(
            "geocode_missing() done in %.2fs: %d resolved, %d failed (unresolvable), "
            "%d unique addresses geocoded (%.2fs/address avg)",
            elapsed, resolved, len(failed), len(cache),
            elapsed / len(cache) if cache else 0.0,
        )

        return failed

    ####################################################################
    # Stage 2
    ####################################################################

    def group_by_landmark(self, people):

        groups = defaultdict(list)

        for p in people:
            groups[p.landmark].append(p)

        logger.debug("group_by_landmark() grouped %d people into %d landmarks: %s",
                     len(people), len(groups), {k: len(v) for k, v in groups.items()})

        return groups

    ####################################################################
    # Stage 3
    ####################################################################

    def build_cost_matrix(self, yp_group, mcp_group):

        matrix = []
        skipped_skill_mismatch = 0

        for yp in yp_group:

            for mcp in mcp_group:

                # Skill constraint

                if yp.skill != mcp.skill:
                    skipped_skill_mismatch += 1
                    continue

                t = self.distance.travel_time(
                    (yp.latitude, yp.longitude),
                    (mcp.latitude, mcp.longitude)
                )

                matrix.append((t, yp.id, mcp.id))

        matrix.sort(key=lambda x: x[0])

        logger.debug(
            "build_cost_matrix() yps=%d mcps=%d -> %d pairs (skipped %d skill mismatches)",
            len(yp_group), len(mcp_group), len(matrix), skipped_skill_mismatch,
        )

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

        logger.info(
            "greedy_match() round=%d starting: %d yps, %d mcps",
            round_number, len(yp_group), len(mcp_group),
        )

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

                # BUGFIX: only consider tied MCPs that still have room —
                # previously a full MCP could still be picked here because
                # capacity was only checked for the *original* candidate,
                # not for a tie-broken reselection.
                same_time = [
                    s for s in same_time
                    if load[s[2]] < mcp_lookup[s[2]].capacity
                ]

                if not same_time:
                    logger.debug(
                        "greedy_match() yp_id=%s: all %d tied MCPs full at travel=%.1f, skipping",
                        yp_id, len(same_time), travel,
                    )
                    continue  # every tied MCP is full; move on in the matrix

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
                mcp = mcp_lookup[mcp_id]

                logger.debug(
                    "greedy_match() tie-break for yp_id=%s: %d candidates at load=%d, picked mcp_id=%s",
                    yp_id, len(candidates), best_load, mcp_id,
                )

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

        logger.info(
            "greedy_match() round=%d done: %d matched, %d unmatched",
            round_number, len(matches), len(unmatched),
        )

        return matches, unmatched, load

    def run(
        self,
        yps,
        mcps,
        landmark_order,
        hop_limit=3
    ):

        logger.info("run() starting: %d yps, %d mcps, hop_limit=%d", len(yps), len(mcps), hop_limit)

        run_start = time.monotonic()
        all_matches = []
        waitlist = []
        dropped_mcps = []

        ####################################################
        # Geocoding — anyone unresolvable is pulled out before
        # matching starts, rather than crashing mid-match with
        # None coordinates.
        ####################################################

        geocode_failed = self.geocode_missing(yps, mcps)
        geocode_elapsed = time.monotonic() - run_start

        if geocode_failed:
            failed_ids = {id(p) for p in geocode_failed}
            failed_yps = [p for p in geocode_failed if p in yps]
            failed_mcps = [p for p in geocode_failed if p in mcps]

            yps = [p for p in yps if id(p) not in failed_ids]
            mcps = [p for p in mcps if id(p) not in failed_ids]

            for yp in failed_yps:
                waitlist.append({
                    "yp_id": yp.id,
                    "reason": "Could not geocode address",
                })

            if failed_mcps:
                logger.warning(
                    "run() dropping %d mcp(s) with unresolvable addresses from the matching pool: %s",
                    len(failed_mcps), [m.id for m in failed_mcps],
                )
                for mcp in failed_mcps:
                    dropped_mcps.append({
                        "mcp_id": mcp.id,
                        "reason": "Could not geocode address",
                    })

            logger.info(
                "run() geocoding removed %d yp(s) (-> waitlist) and %d mcp(s) (-> dropped) from the pool",
                len(failed_yps), len(failed_mcps),
            )

        yp_groups = self.group_by_landmark(yps)
        mcp_groups = self.group_by_landmark(mcps)

        remaining_capacity = {
            m.id: m.capacity
            for m in mcps
        }

        unmatched = []

        ####################################################
        # Round 1
        ####################################################

        logger.info("run() round 1: matching within landmark, %d landmarks", len(yp_groups))

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

        logger.info(
            "run() round 1 done: %d total matches so far, %d unmatched heading into hop rounds",
            len(all_matches), len(unmatched),
        )

        ####################################################
        # Round 2+
        ####################################################

        for hop in range(1, hop_limit + 1):

            if not unmatched:
                logger.info("run() hop %d: no unmatched yps left, stopping early", hop)
                break

            logger.info("run() hop %d: attempting to place %d unmatched yps", hop, len(unmatched))

            next_round = []
            placed_this_hop = 0

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
                placed_this_hop += 1

                all_matches.append({
                    "yp_id": yp.id,
                    "mcp_id": best.id,
                    "landmark": best.landmark,
                    "travel_time": best_time,
                    "round": hop + 1
                })

            unmatched = next_round
            logger.info(
                "run() hop %d done: %d placed, %d still unmatched",
                hop, placed_this_hop, len(unmatched),
            )

        ####################################################
        # Waitlist
        ####################################################

        for yp in unmatched:
            waitlist.append({
                "yp_id": yp.id,
                "reason": "No capacity within hop limit"
            })

        logger.info(
            "run() finished in %.2fs (geocoding %.2fs, matching %.2fs): "
            "%d total matches, %d waitlisted, %d mcp(s) dropped",
            time.monotonic() - run_start, geocode_elapsed,
            (time.monotonic() - run_start) - geocode_elapsed,
            len(all_matches), len(waitlist), len(dropped_mcps),
        )

        return {
            "matches": all_matches,
            "waitlist": waitlist,
            "dropped_mcps": dropped_mcps,
        }