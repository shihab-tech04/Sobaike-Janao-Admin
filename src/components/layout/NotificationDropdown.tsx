import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, ArrowRight, RotateCcw, CheckCheck, AlertCircle } from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/utils';
import {
  isSafeNotificationRoute,
  formatRelativeTime,
  formatNumber,
  getNotificationVisualMeta,
} from '@/utils/notificationUtils';
import { AdminNotification } from '@/types/Notification';

export const NotificationDropdown: React.FC = () => {
  const {
    unreadCount,
    recentNotifications,
    isLoadingRecent,
    recentError,
    refreshRecent,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isMarkingAll, setIsMarkingAll] = useState<boolean>(false);
  const [itemErrorIds, setItemErrorIds] = useState<Set<string>>(new Set());
  const [markingItemIds, setMarkingItemIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setItemErrorIds(new Set());
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setItemErrorIds(new Set());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Refresh notifications and clear errors when dropdown is opened
  useEffect(() => {
    if (isOpen) {
      setItemErrorIds(new Set());
      refreshRecent();
    }
  }, [isOpen, refreshRecent]);

  // Toggle dropdown
  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Notification item click: Mark read, validate route, navigate safely or stay
  const handleItemClick = async (notification: AdminNotification) => {
    // If already in-flight marking this item, prevent duplicate calls
    if (markingItemIds.has(notification.id)) return;

    // 1. If already read, can navigate normally
    if (notification.read_at) {
      setItemErrorIds((prev) => {
        const next = new Set(prev);
        next.delete(notification.id);
        return next;
      });
      const route = notification.route;
      if (isSafeNotificationRoute(route)) {
        setIsOpen(false);
        navigate(route!);
      }
      return;
    }

    // 2. Unread notification: must successfully mark as read first
    setMarkingItemIds((prev) => new Set(prev).add(notification.id));
    setItemErrorIds((prev) => {
      const next = new Set(prev);
      next.delete(notification.id);
      return next;
    });

    let success = false;
    try {
      success = await markAsRead(notification.id);
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
      success = false;
    } finally {
      setMarkingItemIds((prev) => {
        const next = new Set(prev);
        next.delete(notification.id);
        return next;
      });
    }

    // If success === false:
    // - keep the notification unread
    // - show a small visible error/retry state inside the dropdown
    // - do not silently console.warn only
    // - do not pretend the action succeeded
    // - do not navigate away until the mark-read attempt succeeds
    if (!success) {
      setItemErrorIds((prev) => new Set(prev).add(notification.id));
      return;
    }

    // 3. Mark read succeeded! Navigate safely if route exists
    const route = notification.route;
    if (isSafeNotificationRoute(route)) {
      setIsOpen(false);
      navigate(route!);
    }
  };

  // Mark all as read action
  const handleMarkAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMarkingAll || unreadCount === 0) return;
    setIsMarkingAll(true);
    try {
      await markAllAsRead();
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  // View all notifications navigation
  const handleViewAll = () => {
    setIsOpen(false);
    navigate('/notifications');
  };

  // Accessible label for screen readers
  const accessibleLabel =
    unreadCount > 0
      ? `${t.notifications.title}, ${formatNumber(unreadCount, language)} ${
          unreadCount === 1
            ? t.notifications.unreadCountSingular.replace('{count}', '')
            : t.notifications.unreadCountPlural.replace('{count}', '')
        }`
      : t.notifications.title;

  // Format badge display: 1-9 = actual number, >9 = 9+ / ৯+
  const badgeText =
    unreadCount > 9
      ? `${formatNumber(9, language)}+`
      : formatNumber(unreadCount, language);

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        id="header-notification-bell-btn"
        onClick={handleToggle}
        className={cn(
          'relative p-2 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500',
          isOpen && 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
        )}
        aria-label={accessibleLabel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Bell className="w-4 h-4" />

        {/* Unread Badge: Rendered only when unreadCount > 0 */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-sky-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-slate-900 shadow-xs leading-none"
            aria-hidden="true"
          >
            {badgeText}
          </span>
        )}
      </button>

      {/* Notifications Popover Menu */}
      {isOpen && (
        <div
          role="region"
          aria-label={t.notifications.title}
          className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-1.5rem)] rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-0 z-50 animate-in fade-in zoom-in-95 text-left overflow-hidden"
        >
          {/* Popover Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {t.notifications.title}
              </span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-900/40">
                  {badgeText} {t.notifications.unread}
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                id="notification-dropdown-mark-all-btn"
                onClick={handleMarkAll}
                disabled={isMarkingAll}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 rounded px-1.5 py-0.5"
                title={t.notifications.markAllRead}
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{t.notifications.markAllRead}</span>
              </button>
            )}
          </div>

          {/* Popover Notification List */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[360px] overflow-y-auto overscroll-contain">
            {/* Loading Skeleton */}
            {isLoadingRecent && recentNotifications.length === 0 && (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-3 animate-pulse">
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                      <div className="h-2.5 bg-slate-100 dark:bg-slate-800/60 rounded w-5/6" />
                      <div className="h-2 bg-slate-100 dark:bg-slate-800/40 rounded w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error State */}
            {!isLoadingRecent && recentError && recentNotifications.length === 0 && (
              <div className="p-5 text-center">
                <p className="text-xs text-red-600 dark:text-red-400 mb-2">
                  {t.notifications.errorLoading}
                </p>
                <button
                  type="button"
                  onClick={() => refreshRecent()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{t.notifications.retry}</span>
                </button>
              </div>
            )}

            {/* Empty State */}
            {!isLoadingRecent && !recentError && recentNotifications.length === 0 && (
              <div className="p-6 text-center text-slate-400 dark:text-slate-500">
                <Bell className="w-7 h-7 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t.notifications.allCaughtUp}
                </p>
                <p className="text-[11px] mt-0.5 text-slate-400 dark:text-slate-500">
                  {t.notifications.noNotifications}
                </p>
              </div>
            )}

            {/* Render Recent Notifications */}
            {recentNotifications.map((item) => {
              const isUnread = !item.read_at;
              const meta = getNotificationVisualMeta(item.event_key, item.category, item.severity, item.layer);
              const IconComponent = meta.icon;
              const title =
                language === 'bn' ? item.title_bn || item.title_en : item.title_en || item.title_bn;
              const body =
                language === 'bn' ? item.body_bn || item.body_en : item.body_en || item.body_bn;
              const relativeTime = formatRelativeTime(item.created_at, language);
              const hasRoute = isSafeNotificationRoute(item.route);

              return (
                <div
                  key={item.id}
                  id={`notification-dropdown-item-${item.id}`}
                  onClick={() => handleItemClick(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleItemClick(item);
                    }
                  }}
                  className={cn(
                    'p-3.5 flex items-start gap-3 cursor-pointer transition-colors text-left select-none relative group',
                    isUnread
                      ? 'bg-sky-50/40 dark:bg-sky-950/20 hover:bg-sky-100/50 dark:hover:bg-sky-900/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  )}
                  aria-label={`${title}. ${isUnread ? t.notifications.unread : ''}`}
                >
                  {/* Event Type Icon */}
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                      meta.iconBg,
                      meta.iconColor
                    )}
                  >
                    <IconComponent className="w-4 h-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pr-1">
                    <div className="flex items-baseline justify-between gap-1 mb-0.5">
                      <p
                        className={cn(
                          'text-xs text-slate-900 dark:text-slate-100 truncate break-words',
                          isUnread ? 'font-semibold text-slate-900 dark:text-white' : 'font-medium'
                        )}
                      >
                        {title}
                      </p>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0 ml-1 font-normal">
                        {relativeTime}
                      </span>
                    </div>

                    {body && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed break-words">
                        {body}
                      </p>
                    )}

                    {/* Mark-Read Error & Retry State */}
                    {itemErrorIds.has(item.id) && (
                      <div
                        id={`notification-mark-read-error-${item.id}`}
                        className="mt-2 p-1.5 rounded bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 flex items-center justify-between gap-2 text-left"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1.5 text-[11px] text-rose-700 dark:text-rose-300 font-medium min-w-0">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                          <span className="truncate">{t.notifications.errorMarkRead}</span>
                        </div>
                        <button
                          type="button"
                          id={`notification-retry-mark-read-${item.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleItemClick(item);
                          }}
                          disabled={markingItemIds.has(item.id)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-200 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 rounded hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors shrink-0 disabled:opacity-50"
                        >
                          <RotateCcw className={cn('w-2.5 h-2.5', markingItemIds.has(item.id) && 'animate-spin')} />
                          <span>{t.notifications.retry}</span>
                        </button>
                      </div>
                    )}

                    {/* Secondary Route Hint & Status */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className={cn(
                          'text-[9px] px-1.5 py-0.2 rounded font-medium',
                          meta.isSecurity
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        )}
                      >
                        {language === 'bn' ? meta.groupLabelBn : meta.groupLabelEn}
                      </span>

                      {hasRoute && (
                        <span className="text-[10px] text-sky-600 dark:text-sky-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 ml-auto">
                          {t.notifications.viewAction}
                          <ArrowRight className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Unread Visual Indicator Dot */}
                  {isUnread && (
                    <div
                      className="w-2 h-2 rounded-full bg-sky-500 ring-2 ring-white dark:ring-slate-900 shrink-0 mt-2"
                      aria-label={t.notifications.unread}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Popover Footer: Link to full /notifications page */}
          <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-center">
            <button
              type="button"
              id="notification-view-all-link"
              onClick={handleViewAll}
              className="w-full py-1.5 px-3 rounded-md text-xs font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-slate-800/80 transition-colors flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
            >
              <span>{t.notifications.viewAll}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;
