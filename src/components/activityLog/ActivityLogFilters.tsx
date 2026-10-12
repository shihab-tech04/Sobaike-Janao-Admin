import React from 'react';
import { Search, Filter, X, Calendar } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export interface ActivityLogFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  action: string;
  onActionChange: (value: string) => void;
  targetType: string;
  onTargetTypeChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export const ActivityLogFilters: React.FC<ActivityLogFiltersProps> = ({
  search,
  onSearchChange,
  action,
  onActionChange,
  targetType,
  onTargetTypeChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onClearFilters,
  hasActiveFilters,
}) => {
  const { t, language } = useLanguage();

  return (
    <div
      id="activity-log-filters"
      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="activity-search-input"
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={
              language === 'bn'
                ? 'টার্গেট আইডি, পদবী বা নাম অনুসন্ধান...'
                : 'Search target ID, action, actor...'
            }
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
          />
        </div>

        {/* Action Type Dropdown */}
        <div>
          <select
            id="activity-action-select"
            value={action}
            onChange={(e) => onActionChange(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
          >
            <option value="all">{language === 'bn' ? 'সকল কার্যক্রম' : 'All Actions'}</option>
            <optgroup label={language === 'bn' ? 'অভিযোগ কার্যক্রম' : 'Complaint Actions'}>
              <option value="complaint.publish">
                {language === 'bn' ? 'অভিযোগ প্রকাশিত' : 'Complaint Published'}
              </option>
              <option value="complaint.unpublish">
                {language === 'bn' ? 'অভিযোগ অপ্রকাশিত' : 'Complaint Unpublished'}
              </option>
              <option value="complaint.reject">
                {language === 'bn' ? 'অভিযোগ বাতিল' : 'Complaint Rejected'}
              </option>
            </optgroup>
            <optgroup label={language === 'bn' ? 'প্রশাসক কার্যক্রম' : 'Administrator Actions'}>
              <option value="USER_MEMBERSHIP_FINALIZED">
                {language === 'bn' ? 'সদস্যপদ চূড়ান্তকরণ' : 'User Membership Finalized'}
              </option>
              <option value="ADMIN_USER_UPDATED">
                {language === 'bn' ? 'প্রশাসক তথ্য আপডেট' : 'Admin User Updated'}
              </option>
            </optgroup>
            <optgroup label={language === 'bn' ? 'ভূমিকা (RBAC) কার্যক্রম' : 'Role Actions'}>
              <option value="ROLE_CREATED">
                {language === 'bn' ? 'ভূমিকা তৈরি' : 'Role Created'}
              </option>
              <option value="ROLE_UPDATED">
                {language === 'bn' ? 'ভূমিকা আপডেট' : 'Role Updated'}
              </option>
              <option value="ROLE_PERMISSIONS_REPLACED">
                {language === 'bn' ? 'অনুমতি প্রতিস্থাপন' : 'Role Permissions Replaced'}
              </option>
            </optgroup>
          </select>
        </div>

        {/* Target Type Dropdown */}
        <div>
          <select
            id="activity-target-type-select"
            value={targetType}
            onChange={(e) => onTargetTypeChange(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
          >
            <option value="all">{language === 'bn' ? 'সকল টার্গেট ধরন' : 'All Target Types'}</option>
            <option value="complaint">{language === 'bn' ? 'অভিযোগ (Complaint)' : 'Complaint'}</option>
            <option value="admin_user">{language === 'bn' ? 'প্রশাসক (Administrator)' : 'Administrator'}</option>
            <option value="role">{language === 'bn' ? 'ভূমিকা (Role)' : 'Role'}</option>
          </select>
        </div>

        {/* Date Filter & Clear Controls */}
        <div className="flex flex-wrap 2xl:flex-nowrap items-center gap-2 min-w-0">
          <div className="relative flex-1 min-w-[120px]">
            <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="activity-date-from-input"
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="w-full pl-8 pr-2 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
              title={language === 'bn' ? 'তারিখ হতে' : 'From Date'}
            />
          </div>

          <div className="relative flex-1 min-w-[120px]">
            <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="activity-date-to-input"
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="w-full pl-8 pr-2 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
              title={language === 'bn' ? 'তারিখ পর্যন্ত' : 'To Date'}
            />
          </div>

          {hasActiveFilters && (
            <button
              id="btn-clear-activity-filters"
              type="button"
              onClick={onClearFilters}
              className="px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg shrink-0 flex items-center gap-1 transition-colors min-h-[38px]"
              title={language === 'bn' ? 'ফিল্টার রিসেট করুন' : 'Clear filters'}
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline xl:hidden 2xl:inline">{language === 'bn' ? 'রিসেট' : 'Clear'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
