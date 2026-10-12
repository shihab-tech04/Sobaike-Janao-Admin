import React, { useMemo } from 'react';
import {
  Lock,
  ArrowRight,
  ArrowLeft,
  X,
  RotateCcw,
  AlertTriangle,
  Info,
  CheckSquare,
  Square,
  LayoutDashboard,
  AlertCircle,
  FolderTree,
  MapPin,
  MapPinned,
  MessageSquare,
  Users,
  ShieldCheck,
  History,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Badge } from '@/components/ui/Badge';
import { useLanguage, TranslationDictionary } from '@/context/LanguageContext';
import { PermissionCatalogueItem } from '@/types/Role';
import { cn } from '@/utils';

export interface StepPermissionsProps {
  selectedPermissionIds: string[];
  onPermissionsChange: (ids: string[]) => void;
  permissionCatalogue: PermissionCatalogueItem[];
  isLoadingCatalogue: boolean;
  catalogueError: { message: string; isPermissionDenied: boolean } | string | null;
  onRetryCatalogue: () => void;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
}

export const StepPermissions: React.FC<StepPermissionsProps> = ({
  selectedPermissionIds,
  onPermissionsChange,
  permissionCatalogue,
  isLoadingCatalogue,
  catalogueError,
  onRetryCatalogue,
  onNext,
  onBack,
  onCancel,
}) => {
  const { t, language } = useLanguage();
  const isBn = language === 'bn';

  const catalogue = permissionCatalogue;
  const loading = isLoadingCatalogue;

  const error = useMemo(() => {
    if (!catalogueError) return null;
    if (typeof catalogueError === 'string') {
      return { message: catalogueError, isPermissionDenied: false };
    }
    return catalogueError;
  }, [catalogueError]);

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
    if (selectedPermissionIds.includes(id)) {
      onPermissionsChange(selectedPermissionIds.filter((pId) => pId !== id));
    } else {
      onPermissionsChange([...selectedPermissionIds, id]);
    }
  };

  const handleSelectAllGlobal = () => {
    const allIds = catalogue.map((item) => item.id);
    onPermissionsChange(allIds);
  };

  const handleClearAllGlobal = () => {
    onPermissionsChange([]);
  };

  const handleToggleModule = (moduleKey: string) => {
    const moduleItems = groupedPermissions[moduleKey] || [];
    const moduleIds = moduleItems.map((item) => item.id);
    const allSelected = moduleIds.every((id) => selectedPermissionIds.includes(id));

    if (allSelected) {
      // Clear this module
      onPermissionsChange(selectedPermissionIds.filter((id) => !moduleIds.includes(id)));
    } else {
      // Select all in this module
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

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <CardTitle>{t.roles.step2Title}</CardTitle>
                <CardDescription>{t.roles.step2Description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 animate-pulse space-y-3"
                >
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                  <div className="space-y-2">
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <Button
            id="step2-loading-back-btn"
            type="button"
            variant="secondary"
            size="md"
            onClick={onBack}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          >
            <span>{t.roles.back}</span>
          </Button>

          <Button
            id="step2-loading-cancel-btn"
            type="button"
            variant="ghost"
            size="md"
            onClick={onCancel}
            leftIcon={<X className="w-4 h-4" />}
          >
            <span>{t.roles.cancel}</span>
          </Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div
              className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center mx-auto',
                error.isPermissionDenied
                  ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400'
                  : 'bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400'
              )}
            >
              {error.isPermissionDenied ? (
                <ShieldAlert className="w-6 h-6" />
              ) : (
                <AlertCircle className="w-6 h-6" />
              )}
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {error.isPermissionDenied
                  ? t.roles.permissionRequired
                  : t.roles.failedToLoad}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {error.isPermissionDenied
                  ? t.roles.permissionDeniedMessage
                  : error.message || t.roles.loadPermissionsError}
              </p>
            </div>
            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={onRetryCatalogue}
                leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                <span>{t.roles.retry}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onBack}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          >
            <span>{t.roles.back}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onCancel}
            leftIcon={<X className="w-4 h-4" />}
          >
            <span>{t.roles.cancel}</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <CardTitle>{t.roles.step2Title}</CardTitle>
                <CardDescription>{t.roles.step2Description}</CardDescription>
              </div>
            </div>

            {/* Global Select/Clear All actions */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSelectAllGlobal}
                disabled={selectedPermissionIds.length === catalogue.length}
                leftIcon={<CheckSquare className="w-3.5 h-3.5" />}
                className="text-xs"
              >
                <span>{t.roles.selectAll}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearAllGlobal}
                disabled={selectedPermissionIds.length === 0}
                leftIcon={<Square className="w-3.5 h-3.5" />}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                <span>{t.roles.clearAll}</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 pt-4">
          {/* Permissions Selection Status Bar */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {t.roles.permissionsCount
                .replace('{count}', formatNumber(selectedPermissionIds.length))
                .replace('{total}', formatNumber(catalogue.length))}
            </span>
            <Badge
              status={selectedPermissionIds.length > 0 ? 'info' : 'default'}
              size="sm"
            >
              {t.roles.selectedCount.replace(
                '{count}',
                formatNumber(selectedPermissionIds.length)
              )}
            </Badge>
          </div>

          {/* Zero Permissions Warning (Non-blocking) */}
          {selectedPermissionIds.length === 0 && (
            <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{t.roles.noPermissionsWarning}</p>
            </div>
          )}

          {/* roles.manage Warning (Neutral Note) */}
          {selectedPermissionIds.length > 0 && !hasRolesManage && (
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
              <Info className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{t.roles.rolesManageWarning}</p>
            </div>
          )}

          {/* Module-grouped Permission Cards */}
          <div className="space-y-4">
            {moduleKeys.map((moduleKey) => {
              const items = groupedPermissions[moduleKey] || [];
              const moduleIds = items.map((i) => i.id);
              const selectedInModule = items.filter((i) =>
                selectedPermissionIds.includes(i.id)
              );
              const isAllModuleSelected =
                items.length > 0 && selectedInModule.length === items.length;
              const isSomeModuleSelected =
                selectedInModule.length > 0 && !isAllModuleSelected;
              const ModuleIcon = getModuleIcon(moduleKey);

              return (
                <div
                  key={moduleKey}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs"
                >
                  {/* Module Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
                        <ModuleIcon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {getModuleLabel(moduleKey)}
                      </span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        ({formatNumber(selectedInModule.length)}/
                        {formatNumber(items.length)})
                      </span>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleModule(moduleKey)}
                      className="h-7 text-xs px-2"
                    >
                      {isAllModuleSelected ? t.roles.clearAll : t.roles.selectAll}
                    </Button>
                  </div>

                  {/* Module Items Grid */}
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {items.map((perm) => {
                      const isChecked = selectedPermissionIds.includes(perm.id);
                      const displayName = isBn && perm.name_bn ? perm.name_bn : perm.name_en;

                      return (
                        <div
                          key={perm.id}
                          onClick={() => handleTogglePermission(perm.id)}
                          className={cn(
                            'p-3 rounded-lg border transition-all duration-150 cursor-pointer flex items-start gap-3 select-none',
                            isChecked
                              ? 'bg-sky-50/60 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800/80 ring-1 ring-sky-300/40 dark:ring-sky-700/40'
                              : 'bg-white dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                          )}
                        >
                          <Checkbox
                            id={`perm-checkbox-${perm.id.replace(/\./g, '-')}`}
                            checked={isChecked}
                            onChange={() => handleTogglePermission(perm.id)}
                            className="mt-0.5 shrink-0"
                            aria-label={displayName}
                          />

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={cn(
                                  'text-xs font-semibold leading-tight',
                                  isChecked
                                    ? 'text-sky-950 dark:text-sky-100'
                                    : 'text-slate-800 dark:text-slate-200'
                                )}
                              >
                                {displayName}
                              </span>
                            </div>

                            {perm.description && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                                {perm.description}
                              </p>
                            )}

                            <div className="pt-0.5">
                              <code className="text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded">
                                {perm.id}
                              </code>
                            </div>
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

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <Button
          id="step2-back-btn"
          type="button"
          variant="secondary"
          size="md"
          onClick={onBack}
          leftIcon={<ArrowLeft className="w-4 h-4" />}
        >
          <span>{t.roles.back}</span>
        </Button>

        <div className="flex items-center gap-2.5">
          <Button
            id="step2-cancel-btn"
            type="button"
            variant="ghost"
            size="md"
            onClick={onCancel}
            leftIcon={<X className="w-4 h-4" />}
          >
            <span>{t.roles.cancel}</span>
          </Button>

          <Button
            id="step2-next-btn"
            type="button"
            variant="primary"
            size="md"
            onClick={onNext}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            <span>{t.roles.next}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StepPermissions;
