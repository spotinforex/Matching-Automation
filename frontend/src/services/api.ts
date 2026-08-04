import { HealthResponse, MatchRunResponse, UploadResponse } from '../types';

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

  public async uploadYP(file: File): Promise<UploadResponse> {
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

  public async runMatch(hopLimit: number = 3): Promise<MatchRunResponse> {
    const response = await fetch(`${this.baseUrl}/match/run?HOP_LIMIT=${hopLimit}`, {
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
      throw new Error(`Export failed: ${response.statusText}`);
    }

    return await response.blob();
  }
}

export const apiService = new ApiService();

