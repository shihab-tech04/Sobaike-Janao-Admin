import React from 'react';
import { ResponseFilterState, ResponseTypeFilter } from '@/types/Response';
import { useLanguage } from '@/context/LanguageContext';
import { Button } from '@/components/ui/Button';
import { Search, X, Calendar, Filter } from 'lucide-react';

export interface ResponseFiltersProps {
  filters: ResponseFilterState;
  onFilterChange: (newFilters: Partial<ResponseFilterState>) => void;
  onResetFilters: () => void;
  isLoading?: boolean;
}

export const ResponseFilters: React.FC<ResponseFiltersProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  isLoading,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const hasActiveFilters = Boolean(
    filters.search.trim() !== '' ||
      filters.responseType !== 'all' ||
      filters.dateRange.startDate ||
      filters.dateRange.endDate
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1 min-w-0">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            placeholder={
              isBn
                ? 'রেসপন্স আইডি, রিপোর্ট আইডি বা প্রতিক্রিয়ার লেখা খুঁজুন'
                : 'Search Response ID, Report ID, or response text'
            }
            className="w-full pl-9 pr-9 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100 placeholder-slate-400"
            disabled={isLoading}
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onFilterChange({ search: '' })}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={isBn ? 'অনুসন্ধান মুছুন' : 'Clear search'}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Response Type Dropdown */}
        <div className="w-full md:w-64 shrink-0">
          <select
            value={filters.responseType}
            onChange={(e) =>
              onFilterChange({ responseType: e.target.value as ResponseTypeFilter })
            }
            className="w-full py-2 px-3 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
            disabled={isLoading}
            aria-label={isBn ? 'প্রতিক্রিয়ার ধরন' : 'Response Type'}
          >
            <option value="all">{isBn ? 'সকল ধরন' : 'All Types'}</option>
            <option value="citizen_information">
              {isBn ? 'তথ্য / অভিজ্ঞতা' : 'Information / Experience'}
            </option>
            <option value="subject_response">
              {isBn ? 'উল্লিখিত ব্যক্তি / পক্ষ' : 'Mentioned Person / Party'}
            </option>
          </select>
        </div>

        {/* Date Range Inputs */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="date"
              value={filters.dateRange.startDate || ''}
              onChange={(e) =>
                onFilterChange({
                  dateRange: { ...filters.dateRange, startDate: e.target.value || undefined },
                })
              }
              className="py-1.5 px-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              title={isBn ? 'শুরুর তারিখ' : 'Start Date'}
              aria-label={isBn ? 'শুরুর তারিখ' : 'Start Date'}
              disabled={isLoading}
            />
          </div>
          <span className="text-slate-400 text-xs">-</span>
          <div className="relative">
            <input
              type="date"
              value={filters.dateRange.endDate || ''}
              onChange={(e) =>
                onFilterChange({
                  dateRange: { ...filters.dateRange, endDate: e.target.value || undefined },
                })
              }
              className="py-1.5 px-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              title={isBn ? 'শেষের তারিখ' : 'End Date'}
              aria-label={isBn ? 'শেষের তারিখ' : 'End Date'}
              disabled={isLoading}
            />
          </div>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onResetFilters}
              className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 ml-1"
            >
              {isBn ? 'মুছুন' : 'Clear'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResponseFilters;
