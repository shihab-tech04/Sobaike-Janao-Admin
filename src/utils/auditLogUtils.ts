import {
  FileCheck,
  FileX,
  UserPlus,
  UserCheck,
  UserX,
  UserCog,
  ShieldPlus,
  ShieldAlert,
  Shield,
  Clock,
  HelpCircle,
} from 'lucide-react';
import React from 'react';

export interface ActionDisplayMeta {
  labelEn: string;
  labelBn: string;
  descEn: string;
  descBn: string;
  category: 'complaint' | 'user' | 'role' | 'system';
  severity: 'success' | 'warning' | 'danger' | 'info';
  icon: React.ComponentType<{ className?: string }>;
}

const ACTION_REGISTRY: Record<string, ActionDisplayMeta> = {
  'complaint.publish': {
    labelEn: 'Complaint Published',
    labelBn: 'অভিযোগ প্রকাশিত',
    descEn: 'Complaint made public on the citizen portal',
    descBn: 'নাগরিক পোর্টালে অভিযোগটি সার্বজনীন করা হয়েছে',
    category: 'complaint',
    severity: 'success',
    icon: FileCheck,
  },
  'complaint.unpublish': {
    labelEn: 'Complaint Unpublished',
    labelBn: 'অভিযোগ অপ্রকাশিত',
    descEn: 'Complaint removed from public visibility',
    descBn: 'সার্বজনীন প্রদর্শন থেকে অভিযোগটি সরানো হয়েছে',
    category: 'complaint',
    severity: 'warning',
    icon: FileX,
  },
  'complaint.reject': {
    labelEn: 'Complaint Rejected',
    labelBn: 'অভিযোগ বাতিল',
    descEn: 'Complaint rejected with justification code',
    descBn: 'যুক্তিসঙ্গত কারণসহ অভিযোগটি বাতিল করা হয়েছে',
    category: 'complaint',
    severity: 'danger',
    icon: FileX,
  },
  'admin.created': {
    labelEn: 'Administrator Created',
    labelBn: 'প্রশাসক তৈরি',
    descEn: 'New administrative account provisioned',
    descBn: 'নতুন প্রশাসনিক অ্যাকাউন্ট তৈরি করা হয়েছে',
    category: 'user',
    severity: 'success',
    icon: UserPlus,
  },
  'USER_MEMBERSHIP_FINALIZED': {
    labelEn: 'User Membership Finalized',
    labelBn: 'সদস্যপদ চূড়ান্তকরণ',
    descEn: 'Admin user assigned to active role in directory',
    descBn: 'ডিরেক্টরিতে ব্যবহারকারীর সক্রিয় ভূমিকা নির্ধারণ সম্পন্ন',
    category: 'user',
    severity: 'success',
    icon: UserCheck,
  },
  'admin.activated': {
    labelEn: 'Administrator Activated',
    labelBn: 'প্রশাসক সক্রিয়',
    descEn: 'Admin account reactivated for system access',
    descBn: 'সিস্টেম প্রবেশাধিকারের জন্য অ্যাকাউন্ট সক্রিয় করা হয়েছে',
    category: 'user',
    severity: 'success',
    icon: UserCheck,
  },
  'admin.deactivated': {
    labelEn: 'Administrator Deactivated',
    labelBn: 'প্রশাসক নিষ্ক্রিয়',
    descEn: 'Admin account deactivated and access suspended',
    descBn: 'প্রশাসক অ্যাকাউন্ট নিষ্ক্রিয় ও প্রবেশ স্থগিত করা হয়েছে',
    category: 'user',
    severity: 'danger',
    icon: UserX,
  },
  'admin.role_changed': {
    labelEn: 'Admin Role Changed',
    labelBn: 'প্রশাসকের ভূমিকা পরিবর্তন',
    descEn: 'Administrative role assignment modified',
    descBn: 'প্রশাসনিক ভূমিকার বরাদ্দ পরিবর্তন করা হয়েছে',
    category: 'user',
    severity: 'info',
    icon: UserCog,
  },
  'ADMIN_USER_UPDATED': {
    labelEn: 'Admin User Updated',
    labelBn: 'প্রশাসক তথ্য আপডেট',
    descEn: 'Administrative user profile or status modified',
    descBn: 'প্রশাসনিক ব্যবহারকারী প্রোফাইল বা অবস্থা পরিবর্তিত',
    category: 'user',
    severity: 'info',
    icon: UserCog,
  },
  'ADMIN_USER_DELETED': {
    labelEn: 'Administrator Deleted',
    labelBn: 'প্রশাসক মুছে ফেলা হয়েছে',
    descEn: 'Administrative user permanently removed from system',
    descBn: 'প্রশাসনিক ব্যবহারকারীকে স্থায়ীভাবে সিস্টেম থেকে মুছে ফেলা হয়েছে',
    category: 'user',
    severity: 'danger',
    icon: UserX,
  },
  'role.created': {
    labelEn: 'Role Created',
    labelBn: 'ভূমিকা তৈরি',
    descEn: 'New RBAC administrative role created',
    descBn: 'নতুন প্রশাসনিক ভূমিকা (RBAC) তৈরি করা হয়েছে',
    category: 'role',
    severity: 'success',
    icon: ShieldPlus,
  },
  'ROLE_CREATED': {
    labelEn: 'Role Created',
    labelBn: 'ভূমিকা তৈরি',
    descEn: 'New RBAC administrative role created',
    descBn: 'নতুন প্রশাসনিক ভূমিকা তৈরি করা হয়েছে',
    category: 'role',
    severity: 'success',
    icon: ShieldPlus,
  },
  'role.updated': {
    labelEn: 'Role Updated',
    labelBn: 'ভূমিকা আপডেট',
    descEn: 'Administrative role metadata modified',
    descBn: 'প্রশাসনিক ভূমিকার বিবরণ আপডেট করা হয়েছে',
    category: 'role',
    severity: 'info',
    icon: Shield,
  },
  'ROLE_UPDATED': {
    labelEn: 'Role Updated',
    labelBn: 'ভূমিকা আপডেট',
    descEn: 'Administrative role metadata modified',
    descBn: 'প্রশাসনিক ভূমিকার বিবরণ আপডেট করা হয়েছে',
    category: 'role',
    severity: 'info',
    icon: Shield,
  },
  'role.permissions_changed': {
    labelEn: 'Role Permissions Modified',
    labelBn: 'ভূমিকার অনুমতি পরিবর্তন',
    descEn: 'Permission capabilities added or revoked for role',
    descBn: 'ভূমিকাটির অনুমতির পরিধি সংযোজন বা প্রত্যাহার করা হয়েছে',
    category: 'role',
    severity: 'warning',
    icon: ShieldAlert,
  },
  'ROLE_PERMISSIONS_REPLACED': {
    labelEn: 'Role Permissions Replaced',
    labelBn: 'ভূমিকার অনুমতি প্রতিস্থাপন',
    descEn: 'Full permission set replaced for administrative role',
    descBn: 'প্রশাসনিক ভূমিকার সকল অনুমতির তালিকা পুনর্নির্ধারণ করা হয়েছে',
    category: 'role',
    severity: 'warning',
    icon: ShieldAlert,
  },
};

