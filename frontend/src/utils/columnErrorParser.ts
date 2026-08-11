export interface ResolutionItem {
  field: string;
  column: string | null;
  method: 'configured' | 'alias' | 'cache' | 'fuzzy' | 'none' | string;
  confidence: number;
}

export interface ParsedColumnError {
  fileSource: string;
  requiredColumns: string[];
  resolutionAttempt: ResolutionItem[];
  actualHeaders: string[];
  rawMessage: string;
}

export function parseColumnResolutionError(rawMessage: string): ParsedColumnError | null {
  if (!rawMessage || (!rawMessage.includes('required column(s)') && !rawMessage.includes('Full resolution attempt'))) {
    return null;
  }

  try {
    // 1. Extract File Source / Header prefix
    let fileSource = 'Excel Source File';
    const fileSourceMatch = rawMessage.match(/^(.*?file.*?\):)/i) || rawMessage.match(/^(.*?:)/);
    if (fileSourceMatch) {
      fileSource = fileSourceMatch[1].trim();
    }

    // 2. Extract Required Columns
    const requiredColsMatch = rawMessage.match(/required column\(s\) \[(.*?)\]/);
    let requiredColumns: string[] = [];
    if (requiredColsMatch && requiredColsMatch[1]) {
      requiredColumns = requiredColsMatch[1]
        .split(',')
        .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    }

    // 3. Extract Resolution Attempt array
    let resolutionAttempt: ResolutionItem[] = [];
    const attemptMatch = rawMessage.match(/Full resolution attempt:\s*(\[.*?\])\.\s*Actual headers/s);
    if (attemptMatch && attemptMatch[1]) {
      try {
        let jsonStr = attemptMatch[1]
          .replace(/'/g, '"')
          .replace(/\bNone\b/g, 'null')
          .replace(/\bTrue\b/g, 'true')
          .replace(/\bFalse\b/g, 'false');
        resolutionAttempt = JSON.parse(jsonStr);
      } catch (e) {
        console.warn('Failed to JSON parse resolution attempt string:', e);
      }
    }

    // 4. Extract Actual Headers
    let actualHeaders: string[] = [];
    const headersMatch = rawMessage.match(/Actual headers in file:\s*(\[.*?\])\.\s*Call/s);
    if (headersMatch && headersMatch[1]) {
      try {
        let jsonStr = headersMatch[1]
          .replace(/'/g, '"')
          .replace(/\bNone\b/g, 'null');
        actualHeaders = JSON.parse(jsonStr);
      } catch (e) {
        // Fallback simple split if JSON parse fails
        actualHeaders = headersMatch[1]
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
      }
    }

    return {
      fileSource,
      requiredColumns,
      resolutionAttempt,
      actualHeaders,
      rawMessage,
    };
  } catch (err) {
    console.error('Error parsing column resolution message:', err);
    return null;
  }
}
