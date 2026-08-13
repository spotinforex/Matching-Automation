import logging
import math
import random
import time
from collections import defaultdict

logger = logging.getLogger(__name__)


class Matcher:

    def __init__(self, distance_service, shortlist_size=10, random_seed=42):
        self.distance = distance_service
        self.shortlist_size = shortlist_size
        self.route_cache = {}
        # A dedicated Random instance (rather than calling the `random`
        # module functions directly) means tie-break choices are
        # reproducible when random_seed is set — useful for debugging why
        # two runs on the same input data produced different match
        # assignments. Leave random_seed=None for normal non-deterministic
        # behavior.
        self._rng = random.Random(random_seed)

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

        # Cache key is (address, landmark), not address alone. address alone
        # would let two different people who share an address (or both have
        # a blank one) but different landmarks silently reuse whichever
        # person's landmark-fallback result got cached first — the second
        # person's own landmark would never actually be consulted.
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

            cache_key = (person.address, person.landmark)
            if cache_key not in cache:
                try:
                    cache[cache_key] = self.distance.geocode(
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

            person.latitude, person.longitude = cache[cache_key]
            resolved += 1

        elapsed = time.monotonic() - start
        logger.info(
            "geocode_missing() done in %.2fs: %d resolved, %d failed (unresolvable), "
            "%d unique address/landmark pairs geocoded (%.2fs/pair avg)",
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

    def _priority_key(self, person):
        gender = str(getattr(person, "gender", "") or "").strip().lower()
        is_pwd = bool(getattr(person, "is_pwd", False))
        gender_rank = 0 if gender == "female" else 1 if gender == "male" else 2
        return (0 if is_pwd else 1, gender_rank)

    def trade_matches(self, yp_trade, mcp_trade):
        """
        yp_trade / mcp_trade are expected to already be canonical skill
        values produced by data_loader._resolve_trade() (e.g. "garment_female",
        "footwear_both", "leather_bag", "leather_any", "unknown") — this
        function does NOT re-derive them from raw text. Re-parsing raw trade
        text here used to duplicate (and drift from) the loader's
        classification logic; trusting the loader's canonical value keeps
        there being exactly one place that decides what a trade string means.
        """
        yp_trade = str(yp_trade or "").strip().lower() or "unknown"
        mcp_trade = str(mcp_trade or "").strip().lower() or "unknown"

        # "unknown" means classification genuinely failed. run() routes
        # anyone with an unknown trade to the waitlist/dropped list before
        # matching ever starts (see run()), so this branch is a defensive
        # fail-closed fallback for anyone who somehow reaches trade_matches()
        # anyway (e.g. direct/unit-test callers) — unknown never auto-matches
        # anything, not even another unknown. MUST be checked before the
        # general equality shortcut below, since "unknown" == "unknown"
        # would otherwise return True before this branch ever runs.
        if yp_trade == "unknown" or mcp_trade == "unknown":
            return False

        if yp_trade == mcp_trade:
            return True

        # "leather_any" (unspecified leather subtype) is compatible with any
        # specific leather subtype — but ONLY within the leather family.
        if yp_trade == "leather_any" or mcp_trade == "leather_any":
            return yp_trade.startswith("leather_") and mcp_trade.startswith("leather_")

        if yp_trade.startswith("garment_") and mcp_trade.startswith("garment_"):
            yp_gender = yp_trade.split("_", 1)[1]
            mcp_gender = mcp_trade.split("_", 1)[1]
            if yp_gender == "both" or mcp_gender == "both":
                return True
            return yp_gender == mcp_gender

        if yp_trade.startswith("footwear_") and mcp_trade.startswith("footwear_"):
            yp_gender = yp_trade.split("_", 1)[1]
            mcp_gender = mcp_trade.split("_", 1)[1]
            if yp_gender == "both" or mcp_gender == "both":
                return True
            return yp_gender == mcp_gender

        if yp_trade.startswith("leather_") and mcp_trade.startswith("leather_"):
            return yp_trade == mcp_trade

        return False

    def _haversine_distance(self, origin, destination):
        lat1, lon1 = origin
        lat2, lon2 = destination
        radius = 6371.0
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        a = (
            math.sin(delta_phi / 2) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return radius * c

    def _get_route_time(self, yp, mcp):
        key = (
            round(yp.latitude, 6),
            round(yp.longitude, 6),
            round(mcp.latitude, 6),
            round(mcp.longitude, 6),
        )
        if key in self.route_cache:
            return self.route_cache[key]

        t = self.distance.travel_time(
            (yp.latitude, yp.longitude),
            (mcp.latitude, mcp.longitude),
        )
        self.route_cache[key] = t
        return t

    def _build_candidate_pairs(self, yp_group, mcp_group, shortlist_size=None):
        shortlist_size = shortlist_size if shortlist_size is not None else self.shortlist_size
        pairs = []
        skipped_skill_mismatch = 0

        for yp in yp_group:
            priority_key = self._priority_key(yp)
            yp_coords = (yp.latitude, yp.longitude)

            compatible_mcps = [
                mcp for mcp in mcp_group
                if self.trade_matches(yp.skill, mcp.skill)
            ]

            if not compatible_mcps:
                skipped_skill_mismatch += len(mcp_group)
                continue

            scored = []
            for mcp in compatible_mcps:
                distance_km = self._haversine_distance(
                    yp_coords,
                    (mcp.latitude, mcp.longitude),
                )
                scored.append((distance_km, mcp))

            scored.sort(key=lambda entry: entry[0])

            shortlist = [entry[1] for entry in scored[:shortlist_size]]

            if not shortlist:
                continue

            for mcp in shortlist:
                t = self._get_route_time(yp, mcp)
                pairs.append((priority_key, t, yp.id, mcp.id))

        pairs.sort(key=lambda x: (x[0][0], x[0][1], x[1]))

        logger.debug(
            "build_cost_matrix() yps=%d mcps=%d -> %d pairs (skipped %d skill mismatches)",
            len(yp_group), len(mcp_group), len(pairs), skipped_skill_mismatch,
        )

        return pairs

    def build_cost_matrix(self, yp_group, mcp_group):
        return self._build_candidate_pairs(yp_group, mcp_group)

    ####################################################################
    # Greedy matching
    ####################################################################

    def greedy_match(
        self,
        yp_group,
        mcp_group,
        round_number,
        match_cap=None,
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

        matched_this_round = 0

        for priority_key, travel, yp_id, mcp_id in matrix:
            if match_cap is not None and matched_this_round >= match_cap:
                break

            if yp_id in assigned:
                continue

            mcp = mcp_lookup[mcp_id]

            if load[mcp_id] >= mcp.capacity:
                continue

            same_time = [
                p for p in matrix
                if p[1] == travel and p[2] == yp_id
            ]

            if len(same_time) > 1:
                same_time = [
                    s for s in same_time
                    if load[s[3]] < mcp_lookup[s[3]].capacity
                ]

                if not same_time:
                    logger.debug(
                        "greedy_match() yp_id=%s: all tied MCPs full at travel=%.1f, skipping",
                        yp_id, travel,
                    )
                    continue

                same_time.sort(key=lambda x: load[x[3]])

                best_load = load[same_time[0][3]]
                candidates = [
                    s for s in same_time
                    if load[s[3]] == best_load
                ]

                _, travel, yp_id, mcp_id = self._rng.choice(candidates)
                mcp = mcp_lookup[mcp_id]

                logger.debug(
                    "greedy_match() tie-break for yp_id=%s: %d candidates at load=%d, picked mcp_id=%s",
                    yp_id, len(candidates), best_load, mcp_id,
                )

            assigned.add(yp_id)
            load[mcp_id] += 1
            matched_this_round += 1

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
        hop_limit=3,
        match_cap=None,
        shortlist_size=None,
    ):

        logger.info("run() starting: %d yps, %d mcps, hop_limit=%d, match_cap=%s, shortlist_size=%s", len(yps), len(mcps), hop_limit, match_cap, shortlist_size)

        run_start = time.monotonic()
        all_matches = []
        waitlist = []
        dropped_mcps = []

        ####################################################
        # Trade classification — anyone whose trade couldn't be
        # classified (data_loader emitted "unknown") is pulled out
        # before geocoding/matching ever starts. Same rationale as
        # the geocode-failure handling below: give a clear, specific
        # reason up front rather than let them silently fail every
        # trade_matches() check and land on the waitlist with a vague
        # "no capacity within hop limit".
        ####################################################

        unknown_trade_yps = [
            yp for yp in yps
            if str(getattr(yp, "skill", "") or "").strip().lower() == "unknown"
        ]
        unknown_trade_mcps = [
            mcp for mcp in mcps
            if str(getattr(mcp, "skill", "") or "").strip().lower() == "unknown"
        ]

        if unknown_trade_yps:
            unknown_yp_ids = {id(p) for p in unknown_trade_yps}
            yps = [p for p in yps if id(p) not in unknown_yp_ids]
            for yp in unknown_trade_yps:
                waitlist.append({
                    "yp_id": yp.id,
                    "reason": "Trade area is unknown",
                })
            logger.info(
                "run() removed %d yp(s) with unclassified trade -> waitlist",
                len(unknown_trade_yps),
            )

        if unknown_trade_mcps:
            unknown_mcp_ids = {id(p) for p in unknown_trade_mcps}
            mcps = [p for p in mcps if id(p) not in unknown_mcp_ids]
            for mcp in unknown_trade_mcps:
                dropped_mcps.append({
                    "mcp_id": mcp.id,
                    "reason": "Trade area is unknown",
                })
            logger.warning(
                "run() dropping %d mcp(s) with unclassified trade from the matching pool: %s",
                len(unknown_trade_mcps), [m.id for m in unknown_trade_mcps],
            )

        ####################################################
        # Geocoding — anyone unresolvable is pulled out before
        # matching starts, rather than crashing mid-match with
        # None coordinates.
        ####################################################

        geocode_failed = self.geocode_missing(yps, mcps)
        geocode_elapsed = time.monotonic() - run_start

        if geocode_failed:
            failed_ids = {id(p) for p in geocode_failed}
            # Bucket failures into YPs vs MCPs by object identity, not by
            # `in` (value) equality. If the underlying models ever compare
            # equal by field values (e.g. a pydantic BaseModel's default
            # __eq__), `p in yps` / `p in mcps` could misclassify — identity
            # sets sidestep that entirely regardless of how __eq__ is
            # implemented on the models.
            original_yp_ids = {id(p) for p in yps}
            original_mcp_ids = {id(p) for p in mcps}
            failed_yps = [p for p in geocode_failed if id(p) in original_yp_ids]
            failed_mcps = [p for p in geocode_failed if id(p) in original_mcp_ids]

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
        matched_ids = set()
        remaining_match_cap = match_cap
        assigned_load = {m.id: 0 for m in mcps}

        ####################################################
        # Round 1
        ####################################################

        logger.info("run() round 1: matching within landmark, %d landmarks", len(yp_groups))

        for landmark in yp_groups:

            matches, left, loads = self.greedy_match(
                yp_groups[landmark],
                mcp_groups.get(landmark, []),
                1,
                match_cap=remaining_match_cap,
            )

            all_matches.extend(matches)
            matched_ids.update(m["yp_id"] for m in matches)
            unmatched.extend(left)

            for mcp_id, used in loads.items():
                remaining_capacity[mcp_id] -= used
                assigned_load[mcp_id] += used

            if remaining_match_cap is not None:
                remaining_match_cap = max(0, remaining_match_cap - len(matches))
                if remaining_match_cap == 0:
                    logger.info("run() match cap reached after round 1; stopping further matching")
                    unmatched = [yp for yp in yps if yp.id not in matched_ids]
                    break

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

            ordered_unmatched = sorted(unmatched, key=lambda yp: self._priority_key(yp))
            next_round = []
            placed_this_hop = 0

            if remaining_match_cap is not None and remaining_match_cap <= 0:
                break

            for yp in ordered_unmatched:

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
                    and self.trade_matches(yp.skill, m.skill)
                ]

                if not candidate_mcps:
                    next_round.append(yp)
                    continue

                scored = []
                for mcp in candidate_mcps:
                    distance_km = self._haversine_distance(
                        (yp.latitude, yp.longitude),
                        (mcp.latitude, mcp.longitude),
                    )
                    scored.append((distance_km, mcp))

                scored.sort(key=lambda entry: entry[0])
                effective_shortlist_size = shortlist_size if shortlist_size is not None else self.shortlist_size
                shortlist = [entry[1] for entry in scored[:effective_shortlist_size]]

                if not shortlist:
                    next_round.append(yp)
                    continue

                best_time = float("inf")
                best_load = float("inf")
                best_candidates = []

                for mcp in shortlist:
                    t = self._get_route_time(yp, mcp)
                    current_load = assigned_load[mcp.id]

                    if t < best_time:
                        best_time = t
                        best_load = current_load
                        best_candidates = [mcp]
                    elif t == best_time:
                        if current_load < best_load:
                            best_load = current_load
                            best_candidates = [mcp]
                        elif current_load == best_load:
                            best_candidates.append(mcp)

                if not best_candidates:
                    next_round.append(yp)
                    continue

                best = self._rng.choice(best_candidates)
                remaining_capacity[best.id] -= 1
                assigned_load[best.id] += 1
                placed_this_hop += 1

                all_matches.append({
                    "yp_id": yp.id,
                    "mcp_id": best.id,
                    "landmark": best.landmark,
                    "travel_time": best_time,
                    "round": hop + 1
                })
                matched_ids.add(yp.id)
                if remaining_match_cap is not None:
                    remaining_match_cap = max(0, remaining_match_cap - 1)
                    if remaining_match_cap == 0:
                        logger.info("run() match cap reached during hop matching; stopping further matching")
                        unmatched = [yp for yp in yps if yp.id not in matched_ids]
                        break

            if remaining_match_cap is not None and remaining_match_cap <= 0:
                unmatched = [yp for yp in yps if yp.id not in matched_ids]
                break

            unmatched = next_round
            logger.info(
                "run() hop %d done: %d placed, %d still unmatched",
                hop, placed_this_hop, len(unmatched),
            )

        ####################################################
        # Waitlist
        ####################################################

        if match_cap is not None and len(all_matches) >= match_cap:
            waitlist_reason = "Match cap reached"
        else:
            waitlist_reason = "No capacity within hop limit"

        for yp in unmatched:
            waitlist.append({
                "yp_id": yp.id,
                "reason": waitlist_reason
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