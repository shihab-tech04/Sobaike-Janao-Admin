/**
 * Notification Types & Interfaces for Sobaike Janao Admin
 * Maps strictly to the backend public.admin_notifications schema and Phase 1/2 RPCs.
 */

export type NotificationCategory =
  | 'complaint'
  | 'administration'
  | 'role'
  | 'security'
  | 'personal'
  | 'system';

export type NotificationSeverity =
  | 'info'
  | 'action_required'
  | 'warning'
  | 'security';

export type NotificationLayer =
  | 'action_required'
  | 'workflow_activity'
  | 'administrative_oversight'
  | 'security_privilege'
  | 'personal_account'
  | 'system_operational';

export type NotificationAudienceMode =
  | 'permission'
  | 'personal'
  | 'super_admin_only';

export type NotificationTargetType =
  | 'complaint'
  | 'admin_user'
  | 'role'
  | null;

export type NotificationEventKey =
  | 'complaint.submitted'
  | 'complaint.evidence_attached'
  | 'complaint.published'
  | 'complaint.unpublished'
  | 'complaint.rejected'
  | 'admin.created'
  | 'admin.activated'
  | 'admin.deactivated'
  | 'admin.role_changed'
  | 'role.created'
  | 'role.updated'
  | 'role.permissions_changed'
  | string;

export interface AdminNotification {
  id: string;
  event_group_id: string;
  event_key: NotificationEventKey;
  category: NotificationCategory;
  layer: NotificationLayer;
  severity: NotificationSeverity;
  audience_mode: NotificationAudienceMode;
  actor_user_id: string | null;
  actor_display_name: string | null;
  target_type: NotificationTargetType;
  target_id: string | null;
  target_label: string | null;
  title_en: string;
  title_bn: string;
  body_en: string | null;
  body_bn: string | null;
  metadata: Record<string, unknown> | null;
  route: string | null;
  created_at: string;
  read_at: string | null;
}

export type NotificationFilterType =
  | 'all'
  | 'unread'
  | 'complaint'
  | 'administration'
  | 'role'
  | 'security';

export interface NotificationListParams {
  limit?: number;
  before_created_at?: string | null;
  before_id?: string | null;
  unread_only?: boolean;
  category?: string | null;
}

export interface NotificationListResult extends Array<AdminNotification> {
  hasMore?: boolean;
}