/**
 * Resolves human-readable action metadata for any audit action code
 */
export const getAuditActionMeta = (action: string): ActionDisplayMeta => {
  if (ACTION_REGISTRY[action]) {
    return ACTION_REGISTRY[action];
  }

  // Graceful fallback for arbitrary canonical actions
  const formatted = action
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    labelEn: formatted,
    labelBn: formatted,
    descEn: `Operation recorded: ${action}`,
    descBn: `সম্পাদিত কার্যক্রম: ${action}`,
    category: 'system',
    severity: 'info',
    icon: Clock,
  };
};

export interface ActorDisplayInfo {
  primary: string;
  secondary: string | null;
  isSystem: boolean;
}

/**
 * Resolves the display representation of an audit actor.
 * Priority:
 * 1. actor_display_name
 * 2. actor_email
 * 3. actor_id
 * 4. only then "System" / Bangla equivalent
 * 
 * Never labels actor as System if actor_email or actor_id exists.
 */
export const getActorDisplayInfo = (
  log: {
    actor_display_name?: string | null;
    actor_email?: string | null;
    actor_id?: string | null;
  },
  language: 'en' | 'bn'
): ActorDisplayInfo => {
  const name = log.actor_display_name?.trim() || null;
  const email = log.actor_email?.trim() || null;
  const id = log.actor_id?.trim() || null;

  if (name) {
    return {
      primary: name,
      secondary: email || (id ? `ID: ${id}` : null),
      isSystem: false,
    };
  }

  if (email) {
    return {
      primary: email,
      secondary: id ? `ID: ${id}` : null,
      isSystem: false,
    };
  }

  if (id) {
    return {
      primary: id,
      secondary: null,
      isSystem: false,
    };
  }

  return {
    primary: language === 'bn' ? 'সিস্টেম' : 'System',
    secondary: null,
    isSystem: true,
  };
};

