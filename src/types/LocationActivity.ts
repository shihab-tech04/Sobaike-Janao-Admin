export type LocationPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unavailable' | string;

export interface PublicVisitSession {
  id: string;
  visitor_id: string;
  session_id: string;
  permission_status: LocationPermissionStatus;

  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;

  browser_name: string | null;
  browser_version: string | null;
  os_name: string | null;
  device_category: string | null;
  platform: string | null;

  language: string | null;
  timezone: string | null;

  screen_width: number | null;
  screen_height: number | null;

  user_agent: string | null;

  consented_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  location_updated_at: string | null;
  created_at: string | null;
}

export interface LocationActivityFilters {
  search: string;
  permission: 'all' | 'granted' | 'denied' | 'prompt' | 'unavailable';
  device: 'all' | 'desktop' | 'mobile' | 'tablet' | 'unknown';
  browser: string;
  timeRange: 'all' | '24h' | '7d' | '30d';
}

export interface LocationActivityStats {
  totalSessions: number;
  grantedCount: number;
  deniedCount: number;
  promptCount: number;
  recentSessionsCount: number; // last 15 minutes
}

export interface LocationActivityResponse {
  sessions: PublicVisitSession[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
