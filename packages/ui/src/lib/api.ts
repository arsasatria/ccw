import type { Config, Transformer } from '@/types';

// 日志聚合响应类型
interface GroupedLogsResponse {
  grouped: boolean;
  groups: { [reqId: string]: Array<{ timestamp: string; level: string; message: string; source?: string; reqId?: string }> };
  summary: {
    totalRequests: number;
    totalLogs: number;
    requests: Array<{
      reqId: string;
      logCount: number;
      firstLog: string;
      lastLog: string;
    }>;
  };
}

// API Client Class for handling requests with baseUrl and apikey authentication
class ApiClient {
  private baseUrl: string;
  private apiKey: string;
  private tempApiKey: string | null;

  constructor(baseUrl: string = '/api', apiKey: string = '') {
    this.baseUrl = baseUrl;
    // Load API key from localStorage if available
    this.apiKey = apiKey || localStorage.getItem('apiKey') || '';
    // Load temp API key from URL if available
    this.tempApiKey = new URLSearchParams(window.location.search).get('tempApiKey');
  }

  // Update base URL
  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  // Update API key
  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
    // Save API key to localStorage
    if (apiKey) {
      localStorage.setItem('apiKey', apiKey);
    } else {
      localStorage.removeItem('apiKey');
    }
  }

  // Update temp API key
  setTempApiKey(tempApiKey: string | null) {
    this.tempApiKey = tempApiKey;
  }

  // Create headers with API key authentication
  private createHeaders(contentType: string = 'application/json'): HeadersInit {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    // Use temp API key if available, otherwise use regular API key
    if (this.tempApiKey) {
      headers['X-Temp-API-Key'] = this.tempApiKey;
    } else if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    return headers;
  }

  // Generic fetch wrapper with base URL and authentication
  private async apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const config: RequestInit = {
      ...options,
      headers: {
        ...this.createHeaders(),
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);

      // Handle 401 Unauthorized responses. Throw a recognizable error so
      // the caller's catch block can run normally; the AppShell listens
      // for the `unauthorized` event below and navigates to /login. The
      // event is fired from a microtask after the throw so subscribers
      // that re-render on `unauthorized` don't see the API call resolve
      // before the navigation kicks in.
      if (response.status === 401) {
        localStorage.removeItem('apiKey');
        queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent('unauthorized'));
        });
        throw new Error('Unauthorized');
      }

      if (!response.ok) {
        // Try to get detailed error message from response body
        let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.error || errorData.message) {
            errorMessage = errorData.message || errorData.error || errorMessage;
          }
        } catch {
          // If parsing fails, use default error message
        }
        throw new Error(errorMessage);
      }

      if (response.status === 204) {
        return {} as T;
      }

      const text = await response.text();
      return text ? JSON.parse(text) : ({} as T);

    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  // GET request
  async get<T>(endpoint: string): Promise<T> {
    return this.apiFetch<T>(endpoint, {
      method: 'GET',
    });
  }

  // POST request
  async post<T>(endpoint: string, data: unknown): Promise<T> {
    return this.apiFetch<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // PUT request
  async put<T>(endpoint: string, data: unknown): Promise<T> {
    return this.apiFetch<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // DELETE request
  async delete<T>(endpoint: string, body?: any): Promise<T> {
    return this.apiFetch<T>(endpoint, {
      method: 'DELETE',
      body: JSON.stringify(body || {}),
    });
  }

  // API methods for configuration
  // Get current configuration
  async getConfig(): Promise<Config> {
    return this.get<Config>('/config');
  }

  // Update entire configuration
  async updateConfig(config: Config): Promise<Config> {
    return this.post<Config>('/config', config);
  }

  // Get transformers
  async getTransformers(): Promise<Transformer[]> {
    return this.get<Transformer[]>('/api/transformers');
  }

  // Add a new transformer
  async addTransformer(transformer: Transformer): Promise<Transformer> {
    return this.post<Transformer>('/api/transformers', transformer);
  }

  // Update a transformer
  async updateTransformer(index: number, transformer: Transformer): Promise<Transformer> {
    return this.post<Transformer>(`/api/transformers/${index}`, transformer);
  }

  // Delete a transformer
  async deleteTransformer(index: number): Promise<void> {
    return this.delete<void>(`/api/transformers/${index}`);
  }

  // Get configuration (new endpoint)
  async getConfigNew(): Promise<Config> {
    return this.get<Config>('/config');
  }

  // Save configuration (new endpoint)
  async saveConfig(config: Config): Promise<unknown> {
    return this.post<Config>('/config', config);
  }

  // Restart service
  async restartService(): Promise<unknown> {
    return this.post<void>('/restart', {});
  }

  // Check for updates
  async checkForUpdates(): Promise<{ hasUpdate: boolean; latestVersion?: string; changelog?: string }> {
    return this.get<{ hasUpdate: boolean; latestVersion?: string; changelog?: string }>('/update/check');
  }

  // Perform update
  async performUpdate(): Promise<{ success: boolean; message: string }> {
    return this.post<{ success: boolean; message: string }>('/api/update/perform', {});
  }

  // Get log files list
  async getLogFiles(): Promise<Array<{ name: string; path: string; size: number; lastModified: string }>> {
    return this.get<Array<{ name: string; path: string; size: number; lastModified: string }>>('/logs/files');
  }

  // Get logs from specific file
  async getLogs(filePath: string): Promise<string[]> {
    return this.get<string[]>(`/logs?file=${encodeURIComponent(filePath)}`);
  }

  // Clear logs from specific file
  async clearLogs(filePath: string): Promise<void> {
    return this.delete<void>(`/logs?file=${encodeURIComponent(filePath)}`);
  }

  // ========== Preset API methods ==========

  // Get presets list
  async getPresets(): Promise<{ presets: Array<any> }> {
    return this.get<{ presets: Array<any> }>('/presets');
  }

  // Get preset details
  async getPreset(name: string): Promise<any> {
    return this.get<any>(`/presets/${encodeURIComponent(name)}`);
  }

  // Install preset from URL
  async installPresetFromUrl(url: string, name?: string): Promise<any> {
    return this.post<any>('/presets/install', { url, name });
  }

  // Upload preset file
  async uploadPresetFile(file: File, name?: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (name) {
      formData.append('name', name);
    }

    const url = `${this.baseUrl}/presets/upload`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    // Use temp API key if available, otherwise use regular API key
    if (this.tempApiKey) {
      headers['X-Temp-API-Key'] = this.tempApiKey;
    } else if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (response.status === 401) {
      localStorage.removeItem('apiKey');
      queueMicrotask(() => {
        window.dispatchEvent(new CustomEvent('unauthorized'));
      });
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      throw new Error(`Failed to upload preset: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Apply preset (configure sensitive fields)
  async applyPreset(name: string, secrets: Record<string, string>): Promise<any> {
    return this.post<any>(`/presets/${encodeURIComponent(name)}/apply`, { secrets });
  }

  // Delete preset
  async deletePreset(name: string): Promise<any> {
    return this.delete<any>(`/presets/${encodeURIComponent(name)}`, {});
  }

  // Get market presets
  async getMarketPresets(): Promise<{ presets: Array<any> }> {
    return this.get<{ presets: Array<any> }>('/presets/market');
  }

  // Install preset from GitHub repository
  async installPresetFromGitHub(repo: string, name?: string): Promise<any> {
    return this.post<any>('/presets/install/github', { repo, name });
  }
}

// ========== Provider model discovery ==========

export type FetchProviderModelsErrorCode =
  | "missing_credentials"
  | "fetch_failed"
  | "invalid_response";

export class FetchProviderModelsError extends Error {
  code: FetchProviderModelsErrorCode;
  constructor(code: FetchProviderModelsErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "FetchProviderModelsError";
  }
}

/**
 * Hit the local backend's POST /api/providers/models endpoint, which in turn
 * calls the provider's OpenAI-compatible /v1/models endpoint and returns
 * the list of model ids.
 *
 * Throws FetchProviderModelsError on failure so callers can branch on `.code`.
 */
export async function fetchProviderModels(
  baseUrl: string,
  apiKey: string
): Promise<string[]> {
  const response = await fetch("/api/providers/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base_url: baseUrl, api_key: apiKey }),
  });

  if (!response.ok) {
    let code: FetchProviderModelsErrorCode = "fetch_failed";
    let message = `Request failed: ${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      if (body?.error === "missing_credentials") {
        code = "missing_credentials";
      } else if (body?.error === "invalid_response") {
        code = "invalid_response";
      }
      if (body?.message) {
        message = body.message;
      }
    } catch {
      // ignore JSON parse errors and keep the default message
    }
    throw new FetchProviderModelsError(code, message);
  }

  const body = (await response.json()) as { models?: unknown };
  if (!body || !Array.isArray(body.models)) {
    throw new FetchProviderModelsError(
      "invalid_response",
      "Invalid response: missing models array"
    );
  }
  return body.models.filter((m): m is string => typeof m === "string");
}

// Create a default instance of the API client
export const api = new ApiClient();

// Export the class for creating custom instances
export default ApiClient;
