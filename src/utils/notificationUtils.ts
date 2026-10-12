import React from 'react';
import {
  Bell,
  AlertCircle,
  Paperclip,
  CheckCircle2,
  EyeOff,
  XCircle,
  UserPlus,
  UserCheck,
  UserX,
  UserCog,
  ShieldPlus,
  ShieldCheck,
  ShieldAlert,
  Key,
  Info,
} from 'lucide-react';
import { NotificationEventKey, NotificationCategory } from '@/types/Notification';

/**
 * Validates whether a notification's route target exists within the real router.
 * Prevents navigation errors or broken routes while keeping notifications readable.
 */
export const isSafeNotificationRoute = (route: string | null | undefined): boolean => {
  if (!route || typeof route !== 'string') return false;
  const trimmed = route.trim();
  if (!trimmed.startsWith('/') || trimmed.includes('//') || trimmed.includes('\\')) return false;

  // Known valid application route patterns from AppRoutes:
  // - /dashboard
  // - /complaints
  // - /complaints/:id
  // - /responses
  // - /categories
  // - /map
  // - /location-activity
  // - /roles
  // - /roles/create
  // - /roles/:roleId
  // - /roles/:roleId/edit
  // - /users
  // - /users/create
  // - /users/:userId
  // - /users/:userId/edit
  // - /notifications
  const safePatterns = [
    /^\/dashboard\/?$/,
    /^\/complaints\/?$/,
    /^\/complaints\/[a-zA-Z0-9_-]+\/?$/,
    /^\/responses\/?$/,
    /^\/categories\/?$/,
    /^\/map\/?$/,
    /^\/location-activity\/?$/,
    /^\/roles\/?$/,
    /^\/roles\/create\/?$/,
    /^\/roles\/[a-zA-Z0-9_-]+\/?$/,
    /^\/roles\/[a-zA-Z0-9_-]+\/edit\/?$/,
    /^\/users\/?$/,
    /^\/users\/create\/?$/,
    /^\/users\/[a-zA-Z0-9_-]+\/?$/,
    /^\/users\/[a-zA-Z0-9_-]+\/edit\/?$/,
    /^\/notifications\/?$/,
    /^\/activity-log\/?$/,
  ];

  return safePatterns.some((pattern) => pattern.test(trimmed));
};

/**
 * Formats a localized relative time string (e.g., "5m ago" / "৫ মিনিট আগে").
 * Strictly formats according to English or Bengali numerals and units.
 */
export const formatRelativeTime = (dateString?: string | null, language: 'en' | 'bn' = 'en'): string => {
  if (!dateString) return '—';
  const isBn = language === 'bn';

  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;

    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 45) {
      return isBn ? 'এইমাত্র' : 'Just now';
    }

    if (diffMin < 60) {
      return isBn
        ? `${formatNumber(diffMin, 'bn')} মিনিট আগে`
        : `${diffMin}m ago`;
    }

    if (diffHr < 24) {
      return isBn
        ? `${formatNumber(diffHr, 'bn')} ঘণ্টা আগে`
        : `${diffHr}h ago`;
    }

    if (diffDay === 1) {
      return isBn ? 'গতকাল' : 'Yesterday';
    }

    if (diffDay < 7) {
      return isBn
        ? `${formatNumber(diffDay, 'bn')} দিন আগে`
        : `${diffDay}d ago`;
    }

    // Over a week: formatted calendar date
    return d.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return dateString;
  }
};

/**
 * Localizes digits into Bengali numerals if language === 'bn'.
 */
export const formatNumber = (num: number | string, language: 'en' | 'bn'): string => {
  const str = String(num);
  if (language === 'en') return str;
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return str.replace(/[0-9]/g, (digit) => bnDigits[+digit] || digit);
};

export interface NotificationVisualMeta {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  groupLabelEn: string;
  groupLabelBn: string;
  isSecurity: boolean;
}

/**
 * Authoritative check if a notification belongs to the Security category view.
 * Derived from canonical events, security severity, security_privilege layer, or security category.
 */
export const isSecurityNotification = (notification: {
  event_key?: string;
  category?: string;
  layer?: string;
  severity?: string;
}): boolean => {
  return (
    notification.event_key === 'admin.role_changed' ||
    notification.event_key === 'role.permissions_changed' ||
    notification.severity === 'security' ||
    notification.layer === 'security_privilege' ||
    notification.category === 'security'
  );
};

/**
 * Returns tailored visual metadata (icon, colors, group tag) for all 12 canonical events.
 */
