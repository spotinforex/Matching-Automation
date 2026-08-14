import { HealthResponse, MatchRunResponse, UploadResponse, EvaluationReport } from '../types';

export const DEFAULT_BACKEND_URL = 'http://localhost:8000';

export class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string = DEFAULT_BACKEND_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public async checkHealth(): Promise<{ ok: boolean; statusText: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (response.ok) {
        const data: HealthResponse = await response.json();
        return { ok: true, statusText: `Connected to FastAPI (${data.status || 'ok'})` };
      } else {
        return { ok: false, statusText: `HTTP Error ${response.status}: ${response.statusText}` };
      }
    } catch (err: any) {
      return {
        ok: false,
        statusText: `Cannot reach ${this.baseUrl} (${err.message || 'Network Error'})`
      };
    }
  }

  private async parseResponseError(response: Response, defaultPrefix: string): Promise<Error> {
    const errorText = await response.text();
    let detailMessage = errorText;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed && parsed.detail) {
        detailMessage = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail);
      }
    } catch {
      // Keep raw errorText if not JSON
    }
    return new Error(detailMessage || `${defaultPrefix}: ${response.statusText}`);
  }

  public async uploadYP(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/upload/yp`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw await this.parseResponseError(response, 'YP Upload failed');
    }

    return await response.json();
  }

  public async uploadMCP(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/upload/mcp`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw await this.parseResponseError(response, 'MCP Upload failed');
    }

    return await response.json();
  }

  public async runMatch(
    hopLimit: number = 10,
    matchCap?: number | null,
    shortlistSize: number = 10
  ): Promise<MatchRunResponse> {
    const params = new URLSearchParams();
    params.append('HOP_LIMIT', hopLimit.toString());
    if (matchCap !== undefined && matchCap !== null && !isNaN(matchCap) && matchCap > 0) {
      params.append('MATCH_CAP', matchCap.toString());
    }
    params.append('SHORTLIST_SIZE', shortlistSize.toString());

    const response = await fetch(`${this.baseUrl}/match/run?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Match run failed: ${errorText || response.statusText}`);
    }

    return await response.json();
  }

  public async exportResults(): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/match/export`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Export failed: ${errorText || response.statusText}`);
    }

    return await response.blob();
  }

  public async compareEvaluation(
    manualFile: File,
    criteriaConfigJson?: string | Record<string, any>
  ): Promise<EvaluationReport> {
    const formData = new FormData();
    formData.append('manual_match_file', manualFile);

    const queryParams = new URLSearchParams();

    let configObj: Record<string, any> = {};
    if (typeof criteriaConfigJson === 'string') {
      try {
        configObj = JSON.parse(criteriaConfigJson);
      } catch {
        // ignore invalid json string
      }
      formData.append('criteria_config_json', criteriaConfigJson);
      formData.append('criteria_config', criteriaConfigJson);
      formData.append('config_json', criteriaConfigJson);
      formData.append('config', criteriaConfigJson);
    } else if (criteriaConfigJson && typeof criteriaConfigJson === 'object') {
      configObj = criteriaConfigJson;
      const jsonStr = JSON.stringify(criteriaConfigJson);
      formData.append('criteria_config_json', jsonStr);
      formData.append('criteria_config', jsonStr);
      formData.append('config_json', jsonStr);
      formData.append('config', jsonStr);
    }

    Object.keys(configObj).forEach((key) => {
      const val = String(configObj[key]);
      formData.append(key, val);
      queryParams.append(key, val);
    });

    const queryString = queryParams.toString();
    const url = `${this.baseUrl}/evaluation/compare${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Evaluation failed: ${errorText || response.statusText}`);
    }

    return await response.json();
  }

  public async exportEvaluationResults(): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/evaluation/export`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Evaluation export failed: ${errorText || response.statusText}`);
    }

    return await response.blob();
  }
}

export const apiService = new ApiService();


