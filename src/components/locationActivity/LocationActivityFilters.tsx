import React from 'react';
import { Search, RotateCcw, Filter, Smartphone, ShieldCheck, Clock, Globe } from 'lucide-react';
import { LocationActivityFilters as FilterState } from '@/types/LocationActivity';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';

export interface LocationActivityFiltersProps {
  filters: FilterState;
  browserOptions?: string[];
  onChange: (newFilters: FilterState) => void;
  onReset: () => void;
  hasActiveFilters?: boolean;
}

export const LocationActivityFilters: React.FC<LocationActivityFiltersProps> = ({
  filters,
  browserOptions = [],
  onChange,
  onReset,
  hasActiveFilters = false,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...filters,
      search: e.target.value,
    });
  };

  const handlePermissionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...filters,
      permission: e.target.value as FilterState['permission'],
    });
  };

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...filters,
      device: e.target.value as FilterState['device'],
    });
  };

  const handleBrowserChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...filters,
      browser: e.target.value,
    });
  };

  const handleTimeRangeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...filters,
      timeRange: e.target.value as FilterState['timeRange'],
    });
  };

  return (
    <Card variant="default" className="shadow-xs">
      <CardContent className="p-3.5 sm:p-4 space-y-3">
        {/* Top: Search Input & Quick Info */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex-1 relative">
            <Input
              type="text"
              placeholder={
                isBn
                  ? 'ভিজিটর আইডি, সেশন আইডি, ব্রাউজার, ওএস বা টাইমজোন অনুসন্ধান...'
                  : 'Search by Visitor ID, Session ID, Browser, OS, Platform, Timezone...'
              }
              value={filters.search}
              onChange={handleSearchChange}
              leftIcon={<Search className="w-4 h-4 text-slate-400" />}
              className="h-9 text-xs"
            />
          </div>

          {hasActiveFilters && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onReset}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              className="text-xs h-9 shrink-0"
            >
              <span>{isBn ? 'ফিল্টার রিসেট' : 'Reset Filters'}</span>
            </Button>
          )}
        </div>

        {/* Dropdown Filters Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 border-t border-slate-100 dark:border-slate-800">
          {/* 1. Permission Status */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-slate-400" />
              <span>{isBn ? 'অনুমতি অবস্থা' : 'Permission'}</span>
            </label>
            <Select
              value={filters.permission}
              onChange={handlePermissionChange}
              className="h-8.5 text-xs"
            >
              <option value="all">{isBn ? 'সকল অবস্থা' : 'All Statuses'}</option>
              <option value="granted">{isBn ? 'অনুমোদিত' : 'Granted'}</option>
              <option value="denied">{isBn ? 'অনুমতি দেওয়া হয়নি' : 'Denied'}</option>
              <option value="prompt">{isBn ? 'এখন নয় (Prompt)' : 'Not Now (Prompt)'}</option>
              <option value="unavailable">{isBn ? 'অনুপলব্ধ' : 'Unavailable'}</option>
            </Select>
          </div>

          {/* 2. Device Category */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Smartphone className="w-3 h-3 text-slate-400" />
              <span>{isBn ? 'ডিভাইস' : 'Device'}</span>
            </label>
            <Select
              value={filters.device}
              onChange={handleDeviceChange}
              className="h-8.5 text-xs"
            >
              <option value="all">{isBn ? 'সকল ডিভাইস' : 'All Devices'}</option>
              <option value="desktop">{isBn ? 'ডেস্কটপ' : 'Desktop'}</option>
              <option value="mobile">{isBn ? 'মোবাইল' : 'Mobile'}</option>
              <option value="tablet">{isBn ? 'ট্যাবলেট' : 'Tablet'}</option>
              <option value="unknown">{isBn ? 'অজানা' : 'Unknown'}</option>
            </Select>
          </div>

          {/* 3. Browser */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Globe className="w-3 h-3 text-slate-400" />
              <span>{isBn ? 'ব্রাউজার' : 'Browser'}</span>
            </label>
            <Select
              value={filters.browser}
              onChange={handleBrowserChange}
              className="h-8.5 text-xs"
            >
              <option value="all">{isBn ? 'সকল ব্রাউজার' : 'All Browsers'}</option>
              {browserOptions.length > 0 ? (
                browserOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))
              ) : (
                <>
                  <option value="Chrome">Chrome</option>
                  <option value="Firefox">Firefox</option>
                  <option value="Safari">Safari</option>
                  <option value="Edge">Edge</option>
                  <option value="Opera">Opera</option>
                </>
              )}
            </Select>
          </div>

          {/* 4. Time Range */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>{isBn ? 'সময়কাল' : 'Time Range'}</span>
            </label>
            <Select
              value={filters.timeRange}
              onChange={handleTimeRangeChange}
              className="h-8.5 text-xs"
            >
              <option value="all">{isBn ? 'সর্বদা' : 'All Time'}</option>
              <option value="24h">{isBn ? 'বিগত ২৪ ঘণ্টা' : 'Last 24 Hours'}</option>
              <option value="7d">{isBn ? 'বিগত ৭ দিন' : 'Last 7 Days'}</option>
              <option value="30d">{isBn ? 'বিগত ৩০ দিন' : 'Last 30 Days'}</option>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LocationActivityFilters;
