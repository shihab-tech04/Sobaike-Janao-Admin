/**
 * Core API response and transport types
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiError {
  message: string;
  statusCode?: number;
  details?: unknown;
}

export interface PaginationResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  statusCode?: number;
  details?: unknown;
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined | null>;
  requiresAuth?: boolean;
}

export type RequestInterceptor = (options: RequestOptions) => RequestOptions | Promise<RequestOptions>;
export type ResponseInterceptor = <T>(response: ApiResponse<T>) => ApiResponse<T> | Promise<ApiResponse<T>>;

