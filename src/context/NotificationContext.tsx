import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AdminNotification } from '@/types/Notification';
import { notificationApi } from '@/services/api/notificationApi';
import { useAuth } from './AuthContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface NotificationContextType {
  unreadCount: number;
  recentNotifications: AdminNotification[];
  isLoadingRecent: boolean;
  recentError: string | null;
  refreshUnreadCount: () => Promise<number>;
  refreshRecent: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<boolean>;
  markAllAsRead: () => Promise<number>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [recentNotifications, setRecentNotifications] = useState<AdminNotification[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState<boolean>(false);
  const [recentError, setRecentError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Safe fetch of unread notification count.
   * Under no circumstances will this crash the Header or user interface.
   */
  const refreshUnreadCount = useCallback(async (): Promise<number> => {
    if (!isAdmin) {
      if (isMountedRef.current) setUnreadCount(0);
      return 0;
    }

    try {
      const count = await notificationApi.getUnreadCount();
      if (isMountedRef.current) {
        setUnreadCount(Number.isFinite(count) ? Math.max(0, count) : 0);
      }
      return count;
    } catch (err) {
      console.warn('Silent non-fatal error fetching notification unread count:', err);
      // Keep existing unread count or fallback to 0 safely without crashing
      return 0;
    }
  }, [isAdmin]);

  /**
   * Refreshes the recent 8 notifications (for Header bell dropdown) and updates unread count.
   */
  const refreshRecent = useCallback(async (): Promise<void> => {
    if (!isAdmin) {
      if (isMountedRef.current) {
        setRecentNotifications([]);
        setUnreadCount(0);
      }
      return;
    }

    if (isMountedRef.current) {
      setIsLoadingRecent(true);
      setRecentError(null);
    }

    try {
      const [list, count] = await Promise.all([
        notificationApi.listNotifications({ limit: 8 }),
        notificationApi.getUnreadCount().catch(() => 0),
      ]);

      if (isMountedRef.current) {
        setRecentNotifications(list);
        setUnreadCount(Number.isFinite(count) ? Math.max(0, count) : 0);
      }
    } catch (err: unknown) {
      console.error('Failed to refresh recent notifications:', err);
      if (isMountedRef.current) {
        setRecentError(err instanceof Error ? err.message : 'Failed to load notifications');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingRecent(false);
      }
    }
  }, [isAdmin]);

  /**
   * Marks an individual notification as read optimistically.
   */
  const markAsRead = useCallback(async (notificationId: string): Promise<boolean> => {
    if (!notificationId) return false;

    // Optimistic state update
    const previousRecent = [...recentNotifications];
    const previousUnreadCount = unreadCount;

    setRecentNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId && !n.read_at
          ? { ...n, read_at: new Date().toISOString() }
          : n
      )
    );

    const wasUnread = previousRecent.some((n) => n.id === notificationId && !n.read_at);
    if (wasUnread) {
      setUnreadCount((c) => Math.max(0, c - 1));
    }

    try {
      const success = await notificationApi.markAsRead(notificationId);
      if (!success) {
        // Revert on failure
        setRecentNotifications(previousRecent);
        setUnreadCount(previousUnreadCount);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Error marking notification as read:', err);
      // Revert on exception
      setRecentNotifications(previousRecent);
      setUnreadCount(previousUnreadCount);
      return false;
    }
  }, [recentNotifications, unreadCount]);

  /**
   * Marks all notifications as read optimistically.
   */
  const markAllAsRead = useCallback(async (): Promise<number> => {
    const previousRecent = [...recentNotifications];
    const previousUnreadCount = unreadCount;
    const nowIso = new Date().toISOString();

    setRecentNotifications((prev) =>
      prev.map((n) => (!n.read_at ? { ...n, read_at: nowIso } : n))
    );
    setUnreadCount(0);

    try {
      const affectedCount = await notificationApi.markAllAsRead();
      return affectedCount;
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
      // Revert on exception
      setRecentNotifications(previousRecent);
      setUnreadCount(previousUnreadCount);
      throw err;
    }
  }, [recentNotifications, unreadCount]);

  // Initial load when active admin state changes
  useEffect(() => {
    if (isAdmin) {
      refreshUnreadCount();
      refreshRecent();
    } else {
      setUnreadCount(0);
      setRecentNotifications([]);
    }
  }, [isAdmin, refreshUnreadCount, refreshRecent]);

  // Real-time Postgres Changes Subscription under existing RLS (Section 5)
  useEffect(() => {
    if (!isAdmin || !user?.id || !isSupabaseConfigured) {
      return;
    }

    const channelName = `admin_notifications_${user.id}_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_notifications',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        () => {
          // Whenever an event occurs for this admin, refresh unread count and recent notifications
          refreshUnreadCount();
          refreshRecent();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Connected cleanly
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, user?.id, refreshUnreadCount, refreshRecent]);

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        recentNotifications,
        isLoadingRecent,
        recentError,
        refreshUnreadCount,
        refreshRecent,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export default NotificationContext;
