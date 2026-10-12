import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { roleApi } from '@/services/api';
import { RoleListItem, RoleApiError } from '@/types/Role';
import {
  RoleTable,
  RoleMobileCardList,
  RoleEmptyState,
  RoleLoadingSkeleton,
} from '@/components/roles';
import {
  RefreshCw,
  Plus,
  RotateCcw,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { cn } from '@/utils';

export const RolesPage: React.FC = () => {
  const { t, language } = useLanguage();
  const isBn = language === 'bn';
  const navigate = useNavigate();
  const location = useLocation();

  // Data & loading states
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<{ message: string; isPermissionDenied: boolean } | null>(null);

  // Success message from creation navigation state
  const [successBanner, setSuccessBanner] = useState<string | null>(() => {
    const state = location.state as { roleCreatedSuccess?: boolean; createdRoleName?: string } | null;
    if (state?.roleCreatedSuccess) {
      return state.createdRoleName
        ? `${state.createdRoleName}: ${t.roles.roleCreatedSuccess}`
        : t.roles.roleCreatedSuccess;
    }
    return null;
  });

  // Clear location state after reading
  useEffect(() => {
    if (location.state && (location.state as { roleCreatedSuccess?: boolean }).roleCreatedSuccess) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  /**
   * Fetch administrative roles exclusively via RPC `admin_list_roles`
   */
  const loadRoles = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await roleApi.listRoles();
      setRoles(data);
    } catch (err: unknown) {
      console.error('Error fetching role list:', err);
      let errorMessage = 'Failed to load roles';
      let errorCode: string | undefined;

      if (err instanceof RoleApiError || err instanceof Error) {
        errorMessage = err.message;
        if ('code' in err && typeof (err as { code: unknown }).code === 'string') {
          errorCode = (err as { code: string }).code;
        }
      } else if (typeof err === 'object' && err !== null && 'code' in err) {
        errorCode = String((err as { code: unknown }).code);
      }

      const isPermissionDenied =
        errorCode === '42501' ||
        errorMessage.includes('42501') ||
        errorMessage.includes('Access denied') ||
        errorMessage.includes('Role management authorization required');

      setError({
        message: errorMessage,
        isPermissionDenied: Boolean(isPermissionDenied),
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const handleRefresh = () => {
    loadRoles(true);
  };

  const formatNumber = (num: number): string => {
    if (!isBn) return num.toLocaleString();
    const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return num
      .toLocaleString()
      .split('')
      .map((d) => (/[0-9]/.test(d) ? bnDigits[parseInt(d, 10)] : d))
      .join('');
  };

  const getShowingCountText = (): string => {
    if (roles.length === 1) {
      return t.roles.showingTotalSingular;
    }
    return t.roles.showingTotalPlural.replace('{count}', formatNumber(roles.length));
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-6 min-w-0 pb-12">
      {/* 1. Page Header */}
      <PageHeader
        title={t.roles.title}
        description={t.roles.description}
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              id="refresh-roles-btn"
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              disabled={loading || refreshing}
              leftIcon={
                <RefreshCw
                  className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')}
                />
              }
              aria-label="Refresh role list"
            >
              <span>{t.roles.refresh}</span>
            </Button>

            <Button
              id="header-create-role-btn"
              variant="primary"
              size="sm"
              onClick={() => navigate('/roles/create')}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              <span>{t.roles.createRole}</span>
            </Button>
          </div>
        }
      />

      {/* Success Banner */}
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

      {/* 2. Error State */}
      {error && (
        <div
          role="alert"
          className={cn(
            'p-8 rounded-2xl border text-center space-y-3.5 max-w-2xl mx-auto my-6',
            error.isPermissionDenied
              ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
              : 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
          )}
        >
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
            <h3
              className={cn(
                'text-base font-semibold',
                error.isPermissionDenied
                  ? 'text-amber-900 dark:text-amber-200'
                  : 'text-rose-900 dark:text-rose-200'
              )}
            >
              {error.isPermissionDenied
                ? t.roles.permissionRequired
                : t.roles.failedToLoad}
            </h3>

            <p
              className={cn(
                'text-xs sm:text-sm max-w-md mx-auto leading-relaxed',
                error.isPermissionDenied
                  ? 'text-amber-800 dark:text-amber-300'
                  : 'text-rose-700 dark:text-rose-300'
              )}
            >
              {error.isPermissionDenied
                ? t.roles.permissionDeniedMessage
                : t.roles.failedToLoadMessage}
            </p>
          </div>

          <div className="pt-2">
            <Button
              id="retry-roles-btn"
              variant="secondary"
              size="sm"
              onClick={() => loadRoles()}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              className={cn(
                'mx-auto shadow-xs',
                error.isPermissionDenied
                  ? 'border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100 hover:bg-amber-100/50 dark:hover:bg-amber-900/40'
                  : 'border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100 hover:bg-rose-100/50 dark:hover:bg-rose-900/40'
              )}
            >
              <span>{t.roles.retry}</span>
            </Button>
          </div>
        </div>
      )}

      {/* 3. Loading Skeleton */}
      {loading && !error && <RoleLoadingSkeleton />}

      {/* 4. Production Empty State (when 0 roles exist) */}
      {!loading && !error && roles.length === 0 && <RoleEmptyState />}

      {/* 5. Populated Roles List (Desktop Table + Mobile Cards) */}
      {!loading && !error && roles.length > 0 && (
        <div className="space-y-3">
          {/* Result Count Banner */}
          <div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
            <span>{getShowingCountText()}</span>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block">
            <RoleTable roles={roles} />
          </div>

          {/* Mobile Card List View */}
          <div className="md:hidden">
            <RoleMobileCardList roles={roles} />
          </div>
        </div>
      )}
    </div>
  );
};

export default RolesPage;

