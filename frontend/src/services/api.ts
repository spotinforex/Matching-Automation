import {
  HealthResponse,
  MatchRunResponse,
  UploadResponse,
  EvaluationReport,
  AuthUser,
  LoginResponse,
  AuditLogsResponse,
  BackendEndpoint,
  AdminRole,
  AdminRoleCreateRequest,
  AdminUser,
  AdminUserCreateRequest,
  AdminUserUpdateRequest,
} from '../types';

export const DEFAULT_BACKEND_URL = 'https://yp-to-mcp-matching-automation-195927873682.europe-west1.run.app';
const TOKEN_STORAGE_KEY = 'mcp_auth_token';

export class ApiService {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = DEFAULT_BACKEND_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    try {
      this.token = localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      this.token = null;
    }
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setToken(token: string | null) {
    this.token = token;
    try {
      if (token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // Ignore storage write errors (e.g. private mode or iframe storage blocks)
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  public isAuthenticated(): boolean {
    return !!this.token;
  }

  private getAuthHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...customHeaders };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token.trim()}`;
    }
    return headers;
  }

  private async fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
    const customHeaders = (init.headers as Record<string, string>) || {};
    const headers = this.getAuthHeaders(customHeaders);
    return await fetch(url, {
      ...init,
      headers,
      credentials: 'include',
    });
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
    if (response.status === 401) {
      const text = await response.text().catch(() => '');
      let detail = 'Authentication required: please log in with your credentials or token.';
      try {
        const parsed = JSON.parse(text);
        if (parsed?.detail) detail = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail);
      } catch {}
      return new Error(`[401 Unauthorized] ${detail}`);
    }

    if (response.status === 403) {
      const text = await response.text().catch(() => '');
      let detail = 'Permission denied: Your account lacks the required scope or permission for this action.';
      try {
        const parsed = JSON.parse(text);
        if (parsed?.detail) detail = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail);
      } catch {}
      return new Error(`[403 Forbidden] ${detail}`);
    }

    const errorText = await response.text();
    let detailMessage = errorText;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed && parsed.detail) {
        if (Array.isArray(parsed.detail)) {
          detailMessage = parsed.detail
            .map((d: any) => {
              const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : '';
              return field ? `${field}: ${d.msg}` : d.msg || JSON.stringify(d);
            })
            .join('; ');
        } else if (typeof parsed.detail === 'string') {
          detailMessage = parsed.detail;
        } else {
          detailMessage = JSON.stringify(parsed.detail);
        }
      } else if (parsed && parsed.message) {
        detailMessage = typeof parsed.message === 'string' ? parsed.message : JSON.stringify(parsed.message);
      }
    } catch {
      // Keep raw errorText if not JSON
    }
    return new Error(detailMessage || `${defaultPrefix}: ${response.statusText}`);
  }

  // --- Auth API Endpoints ---
  public async login(usernameOrEmail: string, password: string): Promise<{ token: string; user?: AuthUser }> {
    // Attempt JSON login first (standard FastAPI body)
    let token = '';
    let user: AuthUser | undefined;

    try {
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          username: usernameOrEmail,
          email: usernameOrEmail,
          password: password,
        }),
        credentials: 'include',
      });

      if (response.ok) {
        const data: LoginResponse = await response.json();
        token = data.access_token || data.token || '';
        user = data.user;
      } else if (response.status === 422 || response.status === 400) {
        // Fallback to OAuth2 password request form (x-www-form-urlencoded)
        const formParams = new URLSearchParams();
        formParams.append('username', usernameOrEmail);
        formParams.append('password', password);

        // Try /auth/login or /auth/token
        const formResp = await fetch(`${this.baseUrl}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          body: formParams.toString(),
          credentials: 'include',
        });

        if (formResp.ok) {
          const formData: LoginResponse = await formResp.json();
          token = formData.access_token || formData.token || '';
          user = formData.user;
        } else {
          throw await this.parseResponseError(formResp, 'Login failed');
        }
      } else {
        throw await this.parseResponseError(response, 'Login failed');
      }
    } catch (err: any) {
      throw err;
    }

    if (!token) {
      throw new Error('Authentication succeeded but no access token was returned by the server.');
    }

    this.setToken(token);

    // Fetch user details if not returned directly in login response
    if (!user) {
      try {
        user = await this.getMe();
      } catch {
        // Fallback user record based on username input
        user = {
          username: usernameOrEmail,
          email: usernameOrEmail.includes('@') ? usernameOrEmail : undefined,
        };
      }
    }

    return { token, user };
  }

  public async getMe(): Promise<AuthUser> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/auth/me`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw await this.parseResponseError(response, 'Failed to fetch current user profile');
    }

    return await response.json();
  }

  public async changePassword(oldPassword: string, newPassword: string): Promise<{ message?: string; [key: string]: any }> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        current_password: oldPassword,
        old_password: oldPassword,
        new_password: newPassword,
        password: newPassword,
      }),
    });

    if (!response.ok) {
      throw await this.parseResponseError(response, 'Password change failed');
    }

    return await response.json();
  }

  public async logout(): Promise<void> {
    try {
      await this.fetchWithAuth(`${this.baseUrl}/auth/logout`, {
        method: 'POST',
      });
    } catch {
      // Ignore network errors on logout
    } finally {
      this.setToken(null);
    }
  }

  // --- Audit Logs Endpoint (requires audit_logs permission) ---
  public async getAuditLogs(params?: {
    from_time?: string | null;
    to_time?: string | null;
    action?: string | null;
    status?: string | null;
    actor_email?: string | null;
    actor_id?: number | null;
    limit?: number;
    offset?: number;
  }): Promise<AuditLogsResponse> {
    const query = new URLSearchParams();
    if (params?.from_time) query.append('from_time', params.from_time);
    if (params?.to_time) query.append('to_time', params.to_time);
    if (params?.action) query.append('action', params.action);
    if (params?.status) query.append('status', params.status);
    if (params?.actor_email) query.append('actor_email', params.actor_email);
    if (params?.actor_id != null) query.append('actor_id', params.actor_id.toString());
    query.append('limit', (params?.limit ?? 100).toString());
    query.append('offset', (params?.offset ?? 0).toString());

    const response = await this.fetchWithAuth(`${this.baseUrl}/audit/logs?${query.toString()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw await this.parseResponseError(response, 'Failed to retrieve audit logs');
    }

    return await response.json();
  }

  // --- Endpoints introspection (requires endpoints_list permission) ---
  public async getEndpoints(): Promise<BackendEndpoint[]> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/endpoints`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw await this.parseResponseError(response, 'Failed to fetch registered endpoints');
    }

    return await response.json();
  }

  // --- Admin Endpoints (STRICTLY SUPER ADMIN ONLY) ---
  public async getAdminRoles(): Promise<AdminRole[]> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/admin/roles`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw await this.parseResponseError(response, 'Failed to fetch roles');
    }

    return await response.json();
  }

  public async createAdminRole(payload: AdminRoleCreateRequest): Promise<AdminRole> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/admin/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await this.parseResponseError(response, 'Failed to create role');
    }

    return await response.json();
  }

  public async getAdminUsers(): Promise<AdminUser[]> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/admin/users`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw await this.parseResponseError(response, 'Failed to fetch users');
    }

    return await response.json();
  }

  public async createAdminUser(payload: AdminUserCreateRequest): Promise<{ user?: AdminUser; warning?: string }> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // The backend may return 201 with UserResponse, or 201 with HTTPException message if email sending failed
    const data = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 201) {
      throw await this.parseResponseError(response, 'Failed to create user');
    }

    // Check if error message was returned in 201
    if (data.detail && typeof data.detail === 'string') {
      return { warning: data.detail };
    }

    return { user: data };
  }

  public async updateAdminUser(userId: number, payload: AdminUserUpdateRequest): Promise<AdminUser> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/admin/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await this.parseResponseError(response, 'Failed to update user');
    }

    return await response.json();
  }

  public async deleteAdminUser(userId: number): Promise<void> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok && response.status !== 204) {
      throw await this.parseResponseError(response, 'Failed to delete user');
    }
  }

  // --- Core Pipeline Operations ---
  public async uploadYP(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.fetchWithAuth(`${this.baseUrl}/upload/yp`, {
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

    const response = await this.fetchWithAuth(`${this.baseUrl}/upload/mcp`, {
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

    const response = await this.fetchWithAuth(`${this.baseUrl}/match/run?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw await this.parseResponseError(response, 'Match run failed');
    }

    return await response.json();
  }

  public async exportResults(): Promise<Blob> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/match/export`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw await this.parseResponseError(response, 'Export failed');
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

    const response = await this.fetchWithAuth(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw await this.parseResponseError(response, 'Evaluation failed');
    }

    return await response.json();
  }

  public async exportEvaluationResults(): Promise<Blob> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/evaluation/export`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw await this.parseResponseError(response, 'Evaluation export failed');
    }

    return await response.blob();
  }
}

export const apiService = new ApiService();



