import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useLanguage, TranslationDictionary } from '@/context/LanguageContext';
import { PermissionCatalogueItem } from '@/types/Role';
import {
  KeyRound,
  CheckCircle2,
  XCircle,
  LayoutDashboard,
  AlertCircle,
  FolderTree,
  MapPin,
  MapPinned,
  MessageSquare,
  Users,
  ShieldCheck,
  History,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/utils';

export interface RolePermissionsViewProps {
  permissionIds: string[];
  catalogue: PermissionCatalogueItem[];
}

export const RolePermissionsView: React.FC<RolePermissionsViewProps> = ({
  permissionIds,
  catalogue,
}) => {
  const { t, language } = useLanguage();
  const isBn = language === 'bn';

  const assignedSet = useMemo(() => new Set(permissionIds), [permissionIds]);

  // Group ONLY assigned catalogue items by module (scope-safe inspection)
  const groupedPermissions = useMemo(() => {
    const groups: Record<string, PermissionCatalogueItem[]> = {};
    catalogue.forEach((item) => {
      if (!assignedSet.has(item.id)) return;
      const mod = item.module || 'other';
      if (!groups[mod]) {
        groups[mod] = [];
      }
      groups[mod].push(item);
    });
    return groups;
  }, [catalogue, assignedSet]);

  const moduleKeys = useMemo(() => Object.keys(groupedPermissions), [groupedPermissions]);

  const getModuleLabel = (moduleKey: string): string => {
    const keyMap: Record<string, keyof TranslationDictionary['roles']> = {
      dashboard: 'moduleDashboard',
      complaints: 'moduleComplaints',
      categories: 'moduleCategories',
      map: 'moduleMap',
      location_activity: 'moduleLocationActivity',
      responses: 'moduleResponses',
      admin_users: 'moduleAdminUsers',
      roles: 'moduleRoles',
      audit: 'moduleAudit',
    };

    const translationKey = keyMap[moduleKey];
    if (translationKey && t.roles[translationKey]) {
      return String(t.roles[translationKey]);
    }
    return moduleKey.replace(/_/g, ' ').toUpperCase();
  };

  const getModuleIcon = (moduleKey: string) => {
    switch (moduleKey) {
      case 'dashboard':
        return LayoutDashboard;
      case 'complaints':
        return AlertCircle;
      case 'categories':
        return FolderTree;
      case 'map':
        return MapPin;
      case 'location_activity':
        return MapPinned;
      case 'responses':
        return MessageSquare;
      case 'admin_users':
        return Users;
      case 'roles':
        return ShieldCheck;
      case 'audit':
        return History;
      default:
        return Lock;
    }
  };

  const formatNumber = (num: number): string => {
    if (!isBn) return String(num);
    const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(num)
      .split('')
      .map((d) => (/[0-9]/.test(d) ? bnDigits[parseInt(d, 10)] : d))
      .join('');
  };

  return (
    <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
      <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t.roles.assignedPermissions}
              </CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t.roles.assignedPermissionsCount.replace('{count}', formatNumber(permissionIds.length))}
              </p>
            </div>
          </div>

          <Badge
            size="md"
            variant="subtle"
            status={permissionIds.length > 0 ? 'info' : 'warning'}
          >
            {t.roles.assignedCountBadge.replace('{count}', formatNumber(permissionIds.length))}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-6">
        {/* Zero permissions empty state */}
        {permissionIds.length === 0 && (
          <div className="p-6 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 text-center space-y-2">
            <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              {t.roles.noAssignedPermissions}
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-300 max-w-md mx-auto">
              {t.roles.noAssignedPermissionsDesc}
            </p>
          </div>
        )}

        {/* Grouped Modules */}
        <div className="space-y-4">
          {moduleKeys.map((moduleKey) => {
            const items = groupedPermissions[moduleKey] || [];
            const Icon = getModuleIcon(moduleKey);

            return (
              <div
                key={moduleKey}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 transition-colors"
              >
                {/* Module Header */}
                <div className="p-3.5 sm:px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 rounded-t-xl">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-md bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                      {getModuleLabel(moduleKey)}
                    </span>
                  </div>

                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {t.roles.assignedCountBadge.replace('{count}', formatNumber(items.length))}
                  </span>
                </div>

                {/* Module Permission Items Grid */}
                <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {items.map((perm) => {
                    const permName = isBn ? perm.name_bn || perm.name_en : perm.name_en;

                    return (
                      <div
                        key={perm.id}
                        className="p-3 rounded-lg border bg-sky-50/40 dark:bg-sky-950/20 border-sky-200/70 dark:border-sky-900/50 text-slate-900 dark:text-slate-100 flex items-start gap-2.5"
                      >
                        <div className="mt-0.5 shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {permName}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 shrink-0">
                              {perm.id}
                            </span>
                          </div>

                          {perm.description && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal line-clamp-2">
                              {perm.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default RolePermissionsView;