/**
 * Derives a clean, localized summary snippet for any audit log entry.
 * Prevents misleading "Role → Role" literal fallbacks and derives real details.
 */
export const formatAuditSummary = (
  log: {
    action: string;
    details?: Record<string, any> | null;
  },
  language: 'en' | 'bn'
): string => {
  const { action, details } = log;
  const isBn = language === 'bn';

  if (action === 'admin.role_changed' || action === 'ADMIN_USER_UPDATED') {
    if (!details || typeof details !== 'object') {
      return '—';
    }

    // A. If real role transition data exists
    const prevRole = details.previous_role_name || details.previous_role_id;
    const newRole =
      details.new_role_name ||
      details.new_role_id ||
      (details.role_changed ? details.role_name || details.role_id : undefined);

    if (
      prevRole &&
      newRole &&
      (prevRole !== newRole || details.role_changed === true || action === 'admin.role_changed')
    ) {
      return `${prevRole} → ${newRole}`;
    }
    if (prevRole && !newRole && (details.role_changed === true || action === 'admin.role_changed')) {
      return `${prevRole} → —`;
    }
    if (!prevRole && newRole && (details.role_changed === true || action === 'admin.role_changed')) {
      return `— → ${newRole}`;
    }

    // B. Otherwise, use real available details when present
    // 1. active/status change
    if (details.active_changed === true || typeof details.active === 'boolean') {
      if (typeof details.active === 'boolean') {
        const statusText = details.active
          ? isBn ? 'অবস্থা: সক্রিয়' : 'Status: Active'
          : isBn ? 'অবস্থা: নিষ্ক্রিয়' : 'Status: Inactive';
        if (details.reason) {
          return `${statusText} (${details.reason})`;
        }
        return statusText;
      }
    }

    // 2. display_name change
    if (details.display_name) {
      return isBn ? `নাম: ${details.display_name}` : `Name: ${details.display_name}`;
    }

    // 3. other supported real fields
    if (details.reason) {
      return details.reason;
    }

    if (details.email) {
      return isBn ? `ইমেইল: ${details.email}` : `Email: ${details.email}`;
    }

    // C. If no meaningful safe summary can be derived: show —
    return '—';
  }

  if (action === 'role.permissions_changed' || action === 'ROLE_PERMISSIONS_REPLACED') {
    const addedCount = details?.added_permissions?.length || details?.added_count || 0;
    const removedCount = details?.removed_permissions?.length || details?.removed_count || 0;
    return isBn
      ? `+${addedCount} / -${removedCount} অনুমতি`
      : `+${addedCount} / -${removedCount} permissions`;
  }

  if (action === 'complaint.reject') {
    return details?.reason_code || (isBn ? 'বাতিল করা হয়েছে' : 'Rejected');
  }

  if (action === 'complaint.publish') {
    return isBn ? 'পাবলিক ফিডে প্রকাশিত' : 'Published to public feed';
  }

  if (action === 'complaint.unpublish') {
    return details?.reason || (isBn ? 'অপ্রকাশিত' : 'Unpublished');
  }

  if (action === 'admin.created') {
    return details?.role_name
      ? isBn ? `ভূমিকা: ${details.role_name}` : `Role: ${details.role_name}`
      : isBn ? 'তৈরি সম্পন্ন' : 'Provisioned';
  }

  if (action === 'admin.activated') {
    return isBn ? 'সক্রিয় করা হয়েছে' : 'Activated';
  }

  if (action === 'admin.deactivated') {
    return isBn ? 'নিষ্ক্রিয় করা হয়েছে' : 'Deactivated';
  }

  if (action === 'role.created' || action === 'ROLE_CREATED') {
    return details?.name || details?.name_en || (isBn ? 'নতুন ভূমিকা তৈরি' : 'New role created');
  }

  if (action === 'role.updated' || action === 'ROLE_UPDATED') {
    return details?.name || details?.name_en || (isBn ? 'ভূমিকা তথ্য আপডেট' : 'Role updated');
  }

  if (action === 'USER_MEMBERSHIP_FINALIZED') {
    return details?.role_name || details?.role_id
      ? isBn
        ? `ভূমিকা: ${details.role_name || details.role_id}`
        : `Role: ${details.role_name || details.role_id}`
      : isBn
      ? 'সদস্যপদ চূড়ান্তকরণ'
      : 'Membership finalized';
  }

  return '—';
};

