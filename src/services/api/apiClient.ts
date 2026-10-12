import { appConfig } from '@/config';
import { supabase } from '@/lib/supabase';
import { ApiResponse, RequestOptions, RequestInterceptor, ResponseInterceptor } from '@/types/api';

export type { RequestOptions, RequestInterceptor, ResponseInterceptor };

export class ApiError extends Error {
  public statusCode: number;
  public details?: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Token Provider interface for authentication mechanisms.
 * Dynamically queries current Supabase session access_token.
 */
let authTokenProvider: (() => string | null | Promise<string | null>) = async () => {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
};

export const setAuthTokenProvider = (provider: () => string | null | Promise<string | null>) => {
  authTokenProvider = provider;
};

/**
 * API Client Foundation for Sobaike Admin Panel
 */
export class ApiClient {
  private baseUrl: string;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];

  constructor(baseUrl: string = appConfig.apiBaseUrl) {
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
  }

  public addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  public addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = (url || '').replace(/\/$/, '');
  }

  private buildUrl(endpoint: string, params?: RequestOptions['params']): string {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    // If baseUrl is empty or relative, build relative or absolute path safely
    let base = this.baseUrl;
    if (!base) {
      base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    }
    
    const url = new URL(`${base}${cleanEndpoint}`, typeof window !== 'undefined' ? window.location.origin : undefined);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  private async prepareHeaders(options: RequestOptions): Promise<Headers> {
    const headers = new Headers(options.headers || {});

    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    headers.set('Accept', 'application/json');
    headers.set('X-Client-Platform', 'Sobaike-Admin-Panel');

    if (options.requiresAuth !== false) {
      const token = await authTokenProvider();
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }

    return headers;
  }

  public async request<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    let processedOptions = { ...options };
    for (const interceptor of this.requestInterceptors) {
      processedOptions = await interceptor(processedOptions);
    }

    const url = this.buildUrl(endpoint, processedOptions.params);
    const headers = await this.prepareHeaders(processedOptions);

    try {
      const response = await fetch(url, {
        ...processedOptions,
        headers,
      });

      // Handle non-JSON responses gracefully
      const contentType = response.headers.get('content-type');
      let responseData: unknown = null;

      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      if (!response.ok) {
        const errorMsg =
          typeof responseData === 'object' && responseData !== null && 'message' in responseData
            ? String((responseData as { message: unknown }).message)
            : `API Request Failed with status ${response.status}: ${response.statusText}`;

        throw new ApiError(errorMsg, response.status, responseData);
      }

      // Format as standard ApiResponse
      let result: ApiResponse<T>;
      if (typeof responseData === 'object' && responseData !== null && 'data' in responseData) {
        result = responseData as ApiResponse<T>;
      } else {
        result = {
          success: true,
          data: responseData as T,
        };
      }

      for (const respInterceptor of this.responseInterceptors) {
        result = await respInterceptor<T>(result);
      }

      return result;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown network error occurred',
        0,
        error
      );
    }
  }

  public get<T = unknown>(endpoint: string, options?: Omit<RequestOptions, 'method'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public post<T = unknown>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  public put<T = unknown>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  public patch<T = unknown>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  public delete<T = unknown>(endpoint: string, options?: Omit<RequestOptions, 'method'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
export default apiClient;
