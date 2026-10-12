import React from 'react';
import { ComplaintLifecycleStatus } from '@/types/Complaint';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/utils';

export interface MapLegendProps {
  selectedStatus?: ComplaintLifecycleStatus | 'all';
  onSelectStatus?: (status: ComplaintLifecycleStatus | 'all') => void;
  className?: string;
  counts?: Record<ComplaintLifecycleStatus | 'all', number>;
}

interface LegendItem {
  status: ComplaintLifecycleStatus;
  labelEn: string;
  labelBn: string;
  colorClass: string;
}

const LEGEND_ITEMS: LegendItem[] = [
  {
    status: 'submitted',
    labelEn: 'Submitted',
    labelBn: 'দাখিলকৃত',
    colorClass: 'bg-amber-500 dark:bg-amber-400',
  },
  {
    status: 'published',
    labelEn: 'Published',
    labelBn: 'প্রকাশিত',
    colorClass: 'bg-sky-500 dark:bg-sky-400',
  },
  {
    status: 'unpublished',
    labelEn: 'Unpublished',
    labelBn: 'অপ্রকাশিত',
    colorClass: 'bg-slate-500 dark:bg-slate-400',
  },
  {
    status: 'rejected',
    labelEn: 'Rejected',
    labelBn: 'বাতিলকৃত',
    colorClass: 'bg-rose-500 dark:bg-rose-400',
  },
  {
    status: 'edited',
    labelEn: 'Edited',
    labelBn: 'সম্পাদিত',
    colorClass: 'bg-purple-500 dark:bg-purple-400',
  },
];

export const MapLegend: React.FC<MapLegendProps> = ({
  selectedStatus = 'all',
  onSelectStatus,
  className,
  counts,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  return (
    <div
      className={cn(
        'bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-100 dark:border-slate-800">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {isBn ? 'ম্যাপ লেজেন্ড (স্ট্যাটাস নির্দেশক)' : 'Map Legend (Status Indicators)'}
        </span>
        {selectedStatus !== 'all' && onSelectStatus && (
          <button
            type="button"
            onClick={() => onSelectStatus('all')}
            className="text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            {isBn ? 'সব দেখুন' : 'Show All'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {LEGEND_ITEMS.map((item) => {
          const isSelected = selectedStatus === item.status;
          const count = counts ? counts[item.status] : undefined;

          return (
            <button
              key={item.status}
              type="button"
              onClick={() => onSelectStatus?.(isSelected ? 'all' : item.status)}
              className={cn(
                'group flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all border text-left cursor-pointer',
                isSelected
                  ? 'border-slate-400 dark:border-slate-500 bg-slate-100/90 dark:bg-slate-800 ring-1 ring-slate-400/30 dark:ring-slate-500/30'
                  : 'border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 hover:border-slate-200 dark:hover:border-slate-700'
              )}
            >
              <span
                className={cn(
                  'w-2.5 h-2.5 rounded-full shrink-0 transition-transform group-hover:scale-110',
                  item.colorClass
                )}
                aria-hidden="true"
              />
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {isBn ? item.labelBn : item.labelEn}
              </span>
              {count !== undefined && (
                <span className="text-[10px] font-mono px-1 rounded bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MapLegend;
