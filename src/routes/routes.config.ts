import React from 'react';
import {
  LayoutDashboard,
  AlertCircle,
  MessageSquare,
  FolderTree,
  MapPin,
  MapPinned,
  ShieldCheck,
  Users,
  History,
} from 'lucide-react';
import { TranslationDictionary } from '@/context/LanguageContext';

export interface RouteItem {
  path: string;
  labelKey: keyof TranslationDictionary['nav'];
  defaultLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermission?: string;
  badge?: string;
  exact?: boolean;
}

export const ADMIN_NAVIGATION_ITEMS: RouteItem[] = [
  {
    path: '/dashboard',
    labelKey: 'dashboard',
    defaultLabel: 'Dashboard',
    icon: LayoutDashboard,
    requiredPermission: 'dashboard.view',
  },
  {
    path: '/complaints',
    labelKey: 'complaints',
    defaultLabel: 'Complaints',
    icon: AlertCircle,
    requiredPermission: 'complaints.view',
  },
  {
    path: '/responses',
    labelKey: 'responses',
    defaultLabel: 'Responses',
    icon: MessageSquare,
    requiredPermission: 'responses.view',
  },
  {
    path: '/categories',
    labelKey: 'categories',
    defaultLabel: 'Categories',
    icon: FolderTree,
    requiredPermission: 'categories.view',
  },
  {
    path: '/map',
    labelKey: 'map',
    defaultLabel: 'Map Monitoring',
    icon: MapPin,
    requiredPermission: 'map.view',
  },
  {
    path: '/location-activity',
    labelKey: 'locationActivity',
    defaultLabel: 'Location Activity',
    icon: MapPinned,
    requiredPermission: 'location_activity.view',
  },
  {
    path: '/users',
    labelKey: 'users',
    defaultLabel: 'User Management',
    icon: Users,
    requiredPermission: 'admin_users.view',
  },
  {
    path: '/roles',
    labelKey: 'roles',
    defaultLabel: 'Roles & Permissions',
    icon: ShieldCheck,
    requiredPermission: 'roles.manage',
  },
  {
    path: '/activity-log',
    labelKey: 'activityLog',
    defaultLabel: 'Activity Log',
    icon: History,
    requiredPermission: 'audit.view',
  },
];

/**
 * Calculates the first authorized navigation route for an active admin
 */
export const getFirstAccessibleRoute = (
  hasPermissionFn: (permission: string) => boolean,
  isBootstrapMode: boolean = false
): string => {
  if (isBootstrapMode) {
    return '/roles';
  }

  for (const item of ADMIN_NAVIGATION_ITEMS) {
    if (!item.requiredPermission || hasPermissionFn(item.requiredPermission)) {
      return item.path;
    }
  }

  // If no accessible route exists (e.g. 0 permissions assigned), return /dashboard to let PermissionGuard render AccessDenied
  return '/dashboard';
};

