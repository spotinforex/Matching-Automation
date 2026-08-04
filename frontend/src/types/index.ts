export interface MatchResult {
  yp_id: string;
  mcp_id: string;
  landmark: string;
  travel_time: number; // in minutes
  round: number;
}

export interface WaitlistEntry {
  yp_id: string;
  reason: string;
  landmark?: string;
}

export interface MatchRunResponse {
  matches: MatchResult[];
  waitlist: WaitlistEntry[];
  matched_count: number;
  waitlisted_count: number;
}

export interface UploadResponse {
  loaded: number;
}

export interface HealthResponse {
  status: string;
}

export interface YPRecord {
  yp_id: string;
  landmark: string;
  latitude?: number;
  longitude?: number;
}

export interface MCPRecord {
  mcp_id: string;
  landmark: string;
  capacity?: number;
  latitude?: number;
  longitude?: number;
}

export interface PipelineStep {
  id: string;
  title: string;
  description: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  timestamp?: string;
}

export type ViewTab = 'dashboard' | 'matches' | 'waitlist' | 'landmarks' | 'mcps';
