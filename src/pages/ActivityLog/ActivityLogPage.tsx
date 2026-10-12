import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { AccessDenied } from '@/components/common';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { auditLogApi } from '@/services/api/auditLogApi';
import { AuditLogItem } from '@/types/AuditLog';
import {
  ActivityLogTable,
  ActivityLogFilters,
  ActivityLogDetailDrawer,
  ActivityLogLoadingSkeleton,
} from '@/components/activityLog';
import {
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  History,
} from 'lucide-react';

/**
 * Generates a bounded list of page numbers and ellipsis tokens for pagination.
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

export const ActivityLogPage: React.FC = () => {
  const { t, language } = useLanguage();
  const { hasPermission } = useAuth();

  // Permission Guard Check (Fails closed)
  if (!hasPermission('audit.view')) {
    return <AccessDenied requiredPermission="audit.view" />;
  }

  // Data & State
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination State
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(15);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Filters State
  const [search, setSearch] = useState<string>('');
  const [action, setAction] = useState<string>('all');
  const [targetType, setTargetType] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Detail Drawer State
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  const formatNumber = (num: number): string => {
    if (language !== 'bn') return String(num);
    const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(num).replace(/\d/g, (d) => bnDigits[Number(d)]);
  };

  const hasActiveFilters =
    Boolean(search.trim()) ||
    action !== 'all' ||
    targetType !== 'all' ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const clearFilters = () => {
    setSearch('');
    setAction('all');
    setTargetType('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  /**
   * Load audit logs via API service
   */
  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const offset = (page - 1) * pageSize;
      const response = await auditLogApi.getAuditLogs({
        search: search.trim() || undefined,
        action: action !== 'all' ? action : undefined,
        target_type: targetType !== 'all' ? targetType : undefined,
        date_from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        date_to: dateTo ? new Date(`${dateTo}T23:59:59.999Z`).toISOString() : undefined,
        limit: pageSize,
        offset,
      });

      setLogs(response.logs);
      setTotalCount(response.total_count);

      // Guard: clamp page if filter contraction invalidates current page
      if (response.total_count > 0 && offset >= response.total_count) {
        const maxPage = Math.ceil(response.total_count / pageSize);
        setPage(maxPage);
      }
    } catch (err: unknown) {
      console.error('Failed to load activity logs:', err);
      const msg = err instanceof Error ? err.message : 'Failed to load activity logs';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, action, targetType, dateFrom, dateTo]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Open drawer
  const handleViewDetails = (log: AuditLogItem) => {
    setSelectedLog(log);
    setIsDrawerOpen(true);
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const startItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-6 pb-12" id="admin-activity-log-page">
      {/* Page Header */}
      <PageHeader
        title={language === 'bn' ? 'কার্যক্রম লগ' : 'Activity Log'}
        description={
          language === 'bn'
            ? 'প্রশাসনিক ব্যবস্থা ও পরিবর্তনের অডিট ইতিহাস ও কার্যকলাপ পর্যবেক্ষণ করুন'
            : 'Inspect audit trail and history of administrative operations across the platform'
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              id="btn-refresh-activity"
              variant="secondary"
              size="sm"
              onClick={loadLogs}
              disabled={loading}
              className="h-9"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {t.common.refresh}
            </Button>
          </div>
        }
      />

      {/* Error Banner with Retry */}
      {error && (
        <div
          id="activity-error-banner"
          className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-start justify-between gap-3 shadow-xs animate-in fade-in"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">
                {language === 'bn' ? 'অডিট লগ লোড করা সম্ভব হয়নি' : 'Failed to Load Activity Logs'}
              </p>
              <p className="text-xs text-rose-600 dark:text-rose-300 mt-1">{error}</p>
            </div>
          </div>
          <Button
            id="btn-retry-activity"
            variant="secondary"
            size="sm"
            onClick={loadLogs}
            className="shrink-0 h-8 text-xs"
          >
            {language === 'bn' ? 'পুনরায় চেষ্টা করুন' : 'Retry'}
          </Button>
        </div>
      )}

      {/* Filters Card */}
      <ActivityLogFilters
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        action={action}
        onActionChange={(v) => {
          setAction(v);
          setPage(1);
        }}
        targetType={targetType}
        onTargetTypeChange={(v) => {
          setTargetType(v);
          setPage(1);
        }}
        dateFrom={dateFrom}
        onDateFromChange={(v) => {
          setDateFrom(v);
          setPage(1);
        }}
        dateTo={dateTo}
        onDateToChange={(v) => {
          setDateTo(v);
          setPage(1);
        }}
        onClearFilters={clearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Main Table or Skeleton */}
      {loading && logs.length === 0 ? (
        <ActivityLogLoadingSkeleton />
      ) : (
        <ActivityLogTable logs={logs} onViewDetails={handleViewDetails} />
      )}

      {/* Pagination Footer */}
      {totalCount > 0 && (
        <div
          id="activity-pagination"
          className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-800"
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {language === 'bn' ? (
              <>
                মোট <span className="font-semibold text-slate-900 dark:text-slate-100">{formatNumber(totalCount)}</span> টি রেকর্ডের মধ্যে{' '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">{formatNumber(startItem)}</span>-
                <span className="font-semibold text-slate-900 dark:text-slate-100">{formatNumber(endItem)}</span> দেখানো হচ্ছে
              </>
            ) : (
              <>
                Showing <span className="font-semibold text-slate-900 dark:text-slate-100">{formatNumber(startItem)}</span> to{' '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">{formatNumber(endItem)}</span> of{' '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">{formatNumber(totalCount)}</span> activity logs
              </>
            )}
          </p>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <Button
                id="btn-prev-page"
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1 || loading}
                className="h-8 px-2"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <div className="flex items-center gap-1">
                {getVisiblePages(page, totalPages).map((p, idx) =>
                  p === 'ellipsis' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-slate-400 text-xs">
                      ...
                    </span>
                  ) : (
                    <button
                      key={`page-${p}`}
                      type="button"
                      onClick={() => setPage(p)}
                      disabled={loading}
                      className={`min-w-[32px] h-8 text-xs font-semibold rounded-lg transition-colors ${
                        page === p
                          ? 'bg-sky-600 text-white dark:bg-sky-500'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {formatNumber(p)}
                    </button>
                  )
                )}
              </div>

              <Button
                id="btn-next-page"
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page === totalPages || loading}
                className="h-8 px-2"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Detail Drawer */}
      <ActivityLogDetailDrawer
        log={selectedLog}
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedLog(null);
        }}
      />
    </div>
  );
};
