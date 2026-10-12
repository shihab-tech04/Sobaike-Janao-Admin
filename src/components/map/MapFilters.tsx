import React from 'react';
import {
  MapFilterState,
  MapSegmentOption,
  MapSubcategoryOption,
} from '@/types/Map';
import { ComplaintLifecycleStatus } from '@/types/Complaint';
import { useLanguage } from '@/context/LanguageContext';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  RotateCcw,
  SlidersHorizontal,
  X,
  MapPin,
  Folder,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { cn } from '@/utils';
import {
  HARASSMENT_AGE_GROUP_OPTIONS,
  HARASSMENT_ABUSER_RELATIONSHIP_OPTIONS,
  HARASSMENT_REPORTING_FOR_OPTIONS,
  getHarassmentAgeGroupLabel,
  getHarassmentRelationshipLabel,
  getHarassmentReportingForLabel,
} from '@/utils/harassmentClassification';

export interface MapFiltersProps {
  filters: MapFilterState;
  onChange: (filters: MapFilterState) => void;
  onReset: () => void;
  segments: MapSegmentOption[];
  subcategories: MapSubcategoryOption[];
  districts: string[];
  totalResultsCount: number;
  className?: string;
}

export const MapFilters: React.FC<MapFiltersProps> = ({
  filters,
  onChange,
  onReset,
  segments,
  subcategories,
  districts,
  totalResultsCount,
  className,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';
  const isHarassmentFilter = filters.segment === 'harassment';

  // Subcategories filtered by selected segment
  const filteredSubcategories =
    filters.segment && filters.segment !== 'all'
      ? subcategories.filter((sub) => sub.segmentId === filters.segment)
      : subcategories;

  // Active filters presence check
  const hasActiveFilters = Boolean(
    filters.searchQuery ||
      (filters.segment && filters.segment !== 'all') ||
      (filters.subcategory && filters.subcategory !== 'all') ||
      (filters.status && filters.status !== 'all') ||
      (filters.district && filters.district !== 'all') ||
      (filters.affectedPersonAgeGroup && filters.affectedPersonAgeGroup !== 'all') ||
      (filters.allegedAbuserRelationship && filters.allegedAbuserRelationship !== 'all') ||
      (filters.reportingFor && filters.reportingFor !== 'all') ||
      (filters.dateRange && filters.dateRange !== 'all')
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filters, searchQuery: e.target.value });
  };

  const handleSegmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...filters,
      segment: e.target.value,
      subcategory: 'all', // Reset subcategory when segment changes
      affectedPersonAgeGroup: 'all',
      allegedAbuserRelationship: 'all',
      reportingFor: 'all',
    });
  };

  const handleSubcategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...filters, subcategory: e.target.value });
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...filters,
      status: e.target.value as ComplaintLifecycleStatus | 'all',
    });
  };

  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...filters, district: e.target.value });
  };

  const handleDateRangeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...filters, dateRange: e.target.value });
  };

  // Status Labels Mapping
  const getStatusLabel = (status: ComplaintLifecycleStatus | 'all') => {
    switch (status) {
      case 'submitted':
        return isBn ? 'দাখিলকৃত' : 'Submitted';
      case 'published':
        return isBn ? 'প্রকাশিত' : 'Published';
      case 'unpublished':
        return isBn ? 'অপ্রকাশিত' : 'Unpublished';
      case 'rejected':
        return isBn ? 'বাতিলকৃত' : 'Rejected';
      case 'edited':
        return isBn ? 'সম্পাদিত' : 'Edited';
      default:
        return isBn ? 'সকল স্ট্যাটাস' : 'All Statuses';
    }
  };

  const getDateRangeLabel = (val: string) => {
    switch (val) {
      case 'today':
        return isBn ? 'আজকে' : 'Today';
      case 'week':
        return isBn ? 'গত ৭ দিন' : 'Past 7 Days';
      case 'month':
        return isBn ? 'গত ৩০ দিন' : 'Past 30 Days';
      default:
        return isBn ? 'সকল সময়' : 'All Time';
    }
  };

  const selectedSegmentObj = segments.find((s) => s.id === filters.segment);
  const selectedSubcategoryObj = subcategories.find(
    (s) => s.id === filters.subcategory
  );

  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3.5 shadow-xs',
        className
      )}
    >
      {/* Primary Row: Search & Dropdowns Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Search */}
        <div className="sm:col-span-2 lg:col-span-2">
          <Input
            id="map-search-input"
            value={filters.searchQuery}
            onChange={handleSearchChange}
            placeholder={
              isBn
                ? 'আইডি, শিরোনাম, জেলা বা ঠিকানা খুঁজুন...'
                : 'Search ID, title, district, address...'
            }
            isSearch
            onClear={() => onChange({ ...filters, searchQuery: '' })}
            className="h-9 text-xs"
          />
        </div>

        {/* Segment */}
        <div>
          <Select
            id="map-segment-select"
            value={filters.segment}
            onChange={handleSegmentChange}
            className="h-9 text-xs"
          >
            <option value="all">{isBn ? 'সকল খাত/বিভাগ' : 'All Segments'}</option>
            {segments.map((seg) => (
              <option key={seg.id} value={seg.id}>
                {isBn ? seg.nameBn : seg.nameEn}
              </option>
            ))}
          </Select>
        </div>

        {/* Subcategory */}
        <div>
          <Select
            id="map-subcategory-select"
            value={filters.subcategory}
            onChange={handleSubcategoryChange}
            disabled={!filters.segment || filters.segment === 'all'}
            className="h-9 text-xs"
          >
            <option value="all">
              {isBn ? 'সকল উপ-শ্রেণি' : 'All Subcategories'}
            </option>
            {filteredSubcategories.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {isBn ? sub.nameBn : sub.nameEn}
              </option>
            ))}
          </Select>
        </div>

        {/* Status */}
        <div>
          <Select
            id="map-status-select"
            value={filters.status}
            onChange={handleStatusChange}
            className="h-9 text-xs"
          >
            <option value="all">{isBn ? 'সকল স্ট্যাটাস' : 'All Statuses'}</option>
            <option value="submitted">{isBn ? 'দাখিলকৃত' : 'Submitted'}</option>
            <option value="published">{isBn ? 'প্রকাশিত' : 'Published'}</option>
            <option value="unpublished">
              {isBn ? 'অপ্রকাশিত' : 'Unpublished'}
            </option>
            <option value="rejected">{isBn ? 'বাতিলকৃত' : 'Rejected'}</option>
            <option value="edited">{isBn ? 'সম্পাদিত' : 'Edited'}</option>
          </Select>
        </div>


        {isHarassmentFilter && (
          <>
            <div>
              <Select id="map-harassment-age-select" value={filters.affectedPersonAgeGroup} onChange={(e) => onChange({ ...filters, affectedPersonAgeGroup: e.target.value })} className="h-9 text-xs">
                <option value="all">{isBn ? 'সকল বয়সের গ্রুপ' : 'All age groups'}</option>
                {HARASSMENT_AGE_GROUP_OPTIONS.map((item) => <option key={item.value} value={item.value}>{isBn ? item.labelBn : item.labelEn}</option>)}
              </Select>
            </div>
            <div>
              <Select id="map-harassment-relationship-select" value={filters.allegedAbuserRelationship} onChange={(e) => onChange({ ...filters, allegedAbuserRelationship: e.target.value })} className="h-9 text-xs">
                <option value="all">{isBn ? 'সকল সম্পর্ক' : 'All relationships'}</option>
                {HARASSMENT_ABUSER_RELATIONSHIP_OPTIONS.map((item) => <option key={item.value} value={item.value}>{isBn ? item.labelBn : item.labelEn}</option>)}
              </Select>
            </div>
            <div>
              <Select id="map-harassment-reporting-for-select" value={filters.reportingFor} onChange={(e) => onChange({ ...filters, reportingFor: e.target.value })} className="h-9 text-xs">
                <option value="all">{isBn ? 'কার জন্য: সকল' : 'Reporting for: all'}</option>
                {HARASSMENT_REPORTING_FOR_OPTIONS.map((item) => <option key={item.value} value={item.value}>{isBn ? item.labelBn : item.labelEn}</option>)}
              </Select>
            </div>
          </>
        )}

        {/* District */}
        <div>
          <Select
            id="map-district-select"
            value={filters.district}
            onChange={handleDistrictChange}
            className="h-9 text-xs"
          >
            <option value="all">{isBn ? 'সকল জেলা' : 'All Districts'}</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Secondary Bar: Active Filters Chips, Date Range, Results Count, Reset */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
        {/* Left: Active Chips */}
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{isBn ? 'ফিল্টার:' : 'Active:'}</span>
          </span>

          {!hasActiveFilters ? (
            <span className="text-slate-400 italic text-[11px]">
              {isBn
                ? 'কোনো ফিল্টার প্রয়োগ করা হয়নি (সকল পয়েন্ট দৃশ্যমান)'
                : 'Showing all mapped points'}
            </span>
          ) : (
            <>
              {filters.searchQuery && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                  <span>"{filters.searchQuery}"</span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...filters, searchQuery: '' })}
                    className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                    aria-label="Remove search filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {filters.segment && filters.segment !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                  <Folder className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {selectedSegmentObj
                      ? isBn
                        ? selectedSegmentObj.nameBn
                        : selectedSegmentObj.nameEn
                      : filters.segment}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
              ...filters,
              segment: 'all',
              subcategory: 'all',
              affectedPersonAgeGroup: 'all',
              allegedAbuserRelationship: 'all',
              reportingFor: 'all',
            })
                    }
                    className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                    aria-label="Remove segment filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {filters.subcategory && filters.subcategory !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                  <span>
                    {selectedSubcategoryObj
                      ? isBn
                        ? selectedSubcategoryObj.nameBn
                        : selectedSubcategoryObj.nameEn
                      : filters.subcategory}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...filters, subcategory: 'all' })}
                    className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                    aria-label="Remove subcategory filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}


              {isHarassmentFilter && filters.affectedPersonAgeGroup !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                  <span>{getHarassmentAgeGroupLabel(filters.affectedPersonAgeGroup, isBn ? 'bn' : 'en')}</span>
                  <button type="button" onClick={() => onChange({ ...filters, affectedPersonAgeGroup: 'all' })} className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer" aria-label="Remove map age group filter"><X className="w-3 h-3" /></button>
                </span>
              )}

              {isHarassmentFilter && filters.allegedAbuserRelationship !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                  <span>{getHarassmentRelationshipLabel(filters.allegedAbuserRelationship, isBn ? 'bn' : 'en')}</span>
                  <button type="button" onClick={() => onChange({ ...filters, allegedAbuserRelationship: 'all' })} className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer" aria-label="Remove map relationship filter"><X className="w-3 h-3" /></button>
                </span>
              )}

              {isHarassmentFilter && filters.reportingFor !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                  <span>{getHarassmentReportingForLabel(filters.reportingFor, isBn ? 'bn' : 'en')}</span>
                  <button type="button" onClick={() => onChange({ ...filters, reportingFor: 'all' })} className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer" aria-label="Remove map reporting-for filter"><X className="w-3 h-3" /></button>
                </span>
              )}

              {filters.status && filters.status !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                  <CheckCircle2 className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                  <span>{getStatusLabel(filters.status)}</span>
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

              {filters.district && filters.district !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                  <MapPin className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>{filters.district}</span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...filters, district: 'all' })}
                    className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                    aria-label="Remove district filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {filters.dateRange && filters.dateRange !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                  <Calendar className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                  <span>{getDateRangeLabel(filters.dateRange)}</span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...filters, dateRange: 'all' })}
                    className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                    aria-label="Remove date range filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </>
          )}
        </div>

        {/* Right: Date Range quick select & Results & Reset */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {/* Quick Date Range */}
          <div className="w-32">
            <Select
              id="map-date-range-select"
              value={filters.dateRange}
              onChange={handleDateRangeChange}
              className="h-7 text-xs py-0"
            >
              <option value="all">{isBn ? 'সকল সময়' : 'All Time'}</option>
              <option value="today">{isBn ? 'আজকে' : 'Today'}</option>
              <option value="week">{isBn ? 'গত ৭ দিন' : 'Past 7 Days'}</option>
              <option value="month">{isBn ? 'গত ৩০ দিন' : 'Past 30 Days'}</option>
            </Select>
          </div>

          <Badge variant="outline" size="sm" className="font-mono">
            {totalResultsCount} {isBn ? 'পয়েন্ট' : 'points'}
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

export default MapFilters;
