import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useLanguage } from '@/context/LanguageContext';
import { StatusSummaryItem, LifecycleStatusKey } from '@/types/Dashboard';
import { Activity } from 'lucide-react';
import { cn } from '@/utils';

const STATUS_COLOR_MAP: Record<LifecycleStatusKey, string> = {
  submitted: 'bg-amber-500 dark:bg-amber-400',
  published: 'bg-emerald-500 dark:bg-emerald-400',
  unpublished: 'bg-slate-400 dark:bg-slate-500',
  rejected: 'bg-rose-500 dark:bg-rose-400',
  edited: 'bg-sky-500 dark:bg-sky-400',
};

export interface StatusOverviewProps {
  statusItems: StatusSummaryItem[];
  loading?: boolean;
}

export const StatusOverview: React.FC<StatusOverviewProps> = ({ statusItems, loading }) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const formatNumber = (num: number): string => {
    if (!isBn) return num.toLocaleString();
    const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return num
      .toLocaleString()
      .split('')
      .map((d) => (/[0-9]/.test(d) ? bnDigits[parseInt(d, 10)] : d))
      .join('');
  };

  const totalComplaints = statusItems.reduce((acc, curr) => acc + curr.count, 0);

  if (loading || statusItems.length === 0) {
    return (
      <Card variant="default" className="h-full">
        <CardHeader>
          <div className="h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-3 w-60 bg-slate-100 dark:bg-slate-800 rounded animate-pulse mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <div className="h-4 w-28 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="default" className="h-full flex flex-col justify-between">
      <div>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <CardTitle className="text-sm font-semibold">
                {isBn ? 'অভিযোগের লাইফসাইকেল স্ট্যাটাস' : 'Complaint Lifecycle Status'}
              </CardTitle>
            </div>
            <CardDescription>
              {isBn
                ? 'দাখিলকৃত অভিযোগের বর্তমান মডারেশন ও প্রকাশনা অবস্থা'
                : 'Current distribution of registered reports across lifecycle stages'}
            </CardDescription>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium block">
              {isBn ? 'মোট' : 'Total'}
            </span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200 font-mono">
              {formatNumber(totalComplaints)}
            </span>
          </div>
        </CardHeader>

        <CardContent className="pt-3 space-y-4">
          {/* Segmented Visual Distribution Bar */}
          <div className="space-y-1.5">
            <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex shadow-inner">
              {statusItems.map((item) => {
                if (item.percentage <= 0) return null;
                return (
                  <div
                    key={item.key}
                    style={{ width: `${item.percentage}%` }}
                    className={cn(
                      STATUS_COLOR_MAP[item.key] || 'bg-slate-400',
                      'h-full transition-all duration-300 relative'
                    )}
                    title={`${isBn ? item.labelBn : item.labelEn}: ${item.count} (${item.percentage.toFixed(1)}%)`}
                  />
                );
              })}
            </div>
          </div>

          {/* Detailed Status Breakdown Rows */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {statusItems.map((item) => {
              const label = isBn ? item.labelBn : item.labelEn;
              const desc = isBn ? item.descriptionBn : item.descriptionEn;
              const colorClass = STATUS_COLOR_MAP[item.key] || 'bg-slate-400';

              return (
                <div
                  key={item.key}
                  className="py-2.5 flex items-center justify-between group hover:bg-slate-50/60 dark:hover:bg-slate-800/30 px-1 rounded transition-colors"
                >
                  <div className="flex items-start gap-2.5 min-w-0 pr-2">
                    <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', colorClass)} />
                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {label}
                        </span>
                        <Badge status={item.badgeStatus} size="sm" variant="subtle">
                          {item.percentage.toFixed(1)}%
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5 max-w-xs md:max-w-sm">
                        {desc}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 font-mono">
                      {formatNumber(item.count)}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block">
                      {isBn ? 'টি' : 'reports'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </div>
    </Card>
  );
};

export default StatusOverview;
