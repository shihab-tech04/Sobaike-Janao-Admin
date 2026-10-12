import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useLanguage } from '@/context/LanguageContext';
import { roleApi } from '@/services/api';
import { RoleDetail, PermissionCatalogueItem, RoleApiError } from '@/types/Role';
import { RoleOverviewCard } from '@/components/roles/detail/RoleOverviewCard';
import { RolePermissionsView } from '@/components/roles/detail/RolePermissionsView';
import { RoleLoadingSkeleton } from '@/components/roles/RoleLoadingSkeleton';
import {
  ArrowLeft,
  Edit,
  Shield,
  ShieldAlert,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  X,
  Lock,
  Info,
} from 'lucide-react';
import { cn } from '@/utils';

export const RoleDetailPage: React.FC = () => {
  const { roleId } = useParams<{ roleId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, language } = useLanguage();
  const isBn = language === 'bn';

  // Data & loading states
  const [role, setRole] = useState<RoleDetail | null>(null);
  const [catalogue, setCatalogue] = useState<PermissionCatalogueItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<{
    message: string;
    isNotFound: boolean;
    isPermissionDenied: boolean;
  } | null>(null);

  // Success Banner from Edit navigation state
  const [successBanner, setSuccessBanner] = useState<string | null>(() => {
    const state = location.state as { roleUpdatedSuccess?: boolean; updatedRoleName?: string } | null;
    if (state?.roleUpdatedSuccess) {
      return state.updatedRoleName
        ? `${state.updatedRoleName}: ${t.roles.roleUpdatedSuccess}`
        : t.roles.roleUpdatedSuccess;
    }
    return null;
  });

  // Clear location state after reading
  useEffect(() => {
    if (location.state && (location.state as { roleUpdatedSuccess?: boolean }).roleUpdatedSuccess) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  /**
   * Load role detail and permission catalogue in a single coordinated fetch
   */
  const loadData = useCallback(async () => {
    if (!roleId) {
      setError({
        message: t.roles.roleNotFoundMessage,
        isNotFound: true,
        isPermissionDenied: false,
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [roleData, catalogueData] = await Promise.all([
        roleApi.getRoleDetail(roleId),
        roleApi.getPermissionCatalogue(),
      ]);

      setRole(roleData);
      setCatalogue(catalogueData);
    } catch (err: unknown) {
      console.error('Error fetching role details:', err);
      let errorMsg = t.roles.failedToLoad;
      let isNotFound = false;
      let isPermissionDenied = false;

      if (err instanceof RoleApiError || err instanceof Error) {
        errorMsg = err.message;
        const code = (err as { code?: string }).code;

        if (code === 'P0002' || err.message.toLowerCase().includes('not found')) {
          isNotFound = true;
          errorMsg = t.roles.roleNotFoundMessage;
        } else if (
          code === '42501' ||
          err.message.toLowerCase().includes('permission denied') ||
          err.message.toLowerCase().includes('access denied')
        ) {
          isPermissionDenied = true;
          errorMsg = t.roles.permissionDeniedMessage;
        }
      }

      setError({
        message: errorMsg,
        isNotFound,
        isPermissionDenied,
      });
    } finally {
      setLoading(false);
    }
  }, [roleId, t.roles.failedToLoad, t.roles.roleNotFoundMessage, t.roles.permissionDeniedMessage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // If loading, show skeleton
  if (loading) {
    return (
      <div className="w-full max-w-full overflow-x-hidden space-y-6 min-w-0 pb-12">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/roles')}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          >
            <span>{t.roles.backToRoles}</span>
          </Button>
        </div>
        <RoleLoadingSkeleton />
      </div>
    );
  }

  // If error occurred (not found, permission denied, or backend error)
  if (error || !role) {
    return (
      <div className="w-full max-w-full overflow-x-hidden space-y-6 min-w-0 pb-12">
        {/* Back navigation */}
        <div>
          <Button
            id="error-back-to-roles-btn"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/roles')}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          >
            <span>{t.roles.backToRoles}</span>
          </Button>
        </div>

        {/* Error box */}
        <div
          role="alert"
          className={cn(
            'p-8 rounded-2xl border text-center space-y-4 max-w-xl mx-auto my-8',
            error?.isNotFound
              ? 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
              : error?.isPermissionDenied
              ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
              : 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
          )}
        >
          <div
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center mx-auto',
              error?.isNotFound
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                : error?.isPermissionDenied
                ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400'
                : 'bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400'
            )}
          >
            {error?.isNotFound ? (
              <Shield className="w-6 h-6" />
            ) : error?.isPermissionDenied ? (
              <ShieldAlert className="w-6 h-6" />
            ) : (
              <AlertCircle className="w-6 h-6" />
            )}
          </div>

          <div className="space-y-1.5">
            <h3
              className={cn(
                'text-base font-semibold',
                error?.isNotFound
                  ? 'text-slate-900 dark:text-slate-100'
                  : error?.isPermissionDenied
                  ? 'text-amber-900 dark:text-amber-200'
                  : 'text-rose-900 dark:text-rose-200'
              )}
            >
              {error?.isNotFound
                ? t.roles.roleNotFoundTitle
                : error?.isPermissionDenied
                ? t.roles.permissionRequired
                : t.roles.failedToLoad}
            </h3>

            <p
              className={cn(
                'text-xs sm:text-sm max-w-md mx-auto leading-relaxed',
                error?.isNotFound
                  ? 'text-slate-600 dark:text-slate-400'
                  : error?.isPermissionDenied
                  ? 'text-amber-800 dark:text-amber-300'
                  : 'text-rose-700 dark:text-rose-300'
              )}
            >
              {error?.message || t.roles.failedToLoadMessage}
            </p>
          </div>

          <div className="pt-3 flex items-center justify-center gap-3">
            {!error?.isNotFound && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadData()}
                leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                <span>{t.roles.retry}</span>
              </Button>
            )}

            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/roles')}
            >
              <span>{t.roles.backToRoles}</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const displayName = isBn ? role.name_bn || role.name_en : role.name_en;

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-6 min-w-0 pb-12">
      {/* 1. Page Header with Actions */}
      <div className="space-y-4">
        {/* Back Link */}
        <div>
          <Button
            id="role-detail-back-btn"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/roles')}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 -ml-2"
          >
            <span>{t.roles.backToRoles}</span>
          </Button>
        </div>

        {/* Header Content */}
        <PageHeader
          title={displayName}
          description={role.description || t.roles.roleDetailSubtitle}
          actions={
            <div className="flex items-center gap-2.5">
              <Button
                id="edit-role-btn"
                variant="primary"
                size="sm"
                onClick={() => navigate(`/roles/${role.id}/edit`)}
                leftIcon={<Edit className="w-3.5 h-3.5" />}
              >
                <span>{t.roles.editRole}</span>
              </Button>
            </div>
          }
        />
      </div>

      {/* 2. Success Banner */}
      {successBanner && (
        <div
          role="status"
          className="p-4 rounded-xl border bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-3 animate-in fade-in"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-xs sm:text-sm font-medium">{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="p-1 rounded-md text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
            aria-label={t.roles.dismissMessage}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. Protected System Role Banner (if applicable) */}
      {role.is_system && (
        <div
          role="status"
          className="p-4 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/70 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200 flex items-start gap-3"
        >
          <div className="p-1 rounded-md bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5">
            <Lock className="w-4 h-4" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <h4 className="text-xs sm:text-sm font-semibold">
              {t.roles.systemRole}
            </h4>
            <p className="text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
              {t.roles.systemRoleProtectedNotice}
            </p>
          </div>
        </div>
      )}

      {/* 4. Overview Card */}
      <RoleOverviewCard role={role} />

      {/* 5. Grouped Permissions View */}
      <RolePermissionsView
        permissionIds={role.permission_ids}
        catalogue={catalogue}
      />
    </div>
  );
};

export default RoleDetailPage;