/**
 * Returns localized target type label
 */
export const formatTargetType = (targetType: string, language: 'en' | 'bn'): string => {
  const norm = (targetType || '').toLowerCase();
  switch (norm) {
    case 'complaint':
      return language === 'bn' ? 'অভিযোগ' : 'Complaint';
    case 'admin_user':
    case 'user':
      return language === 'bn' ? 'প্রশাসক' : 'Administrator';
    case 'role':
      return language === 'bn' ? 'ভূমিকা' : 'Role';
    default:
      return targetType || (language === 'bn' ? 'অজানা' : 'Unknown');
  }
};

/**
 * Returns Tailwind class names for action badges
 */
export const getSeverityClasses = (severity: 'success' | 'warning' | 'danger' | 'info'): {
  badge: string;
  dot: string;
} => {
  switch (severity) {
    case 'success':
      return {
        badge: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
        dot: 'bg-emerald-500',
      };
    case 'warning':
      return {
        badge: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
        dot: 'bg-amber-500',
      };
    case 'danger':
      return {
        badge: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
        dot: 'bg-rose-500',
      };
    case 'info':
    default:
      return {
        badge: 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60',
        dot: 'bg-sky-500',
      };
  }
};

/**
 * Deep sanitization of audit details payload to ensure no sensitive
 * tokens, credentials, or secrets are ever exposed in UI.
 */
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'token',
  'secret',
  'credential',
  'auth_key',
  'api_key',
  'private_key',
  'hash',
  'evidence_url',
];

export const sanitizeAuditDetails = (details: Record<string, any>): Record<string, any> => {
  if (!details || typeof details !== 'object') return {};

  const clean: Record<string, any> = {};

  for (const [key, val] of Object.entries(details)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) =>
      key.toLowerCase().includes(pattern)
    );

    if (isSensitive) {
      clean[key] = '[REDACTED]';
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      clean[key] = sanitizeAuditDetails(val);
    } else {
      clean[key] = val;
    }
  }

  return clean;
};

/**
 * Localized date formatter with Bengali numeral conversion
 */
export const formatAuditTimestamp = (
  isoString: string,
  language: 'en' | 'bn'
): { date: string; time: string; full: string } => {
  if (!isoString) {
    return { date: '—', time: '—', full: '—' };
  }

  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) {
      return { date: '—', time: '—', full: '—' };
    }

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const year = d.getFullYear();
    const monthNamesEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthNamesBn = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];

    const monthStr = language === 'bn' ? monthNamesBn[d.getMonth()] : monthNamesEn[d.getMonth()];
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());

    let datePart = `${day} ${monthStr} ${year}`;
    let timePart = `${hours}:${minutes}:${seconds}`;

    if (language === 'bn') {
      const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
      datePart = datePart.replace(/\d/g, (digit) => bnDigits[Number(digit)]);
      timePart = timePart.replace(/\d/g, (digit) => bnDigits[Number(digit)]);
    }

    return {
      date: datePart,
      time: timePart,
      full: `${datePart} ${timePart}`,
    };
  } catch {
    return { date: '—', time: '—', full: '—' };
  }
};
