import React from 'react';
import { AdminUserListItem } from '@/types/AdminUser';
import { useLanguage } from '@/context/LanguageContext';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Shield,
  ShieldCheck,
  Lock,
  Edit2,
  Eye,
  User as UserIcon,
  CheckCircle2,
  XCircle,
  Mail,
  Trash2,
} from 'lucide-react';
import { formatDate } from '@/utils';

export interface UsersTableProps {
  users: AdminUserListItem[];
  canManage: boolean;
  currentUserId?: string;
  onView: (userId: string) => void;
  onEdit: (userId: string) => void;
  onDelete?: (user: AdminUserListItem) => void;
}

export const UsersTable: React.FC<UsersTableProps> = ({
  users,
  canManage,
  currentUserId,
  onView,
  onEdit,
  onDelete,
}) => {
  const { t, language } = useLanguage();
  const isBn = language === 'bn';

  if (users.length === 0) {
    return (
      <div
        id="empty-users-state"
        className="p-12 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800"
      >
        <UserIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
          {t.users.noUsersFound}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
          {t.users.noUsersFoundDesc}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm" id="admin-users-table">
          <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
            <tr>
              <th scope="col" className="px-5 py-3.5">
                {t.users.displayName} / {t.users.email}
              </th>
              <th scope="col" className="px-5 py-3.5">
                {t.users.accountType}
              </th>
              <th scope="col" className="px-5 py-3.5">
                {t.users.role}
              </th>
              <th scope="col" className="px-5 py-3.5">
                {t.users.status}
              </th>
              <th scope="col" className="px-5 py-3.5">
                {t.users.created}
              </th>
              <th scope="col" className="px-5 py-3.5 text-right">
                {t.common.actions}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {users.map((user) => {
              const roleName = isBn
                ? user.role_name_bn || user.role_name_en || '—'
                : user.role_name_en || '—';

              return (
                <tr
                  key={user.user_id}
                  id={`user-row-${user.user_id}`}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold ${
                          user.is_super_admin
                            ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                            : 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                        }`}
                      >
                        {user.is_super_admin ? (
                          <ShieldCheck className="w-4 h-4" />
                        ) : (
                          <UserIcon className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm truncate">
                          {user.display_name || (
                            <span className="italic text-slate-400">
                              {t.users.noDisplayName}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{user.email}</span>
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    {user.is_super_admin ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                        <Lock className="w-3 h-3 shrink-0" />
                        {t.users.superAdmin}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {t.users.standardAdmin}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    {user.is_super_admin ? (
                      <span className="text-xs font-medium text-purple-700 dark:text-purple-300 italic">
                        {t.users.systemAccessPermanent}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {roleName}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    {user.active ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        {t.users.active}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        <XCircle className="w-3 h-3 text-rose-500" />
                        {t.users.inactive}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(user.created_at)}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        id={`btn-view-user-${user.user_id}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => onView(user.user_id)}
                        className="h-8 px-2.5 text-xs text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400"
                        title={t.users.viewUser}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        {t.common.viewDetails}
                      </Button>

                      {canManage && (
                        user.is_super_admin ? (
                          <div
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-400 dark:text-slate-500 rounded bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 cursor-not-allowed"
                            title={t.users.superAdminCannotBeEdited}
                          >
                            <Lock className="w-3 h-3" />
                            {t.users.locked}
                          </div>
                        ) : user.can_manage_target === false ? (
                          <div
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-400 dark:text-slate-500 rounded bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 cursor-not-allowed"
                            title={t.users.strongerUserCannotBeEdited}
                          >
                            <Lock className="w-3 h-3" />
                            {t.users.restrictedBadge}
                          </div>
                        ) : (
                          <>
                            <Button
                              id={`btn-edit-user-${user.user_id}`}
                              variant="secondary"
                              size="sm"
                              onClick={() => onEdit(user.user_id)}
                              className="h-8 px-2.5 text-xs"
                              title={t.users.editUser}
                            >
                              <Edit2 className="w-3.5 h-3.5 mr-1" />
                              {t.users.editUser}
                            </Button>

                            {user.user_id !== currentUserId && onDelete && (
                              <Button
                                id={`btn-delete-user-${user.user_id}`}
                                variant="ghost"
                                size="sm"
                                onClick={() => onDelete(user)}
                                className="h-8 px-2.5 text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                title={t.users.deleteUser}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                                {t.users.deleteUser}
                              </Button>
                            )}
                          </>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
        {users.map((user) => {
          const roleName = isBn
            ? user.role_name_bn || user.role_name_en || '—'
            : user.role_name_en || '—';

          return (
            <div
              key={user.user_id}
              id={`user-card-${user.user_id}`}
              className="p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold ${
                      user.is_super_admin
                        ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                        : 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
                    }`}
                  >
                    {user.is_super_admin ? (
                      <ShieldCheck className="w-4 h-4" />
                    ) : (
                      <UserIcon className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-sm truncate">
                      {user.display_name || (
                        <span className="italic text-slate-400">
                          {t.users.noDisplayName}
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                      <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{user.email}</span>
                    </p>
                  </div>
                </div>

                {user.active ? (
                  <Badge status="success" size="sm">
                    {t.users.active}
                  </Badge>
                ) : (
                  <Badge status="error" size="sm">
                    {t.users.inactive}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300 pt-1">
                {user.is_super_admin ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300">
                    <Lock className="w-3 h-3" />
                    {t.users.superAdmin}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {roleName}
                  </span>
                )}

                <span className="text-slate-400 text-xs">
                  {formatDate(user.created_at)}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onView(user.user_id)}
                  className="h-8 px-3 text-xs"
                >
                  <Eye className="w-3.5 h-3.5 mr-1" />
                  {t.common.viewDetails}
                </Button>

                {canManage && (
                  user.is_super_admin ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 dark:text-slate-500 rounded bg-slate-50 dark:bg-slate-800/60">
                      <Lock className="w-3 h-3" />
                      {t.users.locked}
                    </span>
                  ) : user.can_manage_target === false ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 dark:text-slate-500 rounded bg-slate-50 dark:bg-slate-800/60">
                      <Lock className="w-3 h-3" />
                      {t.users.restrictedBadge}
                    </span>
                  ) : (
                    <>
                      <Button
                        id={`btn-edit-user-mobile-${user.user_id}`}
                        variant="secondary"
                        size="sm"
                        onClick={() => onEdit(user.user_id)}
                        className="h-8 px-3 text-xs"
                      >
                        <Edit2 className="w-3.5 h-3.5 mr-1" />
                        {t.users.editUser}
                      </Button>

                      {user.user_id !== currentUserId && onDelete && (
                        <Button
                          id={`btn-delete-user-mobile-${user.user_id}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(user)}
                          className="h-8 px-3 text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          title={t.users.deleteUser}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          {t.users.deleteUser}
                        </Button>
                      )}
                    </>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
