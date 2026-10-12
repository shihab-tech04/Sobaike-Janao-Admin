import React from 'react';
import { ResponseStatusFilter } from '@/types/Response';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/utils';

export interface ResponseStatusTabsProps {
  activeStatus: ResponseStatusFilter;
  counts: {
    all: number;
    pending_review: number;
    published: number;
    rejected: number;
    unpublished: number;
  };
  onSelectStatus: (status: ResponseStatusFilter) => void;
  disabled?: boolean;
}

export const ResponseStatusTabs: React.FC<ResponseStatusTabsProps> = ({
  activeStatus,
  counts,
  onSelectStatus,
  disabled,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const formatNum = (num: number): string => {
    if (!isBn) return num.toLocaleString();
    const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return num
      .toLocaleString()
      .split('')
      .map((d) => (/[0-9]/.test(d) ? bnDigits[parseInt(d, 10)] : d))
      .join('');
  };

  const tabs: { key: ResponseStatusFilter; labelEn: string; labelBn: string; count: number }[] = [
    { key: 'all', labelEn: 'All', labelBn: 'সকল', count: counts.all },
    {
      key: 'pending_review',
      labelEn: 'Pending Review',
      labelBn: 'পর্যালোচনা অপেক্ষমাণ',
      count: counts.pending_review,
    },
    { key: 'published', labelEn: 'Published', labelBn: 'প্রকাশিত', count: counts.published },
    { key: 'rejected', labelEn: 'Rejected', labelBn: 'প্রত্যাখ্যাত', count: counts.rejected },
    { key: 'unpublished', labelEn: 'Unpublished', labelBn: 'অপ্রকাশিত', count: counts.unpublished },
  ];

  return (
    <div className="w-full border-b border-slate-200 dark:border-slate-800">
      <nav
        className="-mb-px flex space-x-2 sm:space-x-4 overflow-x-auto py-1 scrollbar-none"
        aria-label={isBn ? 'স্ট্যাটাস ফিল্টার' : 'Status tabs'}
      >
        {tabs.map((tab) => {
          const isActive = activeStatus === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              disabled={disabled}
              onClick={() => onSelectStatus(tab.key)}
              className={cn(
                'whitespace-nowrap flex items-center gap-2 py-2.5 px-3 border-b-2 font-medium text-sm transition-colors rounded-t-md min-h-[44px]',
                isActive
                  ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400 bg-sky-50/50 dark:bg-sky-950/20'
                  : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
              )}
            >
              <span>{isBn ? tab.labelBn : tab.labelEn}</span>
              <span
                className={cn(
                  'py-0.5 px-2 rounded-full text-xs font-mono font-medium',
                  isActive
                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                )}
              >
                {formatNum(tab.count)}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default ResponseStatusTabs;