export const getNotificationVisualMeta = (
  eventKey: NotificationEventKey,
  category: NotificationCategory,
  severity?: string,
  layer?: string
): NotificationVisualMeta => {
  const isSecurity = isSecurityNotification({
    event_key: eventKey,
    category,
    severity,
    layer,
  });

  switch (eventKey) {
    case 'complaint.submitted':
      return {
        icon: AlertCircle,
        iconBg: 'bg-amber-100 dark:bg-amber-950/50',
        iconColor: 'text-amber-600 dark:text-amber-400',
        groupLabelEn: 'Complaint',
        groupLabelBn: 'অভিযোগ',
        isSecurity: false,
      };
    case 'complaint.evidence_attached':
      return {
        icon: Paperclip,
        iconBg: 'bg-sky-100 dark:bg-sky-950/50',
        iconColor: 'text-sky-600 dark:text-sky-400',
        groupLabelEn: 'Complaint',
        groupLabelBn: 'অভিযোগ',
        isSecurity: false,
      };
    case 'complaint.published':
      return {
        icon: CheckCircle2,
        iconBg: 'bg-emerald-100 dark:bg-emerald-950/50',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        groupLabelEn: 'Complaint',
        groupLabelBn: 'অভিযোগ',
        isSecurity: false,
      };
    case 'complaint.unpublished':
      return {
        icon: EyeOff,
        iconBg: 'bg-amber-100 dark:bg-amber-950/50',
        iconColor: 'text-amber-600 dark:text-amber-400',
        groupLabelEn: 'Complaint',
        groupLabelBn: 'অভিযোগ',
        isSecurity: false,
      };
    case 'complaint.rejected':
      return {
        icon: XCircle,
        iconBg: 'bg-red-100 dark:bg-red-950/50',
        iconColor: 'text-red-600 dark:text-red-400',
        groupLabelEn: 'Complaint',
        groupLabelBn: 'অভিযোগ',
        isSecurity: false,
      };

    case 'admin.created':
      return {
        icon: UserPlus,
        iconBg: 'bg-sky-100 dark:bg-sky-950/50',
        iconColor: 'text-sky-600 dark:text-sky-400',
        groupLabelEn: 'Administration',
        groupLabelBn: 'প্রশাসন',
        isSecurity: false,
      };
    case 'admin.activated':
      return {
        icon: UserCheck,
        iconBg: 'bg-emerald-100 dark:bg-emerald-950/50',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        groupLabelEn: 'Administration',
        groupLabelBn: 'প্রশাসন',
        isSecurity: false,
      };
    case 'admin.deactivated':
      return {
        icon: UserX,
        iconBg: 'bg-amber-100 dark:bg-amber-950/50',
        iconColor: 'text-amber-600 dark:text-amber-400',
        groupLabelEn: 'Administration',
        groupLabelBn: 'প্রশাসন',
        isSecurity: false,
      };
    case 'admin.role_changed':
      return {
        icon: UserCog,
        iconBg: 'bg-indigo-100 dark:bg-indigo-950/50',
        iconColor: 'text-indigo-600 dark:text-indigo-400',
        groupLabelEn: 'Security',
        groupLabelBn: 'নিরাপত্তা',
        isSecurity: true,
      };

    case 'role.created':
      return {
        icon: ShieldPlus,
        iconBg: 'bg-sky-100 dark:bg-sky-950/50',
        iconColor: 'text-sky-600 dark:text-sky-400',
        groupLabelEn: 'Roles & Access',
        groupLabelBn: 'ভূমিকা ও অনুমতি',
        isSecurity: false,
      };
    case 'role.updated':
      return {
        icon: ShieldCheck,
        iconBg: 'bg-indigo-100 dark:bg-indigo-950/50',
        iconColor: 'text-indigo-600 dark:text-indigo-400',
        groupLabelEn: 'Roles & Access',
        groupLabelBn: 'ভূমিকা ও অনুমতি',
        isSecurity: false,
      };
    case 'role.permissions_changed':
      return {
        icon: Key,
        iconBg: 'bg-rose-100 dark:bg-rose-950/50',
        iconColor: 'text-rose-600 dark:text-rose-400',
        groupLabelEn: 'Security',
        groupLabelBn: 'নিরাপত্তা',
        isSecurity: true,
      };

    default:
      if (category === 'complaint') {
        return {
          icon: AlertCircle,
          iconBg: 'bg-amber-100 dark:bg-amber-950/50',
          iconColor: 'text-amber-600 dark:text-amber-400',
          groupLabelEn: 'Complaint',
          groupLabelBn: 'অভিযোগ',
          isSecurity: false,
        };
      }
      if (category === 'role') {
        return {
          icon: ShieldCheck,
          iconBg: 'bg-indigo-100 dark:bg-indigo-950/50',
          iconColor: 'text-indigo-600 dark:text-indigo-400',
          groupLabelEn: 'Roles & Access',
          groupLabelBn: 'ভূমিকা ও অনুমতি',
          isSecurity: isSecurity,
        };
      }
      if (category === 'administration') {
        return {
          icon: UserCheck,
          iconBg: 'bg-sky-100 dark:bg-sky-950/50',
          iconColor: 'text-sky-600 dark:text-sky-400',
          groupLabelEn: 'Administration',
          groupLabelBn: 'প্রশাসন',
          isSecurity: isSecurity,
        };
      }
      if (isSecurity) {
        return {
          icon: ShieldAlert,
          iconBg: 'bg-rose-100 dark:bg-rose-950/50',
          iconColor: 'text-rose-600 dark:text-rose-400',
          groupLabelEn: 'Security',
          groupLabelBn: 'নিরাপত্তা',
          isSecurity: true,
        };
      }
      return {
        icon: Bell,
        iconBg: 'bg-slate-100 dark:bg-slate-800',
        iconColor: 'text-slate-600 dark:text-slate-400',
        groupLabelEn: 'General',
        groupLabelBn: 'সাধারণ',
        isSecurity: false,
      };
  }
};
