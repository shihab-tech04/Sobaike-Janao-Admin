import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { useLanguage } from '@/context/LanguageContext';
import { ComplaintLifecycleStatus, ComplaintStatusTabCount } from '@/types/Complaint';
import { cn } from '@/utils';

export interface ComplaintStatusTabsProps {
  tabs: ComplaintStatusTabCount[];
  activeStatus: ComplaintLifecycleStatus | 'all';
  onSelectStatus: (status: ComplaintLifecycleStatus | 'all') => void;
  loading?: boolean;
}

export const ComplaintStatusTabs: React.FC<ComplaintStatusTabsProps> = ({
  tabs,
  activeStatus,
  onSelectStatus,
  loading = false,
}) => {
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

  if (loading && tabs.length === 0) {
    return (
      <div className="w-full max-w-full overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse shrink-0"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full overflow-x-auto p-1 bg-slate-100/80 dark:bg-slate-900/90 rounded-lg border border-slate-200/80 dark:border-slate-800/80 scrollbar-none">
      <div
        role="tablist"
        aria-label={isBn ? 'অভিযোগ স্ট্যাটাস ফিল্টার ট্যাব' : 'Complaint Status Tabs'}
        className="flex items-center gap-1.5 flex-nowrap min-w-max"
      >
        {tabs.map((tab) => {
        const isActive = activeStatus === tab.status;
        const label = isBn ? tab.labelBn : tab.labelEn;

        return (
          <button
            key={tab.status}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectStatus(tab.status)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all duration-150 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500',
              isActive
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/40'
            )}
          >
            <span>{label}</span>
            <Badge
              size="sm"
              status={isActive ? tab.badgeStatus : 'default'}
              className={cn(
                'text-[10px] px-1.5 py-0 font-mono transition-colors',
                isActive
                  ? 'bg-slate-100 dark:bg-slate-700/80 font-bold'
                  : 'bg-slate-200/60 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400'
              )}
            >
              {formatNumber(tab.count)}
            </Badge>
          </button>
        );
      })}
      </div>
    </div>
  );
};

export default ComplaintStatusTabs;
