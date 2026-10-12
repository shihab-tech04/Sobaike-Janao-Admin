import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { adminUserApi } from '@/services/api/adminUserApi';
import { AdminUserListItem, AdminUserDetail } from '@/types/AdminUser';
import {
  AlertTriangle,
  AlertCircle,
  Trash2,
  Mail,
  Shield,
  User as UserIcon,
} from 'lucide-react';

export interface DeleteUserModalProps {
  isOpen: boolean;
  user: AdminUserListItem | AdminUserDetail | null;
  onClose: () => void;
  onSuccess: (deletedUserName: string) => void;
}

export const DeleteUserModal: React.FC<DeleteUserModalProps> = ({
  isOpen,
  user,
  onClose,
  onSuccess,
}) => {
  const { t, language } = useLanguage();
  const isBn = language === 'bn';

  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset state whenever target user or open state changes
  useEffect(() => {
    if (isOpen) {
      setIsDeleting(false);
      setErrorMessage(null);
    }
  }, [isOpen, user]);

  if (!user) return null;

  // Resolve role label from either AdminUserListItem or AdminUserDetail
  const roleName = (() => {
    if ('role' in user && user.role) {
      return isBn
        ? user.role.name_bn || user.role.name_en || '—'
        : user.role.name_en || '—';
    }
    if ('role_name_en' in user) {
      return isBn
        ? user.role_name_bn || user.role_name_en || '—'
        : user.role_name_en || '—';
    }
    return '—';
  })();

  const displayName = user.display_name?.trim() || null;
  const userIdentifier = displayName || user.email;

  const handleDelete = async () => {
    if (isDeleting || !user) return;

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await adminUserApi.deleteUser(user.user_id);
      onSuccess(userIdentifier);
      onClose();
    } catch (err: unknown) {
      console.error('Failed to delete administrator:', err);
      const msg = err instanceof Error ? err.message : t.users.error;
      setErrorMessage(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isDeleting ? () => {} : onClose}
      size="md"
      closeOnBackdrop={!isDeleting}
      className="p-0 overflow-hidden"
    >
      <div className="p-6 space-y-5" id="delete-user-modal">
        {/* Warning Icon & Title Header */}
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 flex items-center justify-center shrink-0 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3
              id="delete-user-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              {t.users.deleteUserConfirmTitle}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {t.users.deleteUserConfirmMessage}
            </p>
          </div>
        </div>

        {/* Target Administrator Summary Box */}
        <div
          id="delete-user-target-summary"
          className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 p-4 space-y-2.5 text-xs"
        >
          {/* Display Name */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
              <UserIcon className="w-3.5 h-3.5 text-slate-400" />
              {t.users.displayName}:
            </span>
            <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[220px]">
              {displayName || (
                <span className="italic text-slate-400 font-normal">
                  {t.users.noDisplayName}
                </span>
              )}
            </span>
          </div>

          {/* Email */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              {t.users.email}:
            </span>
            <span className="font-mono text-slate-900 dark:text-slate-100 truncate max-w-[220px]">
              {user.email}
            </span>
          </div>

          {/* Role */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              {t.users.role}:
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {roleName}
            </span>
          </div>
        </div>

        {/* Error Feedback Banner */}
        {errorMessage && (
          <div
            id="delete-user-error-banner"
            className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/70 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2 animate-in fade-in"
          >
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <p className="leading-snug flex-1">{errorMessage}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            id="btn-cancel-delete-user"
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isDeleting}
            className="h-9 px-4"
          >
            {t.common.cancel}
          </Button>

          <Button
            id="btn-confirm-delete-user"
            type="button"
            variant="danger"
            size="sm"
            onClick={handleDelete}
            isLoading={isDeleting}
            disabled={isDeleting}
            leftIcon={<Trash2 className="w-4 h-4" />}
            className="h-9 px-4"
          >
            {isDeleting ? t.users.deletingUser : t.users.deleteUser}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default DeleteUserModal;
