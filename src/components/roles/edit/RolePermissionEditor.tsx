import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Badge } from '@/components/ui/Badge';
import { useLanguage, TranslationDictionary } from '@/context/LanguageContext';
import { PermissionCatalogueItem } from '@/types/Role';
import {
  KeyRound,
  CheckSquare,
  Square,
  AlertTriangle,
  Info,
  Lock,
  LayoutDashboard,
  AlertCircle,
  FolderTree,
  MapPin,
  MapPinned,
  MessageSquare,
  Users,
  ShieldCheck,
  History,
} from 'lucide-react';
import { cn } from '@/utils';

export interface RolePermissionEditorProps {
  selectedPermissionIds: string[];
  onPermissionsChange: (ids: string[]) => void;
  catalogue: PermissionCatalogueItem[];
  isSystem?: boolean;
}

export const RolePermissionEditor: React.FC<RolePermissionEditorProps> = ({
  selectedPermissionIds,
  onPermissionsChange,
  catalogue,
  isSystem = false,
}) => {
  const { t, language } = useLanguage();
  const isBn = language === 'bn';

  // Group permissions by module
  const groupedPermissions = useMemo(() => {
    const groups: Record<string, PermissionCatalogueItem[]> = {};
    catalogue.forEach((item) => {
      const mod = item.module || 'other';
      if (!groups[mod]) {
        groups[mod] = [];
      }
      groups[mod].push(item);
    });
    return groups;
  }, [catalogue]);

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

  const handleTogglePermission = (id: string) => {
    if (isSystem) return;
    if (selectedPermissionIds.includes(id)) {
      onPermissionsChange(selectedPermissionIds.filter((pId) => pId !== id));
    } else {
      onPermissionsChange([...selectedPermissionIds, id]);
    }
  };

  const handleSelectAllGlobal = () => {
    if (isSystem) return;
    const allIds = catalogue.map((item) => item.id);
    onPermissionsChange(allIds);
  };

  const handleClearAllGlobal = () => {
    if (isSystem) return;
    onPermissionsChange([]);
  };

  const handleToggleModule = (moduleKey: string) => {
    if (isSystem) return;
    const moduleItems = groupedPermissions[moduleKey] || [];
    const moduleIds = moduleItems.map((item) => item.id);
    const allSelected = moduleIds.every((id) => selectedPermissionIds.includes(id));

    if (allSelected) {
      onPermissionsChange(selectedPermissionIds.filter((id) => !moduleIds.includes(id)));
    } else {
      const combined = new Set([...selectedPermissionIds, ...moduleIds]);
      onPermissionsChange(Array.from(combined));
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

  const hasRolesManage = selectedPermissionIds.includes('roles.manage');

  return (
    <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
      <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t.roles.step2Title}
              </CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t.roles.permissionsCount
                  .replace('{count}', formatNumber(selectedPermissionIds.length))
                  .replace('{total}', formatNumber(catalogue.length))}
              </p>
            </div>
          </div>

          {!isSystem && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSelectAllGlobal}
                className="h-8 px-2.5 text-xs text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400"
                leftIcon={<CheckSquare className="w-3.5 h-3.5" />}
              >
                <span>{t.roles.selectAll}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearAllGlobal}
                className="h-8 px-2.5 text-xs text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400"
                leftIcon={<Square className="w-3.5 h-3.5" />}
              >
                <span>{t.roles.clearAll}</span>
              </Button>
            </div>
          )}

          {isSystem && (
            <Badge size="md" variant="subtle" status="info">
              <Lock className="w-3.5 h-3.5 mr-1" />
              {t.roles.systemRole}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-5">
        {/* System Role Lock Warning */}
        {isSystem && (
          <div className="p-3.5 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/70 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200 flex items-start gap-3">
            <Lock className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              {t.roles.systemRoleProtectedEditNotice}
            </p>
          </div>
        )}

        {/* Zero permissions warning */}
        {!isSystem && selectedPermissionIds.length === 0 && (
          <div
            role="alert"
            className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 flex items-start gap-2.5"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              {t.roles.noPermissionsWarning}
            </p>
          </div>
        )}

        {/* roles.manage removed warning */}
        {!isSystem && !hasRolesManage && (
          <div
            role="status"
            className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 flex items-start gap-2.5"
          >
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              {t.roles.rolesManageWarning}
            </p>
          </div>
        )}

        {/* Grouped Permission Modules */}
        <div className="space-y-4">
          {moduleKeys.map((moduleKey) => {
            const items = groupedPermissions[moduleKey] || [];
            const Icon = getModuleIcon(moduleKey);
            const moduleIds = items.map((item) => item.id);
            const allModuleSelected = moduleIds.length > 0 && moduleIds.every((id) => selectedPermissionIds.includes(id));
            const someModuleSelected = moduleIds.some((id) => selectedPermissionIds.includes(id));

            return (
              <div
                key={moduleKey}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden"
              >
                {/* Module Header */}
                <div className="p-3.5 sm:px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-md bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                        {getModuleLabel(moduleKey)}
                      </span>
                    </div>
                  </div>

                  {!isSystem && (
                    <button
                      type="button"
                      onClick={() => handleToggleModule(moduleKey)}
                      className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 focus-visible:outline-none focus-visible:underline"
                    >
                      {allModuleSelected
                        ? t.roles.clearAll
                        : t.roles.selectAll}
                    </button>
                  )}
                </div>

                {/* Module Permission Items */}
                <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map((perm) => {
                    const isChecked = selectedPermissionIds.includes(perm.id);
                    const permName = isBn ? perm.name_bn || perm.name_en : perm.name_en;

                    return (
                      <div
                        key={perm.id}
                        onClick={() => !isSystem && handleTogglePermission(perm.id)}
                        className={cn(
                          'p-3 rounded-lg border transition-all flex items-start gap-3 select-none',
                          isSystem ? 'cursor-default opacity-85' : 'cursor-pointer',
                          isChecked
                            ? 'bg-sky-50/50 dark:bg-sky-950/30 border-sky-300 dark:border-sky-800'
                            : 'bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        )}
                      >
                        <div onClick={(e) => e.stopPropagation()} className="shrink-0 mt-0.5">
                          <Checkbox
                            id={`perm-${perm.id}`}
                            checked={isChecked}
                            onChange={() => handleTogglePermission(perm.id)}
                            disabled={isSystem}
                            aria-label={permName}
                          />
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={cn(
                                'text-xs font-semibold block leading-snug',
                                isChecked
                                  ? 'text-sky-950 dark:text-sky-100'
                                  : 'text-slate-700 dark:text-slate-300',
                                isSystem ? 'cursor-default' : 'cursor-pointer'
                              )}
                            >
                              {permName}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
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

export default RolePermissionEditor;
