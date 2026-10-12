import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useLanguage } from '@/context/LanguageContext';
import { roleApi } from '@/services/api';
import { RoleDetail, PermissionCatalogueItem, RoleApiError, UpdateRoleInput } from '@/types/Role';
import { RolePermissionEditor } from '@/components/roles/edit/RolePermissionEditor';
import { UnsavedChangesModal } from '@/components/roles/create/UnsavedChangesModal';
import { RoleLoadingSkeleton } from '@/components/roles/RoleLoadingSkeleton';
import {
  ArrowLeft,
  Save,
  RotateCcw,
  Shield,
  ShieldAlert,
  AlertCircle,
  Lock,
  FileText,
  Hash,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/utils';

export const EditRolePage: React.FC = () => {
  const { roleId } = useParams<{ roleId: string }>();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const isBn = language === 'bn';

  // Core data states
  const [role, setRole] = useState<RoleDetail | null>(null);
  const [catalogue, setCatalogue] = useState<PermissionCatalogueItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState<boolean>(false);
  const [isPermissionDenied, setIsPermissionDenied] = useState<boolean>(false);

  // Form states - Separate EN and BN Role Names
  const [nameEn, setNameEn] = useState<string>('');
  const [nameBn, setNameBn] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [active, setActive] = useState<boolean>(true);
  const [permissionIds, setPermissionIds] = useState<string[]>([]);

  // Validation & submission states
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showDiscardModal, setShowDiscardModal] = useState<boolean>(false);

  /**
   * Load role detail and catalogue
   */
  const loadData = useCallback(async () => {
    if (!roleId) {
      setIsNotFound(true);
      setFetchError(t.roles.roleNotFoundMessage);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);
    setIsNotFound(false);
    setIsPermissionDenied(false);

    try {
      const [roleData, catalogueData] = await Promise.all([
        roleApi.getRoleDetail(roleId),
        roleApi.getPermissionCatalogue(),
      ]);

      setRole(roleData);
      setCatalogue(catalogueData);

      // Populate form state with separate bilingual values
      setNameEn(roleData.name_en);
      setNameBn(roleData.name_bn || '');
      setDescription(roleData.description || '');
      setActive(roleData.active);
      setPermissionIds(roleData.permission_ids);
    } catch (err: unknown) {
      console.error('Error loading role for edit:', err);
      let errorMsg = t.roles.failedToLoad;

      if (err instanceof RoleApiError || err instanceof Error) {
        errorMsg = err.message;
        const code = (err as { code?: string }).code;

        if (code === 'P0002' || err.message.toLowerCase().includes('not found')) {
          setIsNotFound(true);
          errorMsg = t.roles.roleNotFoundMessage;
        } else if (
          code === '42501' ||
          err.message.toLowerCase().includes('permission denied') ||
          err.message.toLowerCase().includes('access denied')
        ) {
          setIsPermissionDenied(true);
          errorMsg = t.roles.permissionDeniedMessage;
        }
      }

      setFetchError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [roleId, t.roles.failedToLoad, t.roles.roleNotFoundMessage, t.roles.permissionDeniedMessage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Dirty detection logic
  const isDirty = useMemo(() => {
    if (!role) return false;

    const isNameEnChanged = !role.is_system && nameEn.trim() !== role.name_en;
    const isNameBnChanged = !role.is_system && nameBn.trim() !== (role.name_bn || '').trim();
    const isActiveChanged = !role.is_system && active !== role.active;
    const isDescChanged = description.trim() !== (role.description || '').trim();

    // Check permissions equality
    let isPermsChanged = false;
    if (!role.is_system) {
      const originalSet = new Set(role.permission_ids);
      const currentSet = new Set(permissionIds);
      if (originalSet.size !== currentSet.size) {
        isPermsChanged = true;
      } else {
        for (const pId of currentSet) {
          if (!originalSet.has(pId)) {
            isPermsChanged = true;
            break;
          }
        }
      }
    }

    return isNameEnChanged || isNameBnChanged || isActiveChanged || isDescChanged || isPermsChanged;
  }, [role, nameEn, nameBn, active, description, permissionIds]);

  const isSavingOrDiscardingRef = useRef(false);

  // Block internal navigation when form has unsaved changes
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !isSavingOrDiscardingRef.current && isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  const isBlocked = blocker.state === 'blocked' || showDiscardModal;

  const handleKeepEditing = () => {
    setShowDiscardModal(false);
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  };

  const handleDiscardChanges = () => {
    setShowDiscardModal(false);
    if (blocker.state === 'blocked') {
      blocker.proceed();
    } else {
      isSavingOrDiscardingRef.current = true;
      navigate(role ? `/roles/${role.id}` : '/roles');
    }
  };

  // Warn on browser unload if form is dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !isSavingOrDiscardingRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  /**
   * Handle navigation away
   */
  const handleBackOrCancel = () => {
    if (isDirty) {
      setShowDiscardModal(true);
    } else {
      navigate(role ? `/roles/${role.id}` : '/roles');
    }
  };

  /**
   * Form submission
   */
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!role) return;

    // Custom role validation: English name is required
    if (!role.is_system) {
      const trimmedEn = nameEn.trim();
      if (!trimmedEn) {
        setNameError(t.roles.roleNameEnglishRequired);
        return;
      }
    }

    setNameError(null);
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const isDescChanged = description.trim() !== (role.description || '').trim();
      const isNameBnChanged = !role.is_system && nameBn.trim() !== (role.name_bn || '').trim();

      const payload: UpdateRoleInput = {
        id: role.id,
        name_en: role.is_system ? role.name_en : nameEn.trim(),
        name_bn: role.is_system
          ? undefined
          : isNameBnChanged
          ? nameBn.trim().length > 0
            ? nameBn.trim()
            : null
          : undefined,
        active: role.is_system ? role.active : active,
        permission_ids: role.is_system ? undefined : permissionIds,
        description: isDescChanged
          ? description.trim()
            ? description.trim()
            : null
          : undefined,
      };

      await roleApi.updateRole(payload);

      isSavingOrDiscardingRef.current = true;

      // Navigate back to Role Detail with success notification
      navigate(`/roles/${role.id}`, {
        state: {
          roleUpdatedSuccess: true,
          updatedRoleName: role.is_system ? role.name_en : nameEn.trim(),
        },
      });
    } catch (err: unknown) {
      isSavingOrDiscardingRef.current = false;
      console.error('Role update failed:', err);
      let errorMsg = t.roles.generalCreateError;

      const roleErr =
        err instanceof RoleApiError
          ? err
          : new RoleApiError(
              err instanceof Error ? err.message : String(err),
              (err as { code?: string })?.code || 'UNKNOWN_ERROR'
            );

      if (roleErr.isLastManagerLockout) {
        errorMsg = t.roles.lastManagerError;
      } else if (roleErr.isDuplicate) {
        errorMsg = t.roles.duplicateNameError;
      } else if (roleErr.isCompatibilityError) {
        errorMsg = t.roles.compatibilityError;
      } else if (roleErr.isConfigError) {
        errorMsg = t.roles.configurationError;
      } else if (roleErr.isSystemProtected) {
        errorMsg = t.roles.systemRoleError;
      } else if (roleErr.isPermissionDenied) {
        errorMsg = t.roles.permissionDeniedMessage;
      } else if (roleErr.message) {
        errorMsg = roleErr.message;
      }

      setSubmitError(errorMsg);
      setIsSubmitting(false);
    }
  };

  // Loading state
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

  // Error state during initial load
  if (fetchError || !role) {
    return (
      <div className="w-full max-w-full overflow-x-hidden space-y-6 min-w-0 pb-12">
        <div>
          <Button
            id="error-back-btn"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/roles')}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          >
            <span>{t.roles.backToRoles}</span>
          </Button>
        </div>

        <div
          role="alert"
          className={cn(
            'p-8 rounded-2xl border text-center space-y-4 max-w-xl mx-auto my-8',
            isNotFound
              ? 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
              : isPermissionDenied
              ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
              : 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
          )}
        >
          <div
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center mx-auto',
              isNotFound
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                : isPermissionDenied
                ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400'
                : 'bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400'
            )}
          >
            {isNotFound ? (
              <Shield className="w-6 h-6" />
            ) : isPermissionDenied ? (
              <ShieldAlert className="w-6 h-6" />
            ) : (
              <AlertCircle className="w-6 h-6" />
            )}
          </div>

          <div className="space-y-1.5">
            <h3
              className={cn(
                'text-base font-semibold',
                isNotFound
                  ? 'text-slate-900 dark:text-slate-100'
                  : isPermissionDenied
                  ? 'text-amber-900 dark:text-amber-200'
                  : 'text-rose-900 dark:text-rose-200'
              )}
            >
              {isNotFound
                ? t.roles.roleNotFoundTitle
                : isPermissionDenied
                ? t.roles.permissionRequired
                : t.roles.failedToLoad}
            </h3>

            <p
              className={cn(
                'text-xs sm:text-sm max-w-md mx-auto leading-relaxed',
                isNotFound
                  ? 'text-slate-600 dark:text-slate-400'
                  : isPermissionDenied
                  ? 'text-amber-800 dark:text-amber-300'
                  : 'text-rose-700 dark:text-rose-300'
              )}
            >
              {fetchError || t.roles.failedToLoadMessage}
            </p>
          </div>

          <div className="pt-3 flex items-center justify-center gap-3">
            {!isNotFound && (
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
      {/* 1. Header with Back Button */}
      <div className="space-y-4">
        <div>
          <Button
            id="edit-role-back-btn"
            variant="ghost"
            size="sm"
            onClick={handleBackOrCancel}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 -ml-2"
          >
            <span>{t.roles.backToDetail}</span>
          </Button>
        </div>

        <PageHeader
          title={`${t.roles.editRole}: ${displayName}`}
          description={t.roles.editRoleSubtitle}
          actions={
            <div className="flex items-center gap-2.5">
              <Button
                id="edit-role-cancel-btn"
                variant="secondary"
                size="sm"
                onClick={handleBackOrCancel}
                disabled={isSubmitting}
              >
                <span>{t.roles.cancel}</span>
              </Button>

              <Button
                id="edit-role-save-btn"
                variant="primary"
                size="sm"
                onClick={() => handleSubmit()}
                disabled={isSubmitting || !isDirty || (!role.is_system && !nameEn.trim())}
                isLoading={isSubmitting}
                leftIcon={<Save className="w-3.5 h-3.5" />}
              >
                <span>{isSubmitting ? t.roles.savingChanges : t.roles.saveChanges}</span>
              </Button>
            </div>
          }
        />
      </div>

      {/* 2. Submission Error Banner */}
      {submitError && (
        <div
          role="alert"
          className="p-4 rounded-xl border bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 flex items-start gap-3 animate-in fade-in"
        >
          <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1">
            <h4 className="text-xs sm:text-sm font-semibold">
              {t.roles.generalCreateError}
            </h4>
            <p className="text-xs sm:text-sm text-rose-800 dark:text-rose-300 leading-relaxed">
              {submitError}
            </p>
          </div>
        </div>
      )}

      {/* 3. System Role Lock Warning */}
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
              {t.roles.systemRoleProtectedEditNotice}
            </p>
          </div>
        </div>
      )}

      {/* 4. Role Metadata Form Card */}
      <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
        <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {t.roles.step1Title}
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t.roles.step1Description}
                </p>
              </div>
            </div>

            {role.is_system ? (
              <Badge size="md" variant="subtle" status="info">
                <Lock className="w-3.5 h-3.5 mr-1" />
                {t.roles.systemRole}
              </Badge>
            ) : (
              <Badge size="md" variant="subtle">
                {t.roles.customRole}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-6">
          {/* Grid for Name & Identifiers */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* 1. English Name */}
            <div className="space-y-1.5">
              <label
                htmlFor="edit-role-name"
                className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between"
              >
                <span>{t.roles.englishName}</span>
                {role.is_system && (
                  <span className="text-[11px] text-slate-400 flex items-center gap-1 font-normal">
                    <Lock className="w-3 h-3" /> {t.roles.readOnlyField}
                  </span>
                )}
              </label>

              {role.is_system ? (
                <div className="relative">
                  <Input
                    id="edit-role-name-readonly"
                    value={role.name_en}
                    disabled
                    className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 cursor-not-allowed font-medium"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
                </div>
              ) : (
                <Input
                  id="edit-role-name"
                  value={nameEn}
                  onChange={(e) => {
                    setNameEn(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  placeholder={t.roles.roleNameEnglishPlaceholder}
                  error={nameError || undefined}
                  maxLength={100}
                />
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {role.is_system
                  ? t.roles.systemRoleProtectedNotice
                  : t.roles.roleNameEnglishHelper}
              </p>
            </div>

            {/* 2. Bengali Name */}
            <div className="space-y-1.5">
              <label
                htmlFor="edit-role-name-bn"
                className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between"
              >
                <span>{t.roles.bengaliName}</span>
                {role.is_system && (
                  <span className="text-[11px] text-slate-400 flex items-center gap-1 font-normal">
                    <Lock className="w-3 h-3" /> {t.roles.readOnlyField}
                  </span>
                )}
              </label>

              {role.is_system ? (
                <div className="relative">
                  <Input
                    id="edit-role-bengali-name-readonly"
                    value={role.name_bn || t.roles.notSpecified}
                    disabled
                    className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 cursor-not-allowed font-medium"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
                </div>
              ) : (
                <Input
                  id="edit-role-name-bn"
                  value={nameBn}
                  onChange={(e) => setNameBn(e.target.value)}
                  placeholder={t.roles.roleNameBengaliPlaceholder}
                  maxLength={100}
                />
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {role.is_system
                  ? t.roles.systemRoleProtectedNotice
                  : t.roles.roleNameBengaliHelper}
              </p>
            </div>

            {/* 3. Technical Role ID (Permanent & Immutable) */}
            <div className="space-y-1.5 min-w-0">
              <label className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Hash className="w-3 h-3 text-slate-400" />
                  {t.roles.technicalRoleId}
                </span>
                <span className="text-[11px] text-slate-400 flex items-center gap-1 font-normal">
                  <Lock className="w-3 h-3" /> {t.roles.readOnlyField}
                </span>
              </label>
              <div className="relative min-w-0">
                <div
                  id="edit-role-id"
                  className="w-full min-h-[36px] py-2 px-3 pr-8 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 font-mono text-xs cursor-not-allowed select-all break-all"
                  aria-readonly="true"
                >
                  {role.id}
                </div>
                <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t.roles.technicalRoleIdHelper}
              </p>
            </div>
          </div>

          {/* Status Selection */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label id="edit-role-status-label" className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between">
              <span>{t.roles.status}</span>
              {role.is_system && (
                <span className="text-[11px] text-slate-400 flex items-center gap-1 font-normal">
                  <Lock className="w-3 h-3" /> {t.roles.readOnlyField}
                </span>
              )}
            </label>

            {role.is_system ? (
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2.5">
                <Badge size="md" status={role.active ? 'success' : 'default'} dot>
                  {role.active ? t.roles.active : t.roles.inactive}
                </Badge>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {role.active ? t.roles.activeStatusHelper : t.roles.inactiveStatusHelper}
                </span>
              </div>
            ) : (
              <div
                role="radiogroup"
                aria-labelledby="edit-role-status-label"
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                {/* Active Option */}
                <label
                  htmlFor="edit-role-status-active"
                  className={cn(
                    'p-3.5 rounded-lg border transition-all cursor-pointer flex items-start gap-3 select-none focus-within:ring-2 focus-within:ring-sky-500 focus-within:ring-offset-2 dark:focus-within:ring-offset-slate-950',
                    active
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                      : 'bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  )}
                >
                  <input
                    type="radio"
                    id="edit-role-status-active"
                    name="edit-role-status"
                    value="active"
                    checked={active}
                    onChange={() => setActive(true)}
                    className="sr-only"
                  />
                  <div className="mt-0.5 shrink-0" aria-hidden="true">
                    {active ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
                      {t.roles.active}
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                      {t.roles.statusActiveDesc}
                    </p>
                  </div>
                </label>

                {/* Inactive Option */}
                <label
                  htmlFor="edit-role-status-inactive"
                  className={cn(
                    'p-3.5 rounded-lg border transition-all cursor-pointer flex items-start gap-3 select-none focus-within:ring-2 focus-within:ring-sky-500 focus-within:ring-offset-2 dark:focus-within:ring-offset-slate-950',
                    !active
                      ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800'
                      : 'bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  )}
                >
                  <input
                    type="radio"
                    id="edit-role-status-inactive"
                    name="edit-role-status"
                    value="inactive"
                    checked={!active}
                    onChange={() => setActive(false)}
                    className="sr-only"
                  />
                  <div className="mt-0.5 shrink-0" aria-hidden="true">
                    {!active ? (
                      <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
                      {t.roles.inactive}
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                      {t.roles.statusInactiveDesc}
                    </p>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Description field (always editable) */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label
              htmlFor="edit-role-description"
              className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                {t.roles.descriptionLabel}
              </span>
              <span className="text-[11px] text-slate-400 font-normal">
                {t.roles.descriptionOptional}
              </span>
            </label>

            <textarea
              id="edit-role-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.roles.descriptionPlaceholder}
              maxLength={500}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            />
            <div className="flex justify-between items-center text-[11px] text-slate-400">
              <span>{t.roles.descriptionEditHelper}</span>
              <span>{description.length}/500</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. Permissions Section */}
      <RolePermissionEditor
        selectedPermissionIds={permissionIds}
        onPermissionsChange={setPermissionIds}
        catalogue={catalogue}
        isSystem={role.is_system}
      />

      {/* 6. Footer Actions Bar */}
      <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
        <div>
          {!isDirty && (
            <span className="text-xs text-slate-400 dark:text-slate-500 italic">
              {t.roles.noChangesDetected}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            id="edit-role-cancel-footer-btn"
            variant="secondary"
            size="md"
            onClick={handleBackOrCancel}
            disabled={isSubmitting}
          >
            <span>{t.roles.cancel}</span>
          </Button>

          <Button
            id="edit-role-save-footer-btn"
            variant="primary"
            size="md"
            onClick={() => handleSubmit()}
            disabled={isSubmitting || !isDirty || (!role.is_system && !nameEn.trim())}
            isLoading={isSubmitting}
            leftIcon={<Save className="w-3.5 h-3.5" />}
          >
            <span>{isSubmitting ? t.roles.savingChanges : t.roles.saveChanges}</span>
          </Button>
        </div>
      </div>

      {/* 7. Unsaved Changes Discard Confirmation Modal */}
      <UnsavedChangesModal
        isOpen={isBlocked}
        onClose={handleKeepEditing}
        onConfirmDiscard={handleDiscardChanges}
      />
    </div>
  );
};

export default EditRolePage;
