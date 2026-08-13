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

export interface AppWarning {
  id: string;
  source: 'upload' | 'matcher' | 'geocoding' | 'evaluation' | 'data_loader';
  severity: 'high' | 'medium' | 'info';
  title: string;
  message: string;
  timestamp: string;
  details?: string;
  category?: 'columns' | 'geographic' | 'capacity' | 'duplicates' | 'general';
}

export interface MatchRunResponse {
  matches: MatchResult[];
  waitlist: WaitlistEntry[];
  matched_count: number;
  waitlisted_count: number;
  warnings?: string[] | string;
  warning?: string;
  landmark_overlap_warning?: string;
  landmark_overlap?: number;
  [key: string]: any;
}

export interface UploadResponse {
  loaded: number;
  warnings?: string[] | string;
  warning?: string;
  message?: string;
  unresolved_fields?: string[];
  duplicates_dropped?: number;
  [key: string]: any;
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

export type ViewTab = 'dashboard' | 'matches' | 'waitlist' | 'landmarks' | 'mcps' | 'evaluation';

export interface EvaluationCriteriaConfig {
  distance_tolerance_km?: number;
  pwd_proximity_threshold_km?: number;
  enforce_gender_owner_preference_for_female_yps?: boolean;
}

export interface DistanceStats {
  n?: number;
  mean_km?: number | null;
  median_km?: number | null;
  max_km?: number | null;
  stdev_km?: number | null;
  p90_km?: number | null;
}

export interface SpecializationBreakdownItem {
  n?: number;
  manual?: Record<string, number>;
  automated?: Record<string, number>;
}

export interface EvaluationSummary {
  total_yps_evaluated: number;
  compared_count: number;
  automated_missed_count: number;
  automated_only_no_manual_reference_count: number;
  exact_match_count: number;
  equivalent_match_count: number;
  divergent_match_count: number;
  distance_metric: string;
  exact_match_rate: number;
  equivalent_or_better_rate: number;
  avg_distance_delta_km: number | null;
  automated_closer_or_equal_rate: number | null;
  manual_distance_stats?: DistanceStats | null;
  automated_distance_stats?: DistanceStats | null;
  manual_trade_compliance_rate: number | null;
  automated_trade_compliance_rate: number | null;
  manual_pwd_proximity_rate: number | null;
  automated_pwd_proximity_rate: number | null;
  specialization_breakdown?: Record<string, SpecializationBreakdownItem> | null;
  manual_capacity_violations?: Record<string, number>;
  automated_capacity_violations?: Record<string, number>;
  unresolved_yp_ids?: string[];
}

export interface EvaluationRow {
  yp_id: string;
  yp_skill?: string | null;
  yp_gender?: string | null;
  yp_is_pwd?: boolean | null;
  manual_mcp_id?: string | null;
  automated_mcp_id?: string | null;
  status: string;
  exact_match?: boolean | null;
  manual_trade_compatible?: boolean | null;
  automated_trade_compatible?: boolean | null;
  manual_specialization_exact?: boolean | null;
  automated_specialization_exact?: boolean | null;
  manual_mcp_skill?: string | null;
  automated_mcp_skill?: string | null;
  manual_specialization_class?: string | null;
  automated_specialization_class?: string | null;
  manual_distance_km?: number | null;
  automated_distance_km?: number | null;
  distance_delta_km?: number | null;
  automated_travel_time_reported?: number | null;
  manual_gender_preference_met?: boolean | null;
  automated_gender_preference_met?: boolean | null;
  manual_pwd_proximity_ok?: boolean | null;
  automated_pwd_proximity_ok?: boolean | null;
  verdict: string;
}

export interface EvaluationReport {
  summary: EvaluationSummary;
  rows: EvaluationRow[];
  config_used: EvaluationCriteriaConfig;
}
