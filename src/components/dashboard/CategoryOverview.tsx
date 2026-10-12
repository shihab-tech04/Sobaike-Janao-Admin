import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { useLanguage } from '@/context/LanguageContext';
import { CategorySummaryItem } from '@/types/Dashboard';
import { FolderTree } from 'lucide-react';
import { cn } from '@/utils';

const SEGMENT_COLOR_PALETTE = [
  'bg-sky-500 dark:bg-sky-400',
  'bg-amber-500 dark:bg-amber-400',
  'bg-rose-500 dark:bg-rose-400',
  'bg-purple-500 dark:bg-purple-400',
  'bg-emerald-500 dark:bg-emerald-400',
  'bg-indigo-500 dark:bg-indigo-400',
];

export interface CategoryOverviewProps {
  categories: CategorySummaryItem[];
  loading?: boolean;
}

export const CategoryOverview: React.FC<CategoryOverviewProps> = ({ categories, loading }) => {
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

  if (loading) {
    return (
      <Card variant="default" className="h-full">
        <CardHeader>
          <div className="h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-3 w-60 bg-slate-100 dark:bg-slate-800 rounded animate-pulse mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 py-1">
              <div className="flex justify-between">
                <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              </div>
              <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
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
              <FolderTree className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <CardTitle className="text-sm font-semibold">
                {isBn ? 'বিভাগ অনুযায়ী প্রতিবেদন' : 'Reports by Segment'}
              </CardTitle>
            </div>
            <CardDescription>
              {isBn
                ? 'সক্রিয় বিভাগসমূহে প্রতিবেদনের আনুপাতিক বণ্টন'
                : 'Proportional distribution of reports across active taxonomy segments'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="pt-3 space-y-4">
          {categories.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              {isBn ? 'কোনো বিভাগ পাওয়া যায়নি' : 'No segments found'}
            </div>
          ) : (
            categories.map((cat, index) => {
              const name = isBn ? cat.nameBn : cat.nameEn;
              const colorClass =
                SEGMENT_COLOR_PALETTE[index % SEGMENT_COLOR_PALETTE.length];

              return (
                <div key={cat.id} className="space-y-1.5 group">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2.5 h-2.5 rounded-xs shrink-0', colorClass)} />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                      <strong className="text-slate-800 dark:text-slate-200 font-mono">
                        {formatNumber(cat.count)}
                      </strong>
                      <span>({cat.percentage.toFixed(1)}%)</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800/80 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-300', colorClass)}
                      style={{
                        width: `${Math.min(100, Math.max(0, cat.percentage))}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </div>
    </Card>
  );
};

export default CategoryOverview;
