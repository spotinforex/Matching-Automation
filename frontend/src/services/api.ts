import { HealthResponse, MatchRunResponse, UploadResponse } from '../types';
import { generateFullDataset, PROMPT_MATCHES_SAMPLE, PROMPT_WAITLIST_SAMPLE } from './mockData';

export const DEFAULT_BACKEND_URL = 'http://localhost:8000';

export class ApiService {
  private baseUrl: string;
  private isMockMode: boolean = false;

  constructor(baseUrl: string = DEFAULT_BACKEND_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setMockMode(enabled: boolean) {
    this.isMockMode = enabled;
  }

  public getIsMockMode(): boolean {
    return this.isMockMode;
  }

  public async checkHealth(): Promise<{ ok: boolean; statusText: string }> {
    if (this.isMockMode) {
      return { ok: true, statusText: 'Mock API Mode (Simulation Active)' };
    }

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

  public async uploadYP(file: File): Promise<UploadResponse> {
    if (this.isMockMode) {
      // Simulate network delay and return expected sample response
      await new Promise(res => setTimeout(res, 800));
      return { loaded: 1064 };
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/upload/yp`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`YP Upload failed: ${errorText || response.statusText}`);
    }

    return await response.json();
  }

  public async uploadMCP(file: File): Promise<UploadResponse> {
    if (this.isMockMode) {
      await new Promise(res => setTimeout(res, 800));
      return { loaded: 236 };
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/upload/mcp`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MCP Upload failed: ${errorText || response.statusText}`);
    }

    return await response.json();
  }

  public async runMatch(): Promise<MatchRunResponse> {
    if (this.isMockMode) {
      await new Promise(res => setTimeout(res, 1200));
      return generateFullDataset(1064, 236);
    }

    const response = await fetch(`${this.baseUrl}/match/run`, {
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
    if (this.isMockMode) {
      await new Promise(res => setTimeout(res, 500));
      // Create simple CSV blob for simulation export
      const matchesData = generateFullDataset();
      let csv = 'yp_id,mcp_id,landmark,travel_time_mins,round\n';
      matchesData.matches.forEach(m => {
        csv += `"${m.yp_id}","${m.mcp_id}","${m.landmark}",${m.travel_time},${m.round}\n`;
      });
      return new Blob([csv], { type: 'text/csv' });
    }

    const response = await fetch(`${this.baseUrl}/match/export`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    return await response.blob();
  }
}

export const apiService = new ApiService();
