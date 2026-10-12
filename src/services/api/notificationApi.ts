/**
 * Notification API Service Layer
 * Interacts with Supabase Notification RPCs:
 * - admin_list_notifications
 * - admin_get_unread_notification_count
 * - admin_mark_notification_read
 * - admin_mark_all_notifications_read
 * 
 * Strictly adheres to Phase 1/2 contracts without modifying or querying tables directly.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  AdminNotification,
  NotificationListParams,
  NotificationListResult,
} from '@/types/Notification';
import { isSecurityNotification } from '@/utils/notificationUtils';

export class NotificationApiError extends Error {
  code?: string;
  details?: string;

  constructor(message: string, code?: string, details?: string) {
    super(message);
    this.name = 'NotificationApiError';
    this.code = code;
    this.details = details;
  }
}

export const notificationApi = {
  /**
   * Fetch paginated list of notifications for the current active admin.
   * Utilizes the authoritative RPC: public.admin_list_notifications
   * Correctly handles security pagination across multiple backend pages.
   */
  async listNotifications(params?: NotificationListParams): Promise<NotificationListResult> {
    const isSecurityFilter = params?.category === 'security';
    const limit = params?.limit ?? 20;

    // In-memory fallback handler for local/offline testing
    if (!isSupabaseConfigured) {
      throw new NotificationApiError(
        'Supabase notifications service is not configured in this environment.',
        'CONFIG_ERROR'
      );
    }

    // Direct RPC call for non-security categories
    if (!isSecurityFilter) {
      const { data, error } = await supabase.rpc('admin_list_notifications', {
        p_limit: limit,
        p_before_created_at: params?.before_created_at || null,
        p_before_id: params?.before_id || null,
        p_unread_only: params?.unread_only ?? false,
        p_category: params?.category || null,
      });

      if (error) {
        console.error('admin_list_notifications RPC failed:', error);
        throw new NotificationApiError(error.message, error.code, error.details);
      }

      const results = (Array.isArray(data) ? (data as AdminNotification[]) : []) as NotificationListResult;
      results.hasMore = results.length === limit;
      return results;
    }

    // Security filter pagination: Keyset pagination loop
    // Fetches backend pages using normal keyset pagination until enough security items
    // are collected for the requested UI page size, or the backend has no more rows.
    const collected: AdminNotification[] = [];
    const seenIds = new Set<string>();

    let cursorCreatedAt = params?.before_created_at || null;
    let cursorId = params?.before_id || null;
    let backendHasMore = true;
    let hasMoreSecurityAfterCollection = false;

    const BACKEND_BATCH_SIZE = 50; // max allowed by RPC
    const visitedCursors = new Set<string>();

    while (collected.length < limit && backendHasMore) {
      const { data, error } = await supabase.rpc('admin_list_notifications', {
        p_limit: BACKEND_BATCH_SIZE,
        p_before_created_at: cursorCreatedAt,
        p_before_id: cursorId,
        p_unread_only: params?.unread_only ?? false,
        p_category: null, // query all categories because security items have category 'administration' or 'role'
      });

      if (error) {
        console.error('admin_list_notifications RPC failed during security scan:', error);
        throw new NotificationApiError(error.message, error.code, error.details);
      }

      const batch = Array.isArray(data) ? (data as AdminNotification[]) : [];
      if (batch.length === 0) {
        backendHasMore = false;
        hasMoreSecurityAfterCollection = false;
        break;
      }

      const isBatchExhausted = batch.length < BACKEND_BATCH_SIZE;
      if (isBatchExhausted) {
        backendHasMore = false;
      }

      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        if (isSecurityNotification(item)) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            collected.push(item);
          }

          if (collected.length === limit) {
            // Target limit reached. Check if more rows exist in this batch or in next batches
            if (!isBatchExhausted) {
              hasMoreSecurityAfterCollection = true;
            } else {
              hasMoreSecurityAfterCollection = batch
                .slice(i + 1)
                .some((remainingItem) => isSecurityNotification(remainingItem));
            }
            break;
          }
        }
      }

      // If we still need more security items and backend has more rows,
      // update cursor to the last scanned item of this batch to fetch the next batch
      if (collected.length < limit && backendHasMore) {
        const lastBatchItem = batch[batch.length - 1];
        const nextCursorCreatedAt = lastBatchItem.created_at;
        const nextCursorId = lastBatchItem.id;

        // Detect cursor stall
        if (nextCursorCreatedAt === cursorCreatedAt && nextCursorId === cursorId) {
          throw new NotificationApiError(
            'Security pagination failed: cursor did not advance',
            'CURSOR_STALLED'
          );
        }

        const cursorKey = `${nextCursorCreatedAt}_${nextCursorId}`;
        if (visitedCursors.has(cursorKey)) {
          throw new NotificationApiError(
            'Security pagination failed: cursor cycle detected',
            'CURSOR_CYCLE'
          );
        }
        visitedCursors.add(cursorKey);

        cursorCreatedAt = nextCursorCreatedAt;
        cursorId = nextCursorId;
      }
    }

    const result = collected as NotificationListResult;
    // hasMore must reflect whether more security notifications may still exist
    if (collected.length < limit) {
      result.hasMore = false;
    } else {
      result.hasMore = hasMoreSecurityAfterCollection;
    }

    return result;
  },

  /**
   * Retrieve total unread notification count for the current admin.
   * Utilizes authoritative RPC: public.admin_get_unread_notification_count
   */
  async getUnreadCount(): Promise<number> {
    if (!isSupabaseConfigured) {
      throw new NotificationApiError(
        'Supabase notifications service is not configured in this environment.',
        'CONFIG_ERROR'
      );
    }

    const { data, error } = await supabase.rpc('admin_get_unread_notification_count');

    if (error) {
      console.error('admin_get_unread_notification_count RPC failed:', error);
      throw new NotificationApiError(error.message, error.code, error.details);
    }

    return Number(data || 0);
  },

  /**
   * Mark a single notification as read.
   * Utilizes authoritative RPC: public.admin_mark_notification_read
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    if (!notificationId) return false;

    if (!isSupabaseConfigured) {
      throw new NotificationApiError(
        'Supabase notifications service is not configured in this environment.',
        'CONFIG_ERROR'
      );
    }

    const { data, error } = await supabase.rpc('admin_mark_notification_read', {
      p_notification_id: notificationId,
    });

    if (error) {
      console.error('admin_mark_notification_read RPC failed:', error);
      throw new NotificationApiError(error.message, error.code, error.details);
    }

    return Boolean(data);
  },

  /**
   * Mark all unread notifications as read for the current active admin.
   * Utilizes authoritative RPC: public.admin_mark_all_notifications_read
   */
  async markAllAsRead(): Promise<number> {
    if (!isSupabaseConfigured) {
      throw new NotificationApiError(
        'Supabase notifications service is not configured in this environment.',
        'CONFIG_ERROR'
      );
    }

    const { data, error } = await supabase.rpc('admin_mark_all_notifications_read');

    if (error) {
      console.error('admin_mark_all_notifications_read RPC failed:', error);
      throw new NotificationApiError(error.message, error.code, error.details);
    }

    return Number(data || 0);
  },
};

export default notificationApi;
