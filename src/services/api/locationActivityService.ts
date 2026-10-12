import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  PublicVisitSession,
  LocationActivityFilters,
  LocationActivityStats,
  LocationActivityResponse,
} from '@/types/LocationActivity';

/**
 * Service for querying visitor location sessions and device context.
 * Read-only operations against public.public_visit_sessions.
 * In configured production: queries real Supabase records exclusively; fails closed on error.
 */
export const locationActivityService = {
  /**
   * Fetch paginated visitor location sessions with server-side filters.
   */
  async getLocationActivity(
    filters: LocationActivityFilters,
    page = 1,
    pageSize = 20
  ): Promise<LocationActivityResponse> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase location activity service is not configured in this environment.');
    }

    const fromIndex = (page - 1) * pageSize;
    const toIndex = fromIndex + pageSize - 1;

    let query = supabase
      .from('public_visit_sessions')
      .select('*', { count: 'exact' });

    // 1. Permission Filter
    if (filters.permission && filters.permission !== 'all') {
      query = query.eq('permission_status', filters.permission);
    }

    // 2. Device Category Filter
    if (filters.device && filters.device !== 'all') {
      query = query.ilike('device_category', filters.device);
    }

    // 3. Browser Filter
    if (filters.browser && filters.browser !== 'all' && filters.browser.trim().length > 0) {
      query = query.ilike('browser_name', `%${filters.browser.trim()}%`);
    }

    // 4. Time Range Filter (based on last_seen_at)
    if (filters.timeRange && filters.timeRange !== 'all') {
      const now = Date.now();
      let startTimeIso = '';
      if (filters.timeRange === '24h') {
        startTimeIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      } else if (filters.timeRange === '7d') {
        startTimeIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (filters.timeRange === '30d') {
        startTimeIso = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      if (startTimeIso) {
        query = query.gte('last_seen_at', startTimeIso);
      }
    }

    // 5. Text Search
    if (filters.search && filters.search.trim().length > 0) {
      const term = filters.search.trim().replace(/,/g, '');
      query = query.or(
        `visitor_id.ilike.%${term}%,session_id.ilike.%${term}%,browser_name.ilike.%${term}%,os_name.ilike.%${term}%,platform.ilike.%${term}%,timezone.ilike.%${term}%`
      );
    }

    query = query
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .range(fromIndex, toIndex);

    const { data, count, error } = await query;

    if (error) {
      console.error('Failed to query visitor location sessions from Supabase:', error);
      throw new Error(`Failed to load visitor sessions: ${error.message}`);
    }

    const sessions = (data || []) as PublicVisitSession[];
    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      sessions,
      total,
      page,
      pageSize,
      totalPages,
    };
  },

  /**
   * Fetch real summary KPI counts for visitor sessions.
   */
  async getLocationActivityStats(): Promise<LocationActivityStats> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase location activity service is not configured in this environment.');
    }

    const fifteenMinutesAgoIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const [totalRes, grantedRes, deniedRes, promptRes, recentRes] = await Promise.all([
      supabase.from('public_visit_sessions').select('*', { count: 'exact', head: true }),
      supabase.from('public_visit_sessions').select('*', { count: 'exact', head: true }).eq('permission_status', 'granted'),
      supabase.from('public_visit_sessions').select('*', { count: 'exact', head: true }).eq('permission_status', 'denied'),
      supabase.from('public_visit_sessions').select('*', { count: 'exact', head: true }).eq('permission_status', 'prompt'),
      supabase.from('public_visit_sessions').select('*', { count: 'exact', head: true }).gte('last_seen_at', fifteenMinutesAgoIso),
    ]);

    if (totalRes.error) {
      console.error('Failed to fetch total sessions count:', totalRes.error);
      throw new Error(`Failed to load location statistics: ${totalRes.error.message}`);
    }

    if (grantedRes.error) {
      console.error('Failed to fetch granted sessions count:', grantedRes.error);
      throw new Error(`Failed to load location statistics: ${grantedRes.error.message}`);
    }

    if (deniedRes.error) {
      console.error('Failed to fetch denied sessions count:', deniedRes.error);
      throw new Error(`Failed to load location statistics: ${deniedRes.error.message}`);
    }

    if (promptRes.error) {
      console.error('Failed to fetch prompt sessions count:', promptRes.error);
      throw new Error(`Failed to load location statistics: ${promptRes.error.message}`);
    }

    if (recentRes.error) {
      console.error('Failed to fetch recent sessions count:', recentRes.error);
      throw new Error(`Failed to load location statistics: ${recentRes.error.message}`);
    }

    const total = totalRes.count ?? 0;
    const granted = grantedRes.count ?? 0;
    const denied = deniedRes.count ?? 0;
    const prompt = promptRes.count ?? 0;
    const recent15m = recentRes.count ?? 0;

    return {
      totalSessions: total,
      grantedCount: granted,
      deniedCount: denied,
      promptCount: prompt,
      recentSessionsCount: recent15m,
    };
  },

  /**
   * Fetch distinct browser names present in the sessions for filter suggestions.
   */
  async getDistinctBrowsers(): Promise<string[]> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase location activity service is not configured in this environment.');
    }

    const { data, error } = await supabase
      .from('public_visit_sessions')
      .select('browser_name')
      .not('browser_name', 'is', null)
      .limit(100);

    if (error) {
      console.error('Failed to query distinct browsers from Supabase:', error);
      throw new Error(`Failed to load distinct browsers: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return [];
    }

    const set = new Set<string>();
    data.forEach((row: { browser_name: string | null }) => {
      if (row.browser_name && row.browser_name.trim()) {
        set.add(row.browser_name.trim());
      }
    });
    return Array.from(set);
  },
};

export default locationActivityService;
