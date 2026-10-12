import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { adminUserApi } from '@/services/api/adminUserApi';
import { AdminUserDetail } from '@/types/AdminUser';
import { UserLoadingSkeleton } from '@/components/users/UserLoadingSkeleton';
import { DeleteUserModal } from '@/components/users/DeleteUserModal';
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Shield,
  ShieldCheck,
  Lock,
  Mail,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Key,
} from 'lucide-react';
import { formatDate } from '@/utils';

export const UserDetailPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, language } = useLanguage();
  const { hasPermission, user: currentUser } = useAuth();
  const isBn = language === 'bn';

  const canManageUsers = hasPermission('admin_users.manage');

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);

  // Success Banner from Edit navigation
  const [successBanner] = useState<string | null>(() => {
    const state = location.state as { userUpdatedSuccess?: boolean; userName?: string } | null;
    if (state?.userUpdatedSuccess) {
      return state.userName
        ? `${state.userName}: ${t.users.userUpdatedSuccess}`
        : t.users.userUpdatedSuccess;
    }
    return null;
  });

  useEffect(() => {
    if (location.state && (location.state as { userUpdatedSuccess?: boolean }).userUpdatedSuccess) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const formatNumber = (num: number): string => {
    if (language !== 'bn') return String(num);
    const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(num).replace(/\d/g, (d) => bnDigits[Number(d)]);
  };

  const loadUser = useCallback(async () => {
    if (!userId) {
      setError(t.users.userIdMissing);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await adminUserApi.getUser(userId);
      setUser(data);
    } catch (err: unknown) {
      console.error('Failed to load user details:', err);
      const msg = err instanceof Error ? err.message : t.users.failedToLoadUser;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [userId, t.users.userIdMissing, t.users.failedToLoadUser]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-16">
        <div className="h-9 w-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        <UserLoadingSkeleton />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-16">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/users')}
          className="h-9"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t.users.backToUsers}
        </Button>

        <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-rose-200 dark:border-rose-900/60 shadow-xs">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t.users.failedToLoadUser}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            {error || t.users.userNotFound}
          </p>
        </div>
      </div>
    );
  }

  const roleName = isBn
    ? user.role?.name_bn || user.role?.name_en || '—'
    : user.role?.name_en || '—';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16" id="user-detail-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            id="btn-back-to-users"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/users')}
            className="h-9 w-9 p-0"
            aria-label={t.common.back}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {user.display_name || user.email}
              </h1>
              {user.is_super_admin && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  <Lock className="w-3 h-3" />
                  {t.users.superAdmin}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {user.email}
            </p>
          </div>
        </div>

        {/* Edit Button (Disabled/Hidden for Super Admin or out-of-ceiling administrator) */}
        {canManageUsers && (
          user.is_super_admin ? (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 dark:text-slate-500 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-not-allowed"
              title={t.users.superAdminCannotBeEdited}
            >
              <Lock className="w-3.5 h-3.5" />
              {t.users.protectedBadge}
            </div>
          ) : user.can_manage_target === false ? (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 dark:text-slate-500 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-not-allowed"
              title={t.users.strongerUserCannotBeEdited}
            >
              <Lock className="w-3.5 h-3.5" />
              {t.users.restrictedBadge}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                id="btn-edit-user-detail"
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/users/${user.user_id}/edit`)}
                className="h-9"
              >
                <Edit2 className="w-4 h-4 mr-2" />
                {t.users.editUser}
              </Button>

              {user.user_id !== currentUser?.id && (
                <Button
                  id="btn-delete-user-detail"
                  variant="danger"
                  size="sm"
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="h-9"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t.users.deleteUser}
                </Button>
              )}
            </div>
          )
        )}
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div
          id="user-detail-success-banner"
          className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-3 shadow-xs animate-in fade-in"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <p className="text-sm font-medium">{successBanner}</p>
        </div>
      )}

      {/* Super Administrator Protection Notice Banner */}
      {user.is_super_admin && (
        <div
          id="super-admin-protection-banner"
          className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/80 flex items-start gap-3 shadow-xs"
        >
          <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/60 flex items-center justify-center shrink-0 text-purple-700 dark:text-purple-300">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-purple-900 dark:text-purple-200">
              {t.users.protectedAccountNotice}
            </h4>
            <p className="text-xs text-purple-700 dark:text-purple-300/90 mt-1 leading-relaxed">
              {t.users.protectedAccountDesc}
            </p>
          </div>
        </div>
      )}

      {/* Ceiling Restriction Banner */}
      {!user.is_super_admin && user.can_manage_target === false && (
        <div
          id="ceiling-restriction-banner"
          className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 flex items-start gap-3 shadow-xs"
        >
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center shrink-0 text-amber-700 dark:text-amber-300">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
              {t.users.restrictedBadge}
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-300/90 mt-1 leading-relaxed">
              {t.users.strongerUserCannotBeEdited}
            </p>
          </div>
        </div>
      )}

      {/* Account Overview Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2">
          {t.users.profileOverview}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Display Name */}
          <div>
            <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
              {t.users.displayName}
            </p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1">
              {user.display_name || (
                <span className="italic text-slate-400">
                  {t.users.noDisplayName}
                </span>
              )}
            </p>
          </div>

          {/* Email */}
          <div>
            <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
              {t.users.email}
            </p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1 flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-slate-400" />
              {user.email}
            </p>
          </div>

          {/* Account Type */}
          <div>
            <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
              {t.users.accountType}
            </p>
            <div className="mt-1">
              {user.is_super_admin ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {t.users.superAdmin}
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {t.users.standardAdmin}
                </span>
              )}
            </div>
          </div>

          {/* Status */}
          <div>
            <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
              {t.users.status}
            </p>
            <div className="mt-1">
              {user.active ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  {t.users.active}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                  <XCircle className="w-3.5 h-3.5 text-rose-500" />
                  {t.users.inactive}
                </span>
              )}
            </div>
          </div>

          {/* Created Date */}
          <div>
            <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
              {t.users.created}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {formatDate(user.created_at)}
            </p>
          </div>

          {/* Last Updated */}
          <div>
            <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
              {t.users.lastUpdated}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {user.updated_at ? formatDate(user.updated_at) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Role & Permissions Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2">
          {t.users.assignedRoleAndPermissions}
        </h3>

        {user.is_super_admin ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40">
              <p className="text-sm font-bold text-purple-900 dark:text-purple-200">
                {t.users.fullSystemAccess}
              </p>
              <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                {t.users.superAdminAccessExplanation}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                {t.users.effectivePermissions}
                {user.effective_permissions.length > 0 && ` (${formatNumber(user.effective_permissions.length)})`}
              </p>
              {user.effective_permissions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {user.effective_permissions.map((perm) => (
                    <span
                      key={perm}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                    >
                      <Key className="w-3 h-3" />
                      {perm}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs italic text-amber-700 dark:text-amber-400/90 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  {t.users.permissionDetailsRestricted}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {user.role ? (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {roleName}
                  </span>
                  {user.role.is_system && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300">
                      {t.users.systemRoleBadge}
                    </span>
                  )}
                </div>
                {user.role.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                    {user.role.description}
                  </p>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                {t.users.noRoleAssigned}
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                {t.users.effectivePermissions}
                {user.effective_permissions.length > 0 && ` (${formatNumber(user.effective_permissions.length)})`}
              </p>
              {user.effective_permissions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {user.effective_permissions.map((perm) => (
                    <span
                      key={perm}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                    >
                      <Key className="w-3 h-3 text-slate-400" />
                      {perm}
                    </span>
                  ))}
                </div>
              ) : user.can_manage_target === false ? (
                <p className="text-xs italic text-amber-700 dark:text-amber-400/90 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  {t.users.permissionDetailsRestricted}
                </p>
              ) : (
                <p className="text-xs italic text-slate-400">
                  {t.users.noEffectivePermissions}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteUserModal
        isOpen={isDeleteModalOpen}
        user={user}
        onClose={() => setIsDeleteModalOpen(false)}
        onSuccess={(deletedName) => {
          navigate('/users', {
            state: { userDeletedSuccess: true, userName: deletedName },
          });
        }}
      />
    </div>
  );
};

export default UserDetailPage;
