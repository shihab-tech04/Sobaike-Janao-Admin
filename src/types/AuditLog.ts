/**
 * Admin Activity Log & Audit Trail Types
 * Mirrors the canonical public.admin_audit_logs table:
 * - id: UUID
 * - actor_id: UUID | null
 * - action: TEXT
 * - target_type: TEXT
 * - target_id: TEXT | null
 * - details: JSONB
 * - created_at: TIMESTAMPTZ
 */

export type AuditTargetType = 'complaint' | 'role' | 'admin_user';

export interface AuditActor {
  id: string | null;
  email: string | null;
  display_name: string | null;
}

export interface AuditLogItem {
  id: string;
  actor_id: string | null;
  actor_email?: string | null;
  actor_display_name?: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, any>;
  created_at: string;
}

export interface AuditLogQueryParams {
  search?: string;
  action?: string;
  target_type?: string;
  actor_id?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
  before_created_at?: string;
}

export interface AuditLogListResponse {
  logs: AuditLogItem[];
  total_count: number;
  has_more: boolean;
}

export class AuditApiError extends Error {
  code?: string;
  details?: string;

  constructor(message: string, code?: string, details?: string) {
    super(message);
    this.name = 'AuditApiError';
    this.code = code;
    this.details = details;
  }
}
