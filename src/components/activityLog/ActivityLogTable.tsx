import React from 'react';
import { AuditLogItem } from '@/types/AuditLog';
import { useLanguage } from '@/context/LanguageContext';
import { Button } from '@/components/ui/Button';
import {
  getAuditActionMeta,
  formatTargetType,
  getSeverityClasses,
  formatAuditTimestamp,
  getActorDisplayInfo,
  formatAuditSummary,
} from '@/utils/auditLogUtils';
import {
  History,
  Eye,
  Clock,
  User,
  Shield,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/utils';

export interface ActivityLogTableProps {
  logs: AuditLogItem[];
  onViewDetails: (log: AuditLogItem) => void;
}

export const ActivityLogTable: React.FC<ActivityLogTableProps> = ({
  logs,
  onViewDetails,
}) => {
  const { language } = useLanguage();

  if (logs.length === 0) {
    return (
      <div
        id="empty-activity-state"
        className="p-12 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800"
      >
        <History className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
          {language === 'bn' ? 'কোনো কার্যক্রম পাওয়া যায়নি' : 'No Activity Logs Found'}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
          {language === 'bn'
            ? 'বর্তমান অনুসন্ধানের শর্ত বা ফিল্টারের সাথে মিলে এমন কোনো অডিট রেকর্ড নেই।'
            : 'No audit records match the current filter or query parameters.'}
        </p>
      </div>
    );
  }

  return (
    <div
      id="activity-log-table-container"
      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs"
    >
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm" id="activity-logs-table">
          <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
            <tr>
              <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                {language === 'bn' ? 'সময়' : 'Timestamp'}
              </th>
              <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                {language === 'bn' ? 'কার্যক্রম' : 'Action'}
              </th>
              <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                {language === 'bn' ? 'কর্তৃপক্ষ (অ্যাক্টর)' : 'Actor'}
              </th>
              <th scope="col" className="px-5 py-3.5 whitespace-nowrap">
                {language === 'bn' ? 'টার্গেট' : 'Target'}
              </th>
              <th scope="col" className="px-5 py-3.5">
                {language === 'bn' ? 'বিবরণ সংক্ষেপ' : 'Summary'}
              </th>
              <th scope="col" className="px-5 py-3.5 text-right whitespace-nowrap">
                {language === 'bn' ? 'পদক্ষেপ' : 'Action'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {logs.map((log) => {
              const meta = getAuditActionMeta(log.action);
              const severity = getSeverityClasses(meta.severity);
              const ActionIcon = meta.icon;
              const time = formatAuditTimestamp(log.created_at, language);

              const summarySnippet = formatAuditSummary(log, language);
              const actorInfo = getActorDisplayInfo(log, language);

              return (
                <tr
                  key={log.id}
                  id={`audit-row-${log.id}`}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  {/* Timestamp */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium">{time.date}</span>
                      <span className="text-slate-400 dark:text-slate-500">{time.time}</span>
                    </div>
                  </td>

                  {/* Action Badge */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border shadow-2xs',
                        severity.badge
                      )}
                    >
                      <ActionIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>{language === 'bn' ? meta.labelBn : meta.labelEn}</span>
                    </span>
                  </td>

                  {/* Actor */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div className="max-w-[160px] truncate">
                        <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                          {actorInfo.primary}
                        </p>
                        {actorInfo.secondary && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {actorInfo.secondary}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Target */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {formatTargetType(log.target_type, language)}
                      </span>
                      <span className="font-mono text-xs text-slate-800 dark:text-slate-200 font-semibold max-w-[130px] truncate">
                        {log.target_id || '—'}
                      </span>
                    </div>
                  </td>

                  {/* Summary Snippet */}
                  <td className="px-5 py-3.5 max-w-[240px]">
                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                      {summarySnippet || '—'}
                    </p>
                  </td>

                  {/* Actions Column */}
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <Button
                      id={`btn-view-log-${log.id}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewDetails(log)}
                      className="h-8 px-2.5 text-xs text-sky-600 dark:text-sky-400 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      {language === 'bn' ? 'বিস্তারিত' : 'Details'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800 p-3 space-y-3">
        {logs.map((log) => {
          const meta = getAuditActionMeta(log.action);
          const severity = getSeverityClasses(meta.severity);
          const ActionIcon = meta.icon;
          const time = formatAuditTimestamp(log.created_at, language);
          const actorInfo = getActorDisplayInfo(log, language);

          return (
            <div
              key={log.id}
              id={`mobile-audit-card-${log.id}`}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border shadow-2xs',
                    severity.badge
                  )}
                >
                  <ActionIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>{language === 'bn' ? meta.labelBn : meta.labelEn}</span>
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                  {time.date}
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-start justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400 pt-0.5">{language === 'bn' ? 'কর্তৃপক্ষ:' : 'Actor:'}</span>
                  <div className="text-right max-w-[200px]">
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate block">
                      {actorInfo.primary}
                    </span>
                    {actorInfo.secondary && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate block">
                        {actorInfo.secondary}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400">{language === 'bn' ? 'টার্গেট:' : 'Target:'}</span>
                  <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                    {formatTargetType(log.target_type, language)}: {log.target_id || '—'}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex justify-end">
                <Button
                  id={`btn-view-mobile-log-${log.id}`}
                  variant="secondary"
                  size="sm"
                  onClick={() => onViewDetails(log)}
                  className="w-full h-9 text-xs flex items-center justify-center gap-1.5 min-h-[44px]"
                >
                  <Eye className="w-4 h-4" />
                  <span>{language === 'bn' ? 'বিস্তারিত অডিট রেকর্ড দেখুন' : 'View Audit Details'}</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
