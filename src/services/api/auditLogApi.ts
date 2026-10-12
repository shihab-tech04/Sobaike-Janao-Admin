/**
 * Admin Activity Log & Audit Trail API Service Layer
 *
 * Interacts with Supabase RPC:
 * - admin_list_audit_logs
 *
 * Direct SELECT access to public.admin_audit_logs is revoked from authenticated
 * roles. All audit history retrieval is mediated via the authorized RPC and
 * fails closed when Supabase is unconfigured.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  AuditLogItem,
  AuditLogQueryParams,
  AuditLogListResponse,
  AuditApiError,
} from '@/types/AuditLog';

function assertAuditApiConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new AuditApiError(
      'Supabase audit logs service is not configured in this environment.',
      'CONFIG_ERROR'
    );
  }
}

export const auditLogApi = {
  /**
   * Retrieves paginated audit logs via authorized Supabase RPC
   */
  async getAuditLogs(params: AuditLogQueryParams = {}): Promise<AuditLogListResponse> {
    assertAuditApiConfigured();

    const limit = Math.min(Math.max(params.limit || 15, 1), 100);
    const offset = Math.max(params.offset || 0, 0);

    try {
      const { data, error } = await supabase.rpc('admin_list_audit_logs', {
        p_limit: limit,
        p_offset: offset,
        p_search: params.search?.trim() || null,
        p_action: params.action && params.action !== 'all' ? params.action : null,
        p_target_type: params.target_type && params.target_type !== 'all' ? params.target_type : null,
        p_actor_id: params.actor_id && params.actor_id !== 'all' ? params.actor_id : null,
        p_date_from: params.date_from || null,
        p_date_to: params.date_to || null,
      });

      if (error) {
        throw new AuditApiError(
          `Audit log retrieval failed: ${error.message}`,
          error.code,
          error.details
        );
      }

      const rawLogs: any[] = Array.isArray(data?.logs) ? data.logs : [];
      const totalCount: number = typeof data?.total_count === 'number'
        ? data.total_count
        : 0;

      const mapped: AuditLogItem[] = rawLogs.map((item: any) => ({
        id: item.id,
        actor_id: item.actor_id || null,
        actor_email: item.actor_email || null,
        actor_display_name: item.actor_display_name || null,
        action: item.action,
        target_type: item.target_type,
        target_id: item.target_id || null,
        details: item.details || {},
        created_at: item.created_at,
      }));

      return {
        logs: mapped,
        total_count: totalCount,
        has_more: offset + mapped.length < totalCount,
      };
    } catch (err: unknown) {
      if (err instanceof AuditApiError) throw err;
      const msg = err instanceof Error ? err.message : 'Unknown audit log error';
      throw new AuditApiError(msg, 'RPC_ERROR');
    }
  },
};
