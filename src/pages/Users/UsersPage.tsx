import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { adminUserApi } from '@/services/api/adminUserApi';
import { AdminUserListItem, UserFilterRole } from '@/types/AdminUser';
import { UsersTable } from '@/components/users/UsersTable';
import { UserLoadingSkeleton } from '@/components/users/UserLoadingSkeleton';
import { DeleteUserModal } from '@/components/users/DeleteUserModal';
import {
  UserPlus,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

/**
 * Generates a bounded list of page numbers and ellipsis tokens for pagination.
 * Prevents rendering arbitrarily large page strips and avoids horizontal scrolling.
 * Guarantees no duplicate numbers and mathematically sound ellipsis placement.
 */
const getVisiblePages = (currentPage: number, total: number): (number | 'ellipsis')[] => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pagesSet = new Set<number>();
  pagesSet.add(1);
  pagesSet.add(total);

  for (let offset = -1; offset <= 1; offset++) {
    const p = currentPage + offset;
    if (p >= 1 && p <= total) {
      pagesSet.add(p);
    }
  }

  if (currentPage <= 3) {
    pagesSet.add(2);
    pagesSet.add(3);
  }

  if (currentPage >= total - 2) {
    pagesSet.add(total - 2);
    pagesSet.add(total - 1);
  }

  const sorted = Array.from(pagesSet).sort((a, b) => a - b);
  const result: (number | 'ellipsis')[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const diff = sorted[i] - sorted[i - 1];
      if (diff === 2) {
        result.push(sorted[i - 1] + 1);
      } else if (diff > 2) {
        result.push('ellipsis');
      }
    }
    result.push(sorted[i]);
  }

  return result;
};

