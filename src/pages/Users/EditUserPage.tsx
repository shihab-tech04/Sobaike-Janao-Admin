import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { adminUserApi } from '@/services/api/adminUserApi';
import { AdminUserDetail, AssignableRole } from '@/types/AdminUser';
import { UserLoadingSkeleton } from '@/components/users/UserLoadingSkeleton';
import {
  ArrowLeft,
  Save,
  Lock,
  Shield,
  AlertCircle,
} from 'lucide-react';

export const EditUserPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { t, language } = useLanguage();

  // State
  const [initialUser, setInitialUser] = useState<AdminUserDetail | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [roleId, setRoleId] = useState<string>('');
  const [active, setActive] = useState<boolean>(true);

  const [roles, setRoles] = useState<AssignableRole[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load user and roles
  useEffect(() => {
    if (!userId) {
      setError(t.users.userIdMissing);
      setLoading(false);
      return;
    }

    let mounted = true;
    Promise.all([adminUserApi.getUser(userId), adminUserApi.getAssignableRoles()])
      .then(([userData, rolesData]) => {
        if (!mounted) return;
        setInitialUser(userData);
        setDisplayName(userData.display_name || '');
        setRoleId(userData.role?.id || (rolesData[0]?.id ?? ''));
        setActive(userData.active);

        const combinedRoles = [...rolesData];
        if (userData.role && !combinedRoles.some((r) => r.id === userData.role?.id)) {
          combinedRoles.unshift({
            id: userData.role.id,
            name_en: userData.role.name_en,
            name_bn: userData.role.name_bn,
            description: userData.role.description,
            active: userData.role.active,
            is_system: Boolean(userData.role.is_system),
          });
        }
        setRoles(combinedRoles);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        console.error('Failed to load edit user data:', err);
        const msg = err instanceof Error ? err.message : t.users.failedToLoadUser;
        setError(msg);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [userId, t.users.userIdMissing, t.users.failedToLoadUser]);

  const isSuperAdmin = initialUser?.is_super_admin ?? false;
  const isOutOfCeiling = initialUser?.can_manage_target === false;
  const isLocked = isSuperAdmin || isOutOfCeiling;

  // Check if modified
  const isDirty =
    initialUser &&
    !isLocked &&
    (displayName.trim() !== (initialUser.display_name || '').trim() ||
      roleId !== (initialUser.role?.id || '') ||
      active !== initialUser.active);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !initialUser || isLocked) return;

    if (!isDirty) {
      navigate(`/users/${userId}`);
      return;
    }

    if (!roleId) {
      setError(t.users.roleRequired);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await adminUserApi.updateUser({
        user_id: userId,
        display_name: displayName.trim() || null,
        role_id: roleId,
        active,
      });

      navigate(`/users/${userId}`, {
        state: {
          userUpdatedSuccess: true,
          userName: displayName.trim() || initialUser.email,
        },
      });
    } catch (err: unknown) {
      console.error('Update user failed:', err);
      const msg = err instanceof Error ? err.message : t.users.configurationError;
      setError(msg);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 pb-16">
        <div className="h-9 w-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        <UserLoadingSkeleton />
      </div>
    );
  }

  if (error && !initialUser) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 pb-16">
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
            {error}
          </p>
        </div>
      </div>
    );
  }

  const selectedRoleObj = roles.find((r) => r.id === roleId);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16" id="edit-user-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          id="btn-back-to-detail"
          variant="ghost"
          size="sm"
          onClick={() => navigate(userId ? `/users/${userId}` : '/users')}
          className="h-9 w-9 p-0"
          aria-label={t.common.back}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            {t.users.editUserTitle}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {initialUser?.email}
          </p>
        </div>
      </div>

      {/* Super Admin Protection Alert Banner */}
      {isSuperAdmin && (
        <div
          id="edit-super-admin-protected-banner"
          className="p-5 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-200 flex items-start gap-3.5 shadow-xs"
        >
          <Lock className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <h4 className="font-bold">{t.users.protectedAccountNotice}</h4>
            <p className="text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
              {t.users.superAdminCannotBeEdited} {t.users.protectedAccountDesc}
            </p>
            <div className="pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/users/${userId}`)}
                className="h-8 text-xs bg-white dark:bg-slate-900 border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-200"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                {t.users.backToUsers}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Ceiling Restriction Alert Banner */}
      {!isSuperAdmin && isOutOfCeiling && (
        <div
          id="edit-ceiling-restriction-banner"
          className="p-5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-start gap-3.5 shadow-xs"
        >
          <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <h4 className="font-bold">{t.users.restrictedBadge}</h4>
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              {t.users.strongerUserCannotBeEdited}
            </p>
            <div className="pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/users/${userId}`)}
                className="h-8 text-xs bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                {t.users.backToUsers}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && !isLocked && (
        <div
          id="edit-user-error-alert"
          className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 flex items-start gap-3 shadow-xs"
        >
          <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="text-sm text-rose-800 dark:text-rose-200">
            <p className="font-semibold">{t.users.error}</p>
            <p className="mt-0.5 text-xs">{error}</p>
          </div>
        </div>
      )}

      {/* Edit Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6"
      >
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2">
            {t.users.accountDetails}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Display Name */}
            <div>
              <label
                htmlFor="input-edit-display-name"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                {t.users.displayName}
              </label>
              <input
                id="input-edit-display-name"
                type="text"
                disabled={isLocked || submitting}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={100}
                placeholder={t.users.displayNamePlaceholder}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 text-slate-900 dark:text-slate-100 disabled:opacity-50"
              />
            </div>

            {/* Email Address (Immutable) */}
            <div>
              <label
                htmlFor="input-edit-email"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                {t.users.email} <span className="text-slate-400 font-normal">({t.users.immutable})</span>
              </label>
              <div className="relative">
                <input
                  id="input-edit-email"
                  type="email"
                  readOnly
                  disabled
                  value={initialUser?.email || ''}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 cursor-not-allowed"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {t.users.emailImmutableNotice}
              </p>
            </div>
          </div>
        </div>

        {/* Assigned Role */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2">
            {t.users.role} <span className="text-rose-500">*</span>
          </h3>

          <div>
            <select
              id="select-edit-user-role"
              required
              disabled={isLocked || submitting || roles.length === 0}
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 text-slate-900 dark:text-slate-100 disabled:opacity-50"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {language === 'bn' ? r.name_bn || r.name_en : r.name_en}
                </option>
              ))}
            </select>

            {roles.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                {t.users.noAssignableRoles}
              </p>
            )}

            {selectedRoleObj && (
              <div className="mt-2.5 p-3 rounded-lg bg-sky-50/70 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900/60 text-xs text-sky-800 dark:text-sky-200 flex items-start gap-2">
                <Shield className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">
                    {language === 'bn' ? selectedRoleObj.name_bn || selectedRoleObj.name_en : selectedRoleObj.name_en}:
                  </span>{' '}
                  <span>{selectedRoleObj.description || t.users.noDescription}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2">
            {t.users.status}
          </h3>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
              <input
                id="radio-edit-status-active"
                type="radio"
                name="edit-user-status"
                disabled={isLocked || submitting}
                checked={active === true}
                onChange={() => setActive(true)}
                className="w-4 h-4 text-sky-600 focus:ring-sky-500 border-slate-300 dark:border-slate-700"
              />
              <span className="font-medium">{t.users.active}</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
              <input
                id="radio-edit-status-inactive"
                type="radio"
                name="edit-user-status"
                disabled={isLocked || submitting}
                checked={active === false}
                onChange={() => setActive(false)}
                className="w-4 h-4 text-sky-600 focus:ring-sky-500 border-slate-300 dark:border-slate-700"
              />
              <span className="font-medium">{t.users.inactive}</span>
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button
            id="btn-cancel-edit-user"
            type="button"
            variant="secondary"
            size="md"
            onClick={() => navigate(userId ? `/users/${userId}` : '/users')}
            disabled={submitting}
          >
            {t.common.cancel}
          </Button>

          {!isLocked && (
            <Button
              id="btn-submit-edit-user"
              type="submit"
              variant="primary"
              size="md"
              disabled={submitting || !isDirty || roles.length === 0}
            >
              <Save className="w-4 h-4 mr-2" />
              {submitting ? t.users.savingUser : t.users.saveUser}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
};

export default EditUserPage;
