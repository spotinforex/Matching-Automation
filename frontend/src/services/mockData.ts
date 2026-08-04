import { MatchResult, WaitlistEntry, MatchRunResponse } from '../types';

export const PROMPT_MATCHES_SAMPLE: MatchResult[] = [
  {
    yp_id: "YP_0006",
    mcp_id: "MCP/BTS/279",
    landmark: "ariaria",
    travel_time: 16.466666666666665,
    round: 1
  },
  {
    yp_id: "YP_0007",
    mcp_id: "MCP/BTS/279",
    landmark: "ariaria",
    travel_time: 19.866666666666667,
    round: 1
  },
  {
    yp_id: "YP_0009",
    mcp_id: "MCP/BTS/224",
    landmark: "ngwa road",
    travel_time: 14.35,
    round: 1
  },
  {
    yp_id: "YP_0000",
    mcp_id: "MCP/BTS/246",
    landmark: "new umuahia road",
    travel_time: 4.166666666666667,
    round: 2
  },
  {
    yp_id: "YP_0001",
    mcp_id: "MCP/BTS/224",
    landmark: "ngwa road",
    travel_time: 10.583333333333334,
    round: 2
  },
  {
    yp_id: "YP_0002",
    mcp_id: "MCP/BTS/224",
    landmark: "ngwa road",
    travel_time: 91.58333333333333,
    round: 2
  },
  {
    yp_id: "YP_0003",
    mcp_id: "MCP/BTS/224",
    landmark: "ngwa road",
    travel_time: 14.35,
    round: 2
  },
  {
    yp_id: "YP_0005",
    mcp_id: "MCP/BTS/224",
    landmark: "ngwa road",
    travel_time: 10.75,
    round: 2
  },
  {
    yp_id: "YP_0008",
    mcp_id: "MCP/BTS/216",
    landmark: "old express",
    travel_time: 3.55,
    round: 2
  }
];

export const PROMPT_WAITLIST_SAMPLE: WaitlistEntry[] = [
  {
    yp_id: "YP_0004",
    reason: "No capacity within hop limit",
    landmark: "ariaria"
  }
];

const LANDMARKS = [
  "ariaria",
  "ngwa road",
  "new umuahia road",
  "old express",
  "osisioma junction",
  "factory road",
  "azikiwe road",
  "waterside aba",
  "ogbor hill",
  "faulks road"
];

// Generates a comprehensive realistic dataset of 1,064 YPs and 236 MCPs
export function generateFullDataset(totalYps = 1064, totalMcps = 236): MatchRunResponse {
  const matches: MatchResult[] = [...PROMPT_MATCHES_SAMPLE];
  const waitlist: WaitlistEntry[] = [...PROMPT_WAITLIST_SAMPLE];

  const usedYpIds = new Set(matches.map(m => m.yp_id).concat(waitlist.map(w => w.yp_id)));

  // Generate remaining YPs up to totalYps
  for (let i = 10; i < totalYps; i++) {
    const ypId = `YP_${i.toString().padStart(4, '0')}`;
    if (usedYpIds.has(ypId)) continue;

    // 98.5% get matched, 1.5% go to waitlist
    const isMatched = Math.random() > 0.018;
    const landmark = LANDMARKS[Math.floor(Math.random() * LANDMARKS.length)];

    if (isMatched) {
      // MCP assignment
      const mcpNum = Math.floor(Math.random() * totalMcps) + 1;
      const mcpId = `MCP/BTS/${mcpNum.toString().padStart(3, '0')}`;

      // Round distribution: Round 1 (75%), Round 2 (20%), Round 3 (5%)
      const randRound = Math.random();
      let round = 1;
      let travelTime = 3 + Math.random() * 22; // default 3-25 min

      if (randRound > 0.75 && randRound <= 0.95) {
        round = 2;
        travelTime = 12 + Math.random() * 35; // round 2: 12-47 min
      } else if (randRound > 0.95) {
        round = 3;
        travelTime = 30 + Math.random() * 65; // round 3: 30-95 min
      }

      matches.push({
        yp_id: ypId,
        mcp_id: mcpId,
        landmark: landmark,
        travel_time: parseFloat(travelTime.toFixed(2)),
        round: round
      });
    } else {
      const reasons = [
        "No capacity within hop limit",
        "Geocoding landmark unreachable",
        "Travel time exceeds maximum threshold (>120 mins)",
        "Invalid YP coordinate bounds"
      ];
      waitlist.push({
        yp_id: ypId,
        reason: reasons[Math.floor(Math.random() * reasons.length)],
        landmark: landmark
      });
    }
  }

  return {
    matches,
    waitlist,
    matched_count: matches.length,
    waitlisted_count: waitlist.length
  };
}