export const UsersPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, language } = useLanguage();
  const { hasPermission, user: currentUser } = useAuth();

  const canManageUsers = hasPermission('admin_users.manage');

  // State
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [roles, setRoles] = useState<UserFilterRole[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Delete Modal State
  const [userToDelete, setUserToDelete] = useState<AdminUserListItem | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);

  // Pagination State
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'inactive'>('all');

  // Success Banner from Navigation state (e.g., after Create, Edit, or Delete)
  const [successMessage, setSuccessMessage] = useState<string | null>(() => {
    const state = location.state as {
      userCreatedSuccess?: boolean;
      userUpdatedSuccess?: boolean;
      userDeletedSuccess?: boolean;
      userName?: string;
    } | null;

    if (state?.userCreatedSuccess) {
      return state.userName
        ? `${state.userName}: ${t.users.userCreatedSuccess}`
        : t.users.userCreatedSuccess;
    }
    if (state?.userUpdatedSuccess) {
      return state.userName
        ? `${state.userName}: ${t.users.userUpdatedSuccess}`
        : t.users.userUpdatedSuccess;
    }
    if (state?.userDeletedSuccess) {
      return state.userName
        ? `${state.userName}: ${t.users.deleteUserSuccess}`
        : t.users.deleteUserSuccess;
    }
    return null;
  });

  // Clear location state after reading
  useEffect(() => {
    const state = location.state as {
      userCreatedSuccess?: boolean;
      userUpdatedSuccess?: boolean;
      userDeletedSuccess?: boolean;
    } | null;
    if (state && (state.userCreatedSuccess || state.userUpdatedSuccess || state.userDeletedSuccess)) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const formatNumber = (num: number): string => {
    if (language !== 'bn') return String(num);
    const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(num).replace(/\d/g, (d) => bnDigits[Number(d)]);
  };

  /**
   * Load users list with server-side pagination and filters
   */
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const offset = (page - 1) * pageSize;
      const response = await adminUserApi.getUsers({
        search: search.trim() || undefined,
        role_id: selectedRole !== 'all' ? selectedRole : undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
        limit: pageSize,
        offset,
      });

      setUsers(response.users);
      setTotalCount(response.total_count);

      // Guard: if current page is invalid due to filter contraction, clamp safely
      if (response.total_count > 0 && offset >= response.total_count) {
        const maxPage = Math.ceil(response.total_count / pageSize);
        setPage(maxPage);
      }
    } catch (err: unknown) {
      console.error('Failed to load administrators:', err);
      const msg = err instanceof Error ? err.message : t.users.configurationError;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, selectedRole, selectedStatus, t]);

  /**
   * Load role choices for filter dropdown using read-safe endpoint (admin_users.view required)
   * Available to all users authorized to view User Management.
   */
  useEffect(() => {
    adminUserApi
      .getUserFilterRoles()
      .then((data) => setRoles(data))
      .catch((err) => console.warn('Could not load roles for user filter:', err));
  }, []);

  // Fetch users when page or filters change
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Reset to page 1 on search change
  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  // Reset to page 1 on role filter change
  const handleRoleChange = (val: string) => {
    setSelectedRole(val);
    setPage(1);
  };

  // Reset to page 1 on status filter change
  const handleStatusChange = (val: 'all' | 'active' | 'inactive') => {
    setSelectedStatus(val);
    setPage(1);
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const startItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-6 pb-12" id="admin-users-page">
      {/* Page Header */}
      <PageHeader
        title={t.users.title}
        description={t.users.description}
        actions={
          <div className="flex items-center gap-2">
            <Button
              id="btn-refresh-users"
              variant="secondary"
              size="sm"
              onClick={loadUsers}
              disabled={loading}
              className="h-9"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {t.common.refresh}
            </Button>

            {canManageUsers && (
              <Button
                id="btn-create-user"
                variant="primary"
                size="sm"
                onClick={() => navigate('/users/create')}
                className="h-9"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {t.users.createUser}
              </Button>
            )}
          </div>
        }
      />

      {/* Success Notification Banner */}
      {successMessage && (
        <div
          id="user-success-banner"
          className="flex items-center justify-between p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 shadow-xs animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="text-sm font-medium">{successMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-100 p-1 rounded-md"
            aria-label={t.common.close}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="input-search-users"
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={t.users.searchPlaceholder}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          {/* Role Filter */}
          <div>
            <select
              id="select-filter-role"
              value={selectedRole}
              onChange={(e) => handleRoleChange(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 text-slate-900 dark:text-slate-100"
            >
              <option value="all">{t.users.allRoles}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {language === 'bn' ? r.name_bn || r.name_en : r.name_en}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              id="select-filter-status"
              value={selectedStatus}
              onChange={(e) => handleStatusChange(e.target.value as 'all' | 'active' | 'inactive')}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 text-slate-900 dark:text-slate-100"
            >
              <option value="all">{t.users.allStatuses}</option>
              <option value="active">{t.users.active}</option>
              <option value="inactive">{t.users.inactive}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <UserLoadingSkeleton />
      ) : error ? (
        <div
          id="users-error-card"
          className="p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-rose-200 dark:border-rose-900/60 shadow-xs"
        >
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t.users.failedToLoadUsers}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            {error}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={loadUsers}
            className="mt-4"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t.users.retry}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Item Count & Page Summary Header */}
          <div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {t.users.showingUsers
                .replace('{start}', formatNumber(startItem))
                .replace('{end}', formatNumber(endItem))
                .replace('{total}', formatNumber(totalCount))}
            </span>
            {totalPages > 1 && (
              <span>
                {t.users.pageIndicator
                  .replace('{current}', formatNumber(page))
                  .replace('{total}', formatNumber(totalPages))}
              </span>
            )}
          </div>

          {/* Table & Mobile Cards */}
          <UsersTable
            users={users}
            canManage={canManageUsers}
            currentUserId={currentUser?.id}
            onView={(id) => navigate(`/users/${id}`)}
            onEdit={(id) => navigate(`/users/${id}/edit`)}
            onDelete={(u) => {
              setUserToDelete(u);
              setIsDeleteModalOpen(true);
            }}
          />

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 px-1 w-full">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                leftIcon={<ChevronLeft className="w-4 h-4" />}
                aria-label={t.users.previous}
              >
                <span>{t.users.previous}</span>
              </Button>

              {/* Mobile Compact Page Indicator */}
              <div className="flex sm:hidden items-center justify-center text-xs font-medium text-slate-600 dark:text-slate-400 px-2 py-1">
                <span>
                  {t.users.pageIndicator
                    .replace('{current}', formatNumber(page))
                    .replace('{total}', formatNumber(totalPages))}
                </span>
              </div>

              {/* Desktop & Tablet Bounded Page Buttons */}
              <div className="hidden sm:flex items-center gap-1 py-1">
                {getVisiblePages(page, totalPages).map((item, idx) => {
                  if (item === 'ellipsis') {
                    return (
                      <span
                        key={`ellipsis-${idx}`}
                        aria-hidden="true"
                        className="w-8 h-8 flex items-center justify-center text-xs text-slate-400 dark:text-slate-500 font-medium select-none"
                      >
                        …
                      </span>
                    );
                  }

                  const isCurrent = item === page;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPage(item)}
                      disabled={loading}
                      aria-label={
                        language === 'bn'
                          ? `পৃষ্ঠা ${formatNumber(item)}-এ যান`
                          : `Go to page ${item}`
                      }
                      aria-current={isCurrent ? 'page' : undefined}
                      className={`min-w-8 h-8 px-2 rounded-md text-xs font-mono font-medium transition-colors ${
                        isCurrent
                          ? 'bg-sky-600 text-white font-bold shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {formatNumber(item)}
                    </button>
                  );
                })}
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                rightIcon={<ChevronRight className="w-4 h-4" />}
                aria-label={t.users.next}
              >
                <span>{t.users.next}</span>
              </Button>
            </div>
          )}
        </div>
      )}
      {/* Delete Confirmation Modal */}
      <DeleteUserModal
        isOpen={isDeleteModalOpen}
        user={userToDelete}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setUserToDelete(null);
        }}
        onSuccess={(deletedName) => {
          setSuccessMessage(`${deletedName}: ${t.users.deleteUserSuccess}`);
          loadUsers();
        }}
      />
    </div>
  );
};

export default UsersPage;
