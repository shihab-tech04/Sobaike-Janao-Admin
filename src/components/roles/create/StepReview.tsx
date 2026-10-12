import React, { useMemo } from 'react';
import {
  FileCheck,
  ArrowLeft,
  X,
  Edit2,
  Check,
  AlertTriangle,
  Info,
  Shield,
  Lock,
  AlertCircle,
  ShieldAlert,
  Hash,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useLanguage, TranslationDictionary } from '@/context/LanguageContext';
import { PermissionCatalogueItem } from '@/types/Role';
import { generateRoleSlug } from '@/utils/roleUtils';
import { cn } from '@/utils';

export interface StepReviewProps {
  nameEn: string;
  nameBn: string;
  active: boolean;
  description: string;
  selectedPermissionIds: string[];
  permissionCatalogue: PermissionCatalogueItem[];
  isSubmitting: boolean;
  submitError: { message: string; isDuplicate: boolean; isPermissionDenied: boolean; isCompatibility?: boolean } | null;
  onEditDetails: () => void;
  onEditPermissions: () => void;
  onSubmit: () => void;
  onBack: () => void;
  onCancel: () => void;
}

export const StepReview: React.FC<StepReviewProps> = ({
  nameEn,
  nameBn,
  active,
  description,
  selectedPermissionIds,
  permissionCatalogue,
  isSubmitting,
  submitError,
  onEditDetails,
  onEditPermissions,
  onSubmit,
  onBack,
  onCancel,
}) => {
  const { t, language } = useLanguage();
  const isBn = language === 'bn';

  const trimmedNameEn = nameEn.trim();
  const trimmedNameBn = nameBn.trim();
  const technicalSlug = generateRoleSlug(trimmedNameEn);

  const formatNumber = (num: number): string => {
    if (!isBn) return String(num);
    const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(num)
      .split('')
      .map((d) => (/[0-9]/.test(d) ? bnDigits[parseInt(d, 10)] : d))
      .join('');
  };

  // Build catalogue map
  const catalogueMap = useMemo(() => {
    const map = new Map<string, PermissionCatalogueItem>();
    permissionCatalogue.forEach((item) => map.set(item.id, item));
    return map;
  }, [permissionCatalogue]);

  // Selected permission items grouped by module
  const selectedByModule = useMemo(() => {
    const groups: Record<string, PermissionCatalogueItem[]> = {};
    selectedPermissionIds.forEach((id) => {
      const item = catalogueMap.get(id);
      if (item) {
        const mod = item.module || 'other';
        if (!groups[mod]) groups[mod] = [];
        groups[mod].push(item);
      } else {
        const mod = 'other';
        if (!groups[mod]) groups[mod] = [];
        groups[mod].push({
          id,
          module: 'other',
          action: 'access',
          name_en: id,
          name_bn: null,
          description: null,
          created_at: '',
        });
      }
    });
    return groups;
  }, [selectedPermissionIds, catalogueMap]);

  const selectedModuleKeys = useMemo(
    () => Object.keys(selectedByModule),
    [selectedByModule]
  );

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

  const hasRolesManage = selectedPermissionIds.includes('roles.manage');

  return (
    <div className="space-y-6">
      {/* Submission Error Banner */}
      {submitError && (
        <div
          className={cn(
            'p-4 rounded-xl border flex items-start gap-3 text-sm animate-in fade-in',
            submitError.isDuplicate || submitError.isPermissionDenied || submitError.isCompatibility
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
          )}
        >
          {submitError.isPermissionDenied ? (
            <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          ) : submitError.isDuplicate || submitError.isCompatibility ? (
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          )}

          <div className="space-y-0.5 flex-1">
            <h4 className="font-semibold text-xs sm:text-sm">
              {submitError.isCompatibility
                ? t.roles.createCompatibilityError
                : submitError.isDuplicate
                ? t.roles.duplicateNameError
                : submitError.isPermissionDenied
                ? t.roles.permissionDeniedCreate
                : t.roles.generalCreateError}
            </h4>
            {submitError.message &&
              !submitError.isDuplicate &&
              !submitError.isPermissionDenied &&
              !submitError.isCompatibility && (
                <p className="text-xs opacity-90">{submitError.message}</p>
              )}
          </div>
        </div>
      )}

      {/* Main Review Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <CardTitle>{t.roles.step3Title}</CardTitle>
              <CardDescription>{t.roles.step3Description}</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-5">
          {/* Section 1: Role Details Summary */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t.roles.reviewRoleDetails}
                </h3>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onEditDetails}
                disabled={isSubmitting}
                leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                className="h-7 text-xs px-2"
              >
                <span>{t.roles.edit}</span>
              </Button>
            </div>

            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
              {/* English Name */}
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block mb-0.5">
                  {t.roles.englishName}
                </span>
                <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                  {trimmedNameEn}
                </span>
              </div>

              {/* Bengali Name */}
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block mb-0.5">
                  {t.roles.bengaliName}
                </span>
                <span className="text-slate-900 dark:text-slate-100 text-sm sm:text-base font-medium">
                  {trimmedNameBn ? (
                    trimmedNameBn
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500 italic">
                      {t.roles.notSpecified}
                    </span>
                  )}
                </span>
              </div>

              {/* Technical Role ID */}
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block mb-0.5 flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  {t.roles.technicalRoleId}
                </span>
                <code className="font-mono text-xs sm:text-sm font-semibold text-sky-600 dark:text-sky-400 break-all">
                  {technicalSlug}
                </code>
              </div>

              {/* Status */}
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block mb-0.5">
                  {t.roles.status}
                </span>
                <Badge status={active ? 'success' : 'default'} size="sm">
                  {active ? t.roles.active : t.roles.inactive}
                </Badge>
              </div>

              {/* Description */}
              <div className="sm:col-span-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <span className="text-xs text-slate-500 dark:text-slate-400 block mb-0.5">
                  {t.roles.descriptionLabel}
                </span>
                <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {description.trim() ? (
                    description.trim()
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500 italic">—</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Permissions Summary */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t.roles.reviewPermissions}
                </h3>
                <Badge
                  status={selectedPermissionIds.length > 0 ? 'info' : 'default'}
                  size="sm"
                >
                  {formatNumber(selectedPermissionIds.length)}{' '}
                  {selectedPermissionIds.length === 1
                    ? t.roles.permissionSingular
                    : t.roles.permissionPlural}
                </Badge>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onEditPermissions}
                disabled={isSubmitting}
                leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                className="h-7 text-xs px-2"
              >
                <span>{t.roles.edit}</span>
              </Button>
            </div>

            <div className="p-4 space-y-4">
              {/* Zero Permissions Warning */}
              {selectedPermissionIds.length === 0 ? (
                <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">{t.roles.noPermissionsWarning}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedModuleKeys.map((moduleKey) => {
                    const items = selectedByModule[moduleKey] || [];
                    return (
                      <div
                        key={moduleKey}
                        className="p-3 rounded-lg bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {getModuleLabel(moduleKey)}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {formatNumber(items.length)}{' '}
                            {items.length === 1
                              ? t.roles.permissionSingular
                              : t.roles.permissionPlural}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {items.map((perm) => {
                            const displayName = isBn && perm.name_bn ? perm.name_bn : perm.name_en;
                            return (
                              <span
                                key={perm.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 shadow-2xs"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
                                <span>{displayName}</span>
                                <code className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                                  {perm.id}
                                </code>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Informational note if roles.manage is missing */}
              {selectedPermissionIds.length > 0 && !hasRolesManage && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
                  <Info className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">{t.roles.rolesManageWarning}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer Actions */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <Button
          id="step3-back-btn"
          type="button"
          variant="secondary"
          size="md"
          onClick={onBack}
          disabled={isSubmitting}
          leftIcon={<ArrowLeft className="w-4 h-4" />}
        >
          <span>{t.roles.back}</span>
        </Button>

        <div className="flex items-center gap-2.5">
          <Button
            id="step3-cancel-btn"
            type="button"
            variant="ghost"
            size="md"
            onClick={onCancel}
            disabled={isSubmitting}
            leftIcon={<X className="w-4 h-4" />}
          >
            <span>{t.roles.cancel}</span>
          </Button>

          <Button
            id="create-role-submit-btn"
            type="button"
            variant="primary"
            size="md"
            onClick={onSubmit}
            isLoading={isSubmitting}
            disabled={isSubmitting || trimmedNameEn.length === 0 || technicalSlug.length === 0}
            leftIcon={<Check className="w-4 h-4" />}
          >
            <span>{isSubmitting ? t.roles.submitting : t.roles.createRole}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StepReview;
