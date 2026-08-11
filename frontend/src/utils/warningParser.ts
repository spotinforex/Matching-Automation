import { AppWarning, UploadResponse, MatchRunResponse, EvaluationReport } from '../types';

export function extractUploadWarnings(
  res: UploadResponse,
  fileType: 'YP' | 'MCP',
  fileName: string
): AppWarning[] {
  const warnings: AppWarning[] = [];
  const now = new Date().toLocaleTimeString();

  // 1. Direct warnings array / string
  if (res.warnings) {
    const list = Array.isArray(res.warnings) ? res.warnings : [String(res.warnings)];
    list.forEach((msg, idx) => {
      warnings.push({
        id: `upload-${fileType.toLowerCase()}-raw-${Date.now()}-${idx}`,
        source: 'upload',
        severity: msg.toLowerCase().includes('required') || msg.toLowerCase().includes('drop') ? 'high' : 'medium',
        title: `${fileType} Ingestion Warning (${fileName})`,
        message: msg,
        timestamp: now,
        category: msg.toLowerCase().includes('column') ? 'columns' : msg.toLowerCase().includes('duplicate') ? 'duplicates' : 'general',
      });
    });
  }

  // 2. Direct warning string
  if (res.warning) {
    warnings.push({
      id: `upload-${fileType.toLowerCase()}-warn-${Date.now()}`,
      source: 'upload',
      severity: 'medium',
      title: `${fileType} Data Quality Warning`,
      message: res.warning,
      timestamp: now,
      category: 'general',
    });
  }

  // 3. Duplicates dropped
  if (res.duplicates_dropped && res.duplicates_dropped > 0) {
    warnings.push({
      id: `upload-${fileType.toLowerCase()}-dup-${Date.now()}`,
      source: 'data_loader',
      severity: 'medium',
      title: `Duplicate Records Dropped in ${fileType} File`,
      message: `${res.duplicates_dropped} duplicate record(s) were automatically dropped from ${fileName} to prevent ID collisions.`,
      timestamp: now,
      category: 'duplicates',
    });
  }

  // 4. Unresolved fields
  if (res.unresolved_fields && res.unresolved_fields.length > 0) {
    warnings.push({
      id: `upload-${fileType.toLowerCase()}-unres-${Date.now()}`,
      source: 'data_loader',
      severity: 'high',
      title: `Unresolved Optional/Gating Fields in ${fileType} File`,
      message: `Fields [${res.unresolved_fields.join(', ')}] could not be resolved with exact confidence in ${fileName}. Filtering or secondary matching logic may be skipped for these fields.`,
      timestamp: now,
      category: 'columns',
    });
  }

  return warnings;
}

export function extractMatchWarnings(res: MatchRunResponse): AppWarning[] {
  const warnings: AppWarning[] = [];
  const now = new Date().toLocaleTimeString();

  // 1. Explicit warnings array or string
  if (res.warnings) {
    const list = Array.isArray(res.warnings) ? res.warnings : [String(res.warnings)];
    list.forEach((msg, idx) => {
      warnings.push({
        id: `match-raw-${Date.now()}-${idx}`,
        source: 'matcher',
        severity: msg.toLowerCase().includes('overlap') || msg.toLowerCase().includes('failed') ? 'high' : 'medium',
        title: `Matching Engine Warning`,
        message: msg,
        timestamp: now,
        category: msg.toLowerCase().includes('landmark') || msg.toLowerCase().includes('location') ? 'geographic' : 'general',
      });
    });
  }

  if (res.warning) {
    warnings.push({
      id: `match-warn-${Date.now()}`,
      source: 'matcher',
      severity: 'medium',
      title: `Matching Engine Execution Notice`,
      message: res.warning,
      timestamp: now,
      category: 'general',
    });
  }

  // 2. Landmark overlap warning
  if (res.landmark_overlap_warning) {
    warnings.push({
      id: `match-landmark-overlap-${Date.now()}`,
      source: 'matcher',
      severity: 'high',
      title: `Geographic Landmark Vocabulary Mismatch`,
      message: res.landmark_overlap_warning,
      timestamp: now,
      category: 'geographic',
      details: 'Landmark matching uses exact string comparisons after lowercasing. Ensure YP residential landmark clusters match MCP center cluster names in source Excel files.',
    });
  } else if (typeof res.landmark_overlap === 'number' && res.landmark_overlap < 0.5) {
    warnings.push({
      id: `match-landmark-overlap-calc-${Date.now()}`,
      source: 'matcher',
      severity: 'high',
      title: `Low Geographic Landmark Overlap (${(res.landmark_overlap * 100).toFixed(0)}%)`,
      message: `Only ${(res.landmark_overlap * 100).toFixed(0)}% of distinct landmark cluster values are shared between YP participants and MCP workshop centers. Most YPs will fail exact landmark matching.`,
      timestamp: now,
      category: 'geographic',
    });
  }

  // 3. High waitlist ratio warning
  const totalYp = res.matched_count + res.waitlisted_count;
  if (totalYp > 0) {
    const waitlistPct = (res.waitlisted_count / totalYp) * 100;
    if (waitlistPct > 15) {
      warnings.push({
        id: `match-high-waitlist-${Date.now()}`,
        source: 'matcher',
        severity: waitlistPct > 40 ? 'high' : 'medium',
        title: `High Waitlist Proportion (${waitlistPct.toFixed(1)}%)`,
        message: `${res.waitlisted_count} out of ${totalYp} YP participants (${waitlistPct.toFixed(1)}%) were placed on the waitlist. Consider increasing hop limit, raising MCP match cap, or adding capacity in high-demand clusters.`,
        timestamp: now,
        category: 'capacity',
      });
    }
  }

  return warnings;
}

export function extractEvaluationWarnings(report: EvaluationReport): AppWarning[] {
  const warnings: AppWarning[] = [];
  const now = new Date().toLocaleTimeString();

  if (report.summary.unresolved_yp_ids && report.summary.unresolved_yp_ids.length > 0) {
    warnings.push({
      id: `eval-unresolved-${Date.now()}`,
      source: 'evaluation',
      severity: 'high',
      title: `Unresolved Participant IDs in Evaluation Comparison`,
      message: `${report.summary.unresolved_yp_ids.length} YP participant ID(s) in the manual reference sheet could not be mapped to automated run records.`,
      timestamp: now,
      category: 'columns',
      details: `Unresolved IDs: ${report.summary.unresolved_yp_ids.slice(0, 10).join(', ')}${
        report.summary.unresolved_yp_ids.length > 10 ? '...' : ''
      }`,
    });
  }

  // Check for capacity violations in evaluation
  if (report.summary.automated_capacity_violations && Object.keys(report.summary.automated_capacity_violations).length > 0) {
    const violations = Object.entries(report.summary.automated_capacity_violations);
    warnings.push({
      id: `eval-cap-violation-${Date.now()}`,
      source: 'evaluation',
      severity: 'high',
      title: `MCP Capacity Over-Allocation Detected in ${violations.length} Center(s)`,
      message: `Automated match allocated YPs beyond recommended capacity limits for centers: ${violations
        .map(([id, count]) => `${id} (+${count})`)
        .join(', ')}.`,
      timestamp: now,
      category: 'capacity',
    });
  }

  return warnings;
}
