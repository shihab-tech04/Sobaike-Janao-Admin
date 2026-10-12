import React from 'react';
import { TaxonomyFilterState, TaxonomySegment } from '@/types/Category';
import { useLanguage } from '@/context/LanguageContext';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { RotateCcw, SlidersHorizontal, X, Layers, Activity } from 'lucide-react';
import { cn } from '@/utils';

export interface CategoryFiltersProps {
  filters: TaxonomyFilterState;
  onChange: (filters: TaxonomyFilterState) => void;
  onReset: () => void;
  segments: TaxonomySegment[];
  totalResultsCount: number;
  className?: string;
}

export const CategoryFilters: React.FC<CategoryFiltersProps> = ({
  filters,
  onChange,
  onReset,
  segments,
  totalResultsCount,
  className,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const hasActiveFilters = Boolean(
    filters.search ||
    filters.status !== 'all' ||
    filters.segmentId !== 'all'
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filters, search: e.target.value });
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...filters,
      status: e.target.value as 'all' | 'active' | 'inactive',
    });
  };

  const handleSegmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...filters,
      segmentId: e.target.value,
    });
  };

  const selectedSegmentObj = segments.find((s) => s.id === filters.segmentId);

  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3.5 shadow-xs',
        className
      )}
    >
      {/* Primary Filters Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* Search */}
        <div className="sm:col-span-2 lg:col-span-2">
          <Input
            id="taxonomy-search-input"
            value={filters.search}
            onChange={handleSearchChange}
            placeholder={
              isBn
                ? 'বিভাগ বা সাব-ক্যাটাগরির নাম খুঁজুন...'
                : 'Search segment or subcategory name/ID...'
            }
            isSearch
            onClear={() => onChange({ ...filters, search: '' })}
            className="h-9 text-xs"
          />
        </div>

        {/* Segment Filter */}
        <div>
          <Select
            id="taxonomy-segment-select"
            value={filters.segmentId}
            onChange={handleSegmentChange}
            className="h-9 text-xs"
          >
            <option value="all">{isBn ? 'সকল বিভাগ' : 'All Segments'}</option>
            {segments.map((seg) => (
              <option key={seg.id} value={seg.id}>
                {isBn ? seg.nameBn : seg.nameEn}
              </option>
            ))}
          </Select>
        </div>

        {/* Status Filter */}
        <div>
          <Select
            id="taxonomy-status-select"
            value={filters.status}
            onChange={handleStatusChange}
            className="h-9 text-xs"
          >
            <option value="all">{isBn ? 'সকল স্ট্যাটাস' : 'All Statuses'}</option>
            <option value="active">{isBn ? 'সক্রিয়' : 'Active'}</option>
            <option value="inactive">{isBn ? 'নিষ্ক্রিয়' : 'Inactive'}</option>
          </Select>
        </div>
      </div>

      {/* Active Filter Chips & Reset */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{isBn ? 'সক্রিয় ফিল্টার:' : 'Active:'}</span>
          </span>

          {!hasActiveFilters ? (
            <span className="text-slate-400 italic text-[11px]">
              {isBn ? 'সকল শ্রেণিবিন্যাস প্রদর্শিত হচ্ছে' : 'Showing all taxonomy records'}
            </span>
          ) : (
            <>
              {filters.search && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                  <span>"{filters.search}"</span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...filters, search: '' })}
                    className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                    aria-label="Remove search filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {filters.segmentId !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                  <Layers className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {selectedSegmentObj
                      ? isBn
                        ? selectedSegmentObj.nameBn
                        : selectedSegmentObj.nameEn
                      : filters.segmentId}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...filters, segmentId: 'all' })}
                    className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                    aria-label="Remove segment filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {filters.status !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                  <Activity className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                  <span>
                    {filters.status === 'active'
                      ? isBn
                        ? 'সক্রিয়'
                        : 'Active'
                      : isBn
                      ? 'নিষ্ক্রিয়'
                      : 'Inactive'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...filters, status: 'all' })}
                    className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                    aria-label="Remove status filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <Badge variant="outline" size="sm" className="font-mono">
            {totalResultsCount} {isBn ? 'বিভাগ ফলাফল' : 'segments'}
          </Badge>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              leftIcon={<RotateCcw className="w-3 h-3" />}
              className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            >
              {isBn ? 'রিসেট' : 'Reset'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CategoryFilters;
