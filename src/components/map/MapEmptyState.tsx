import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { Button } from '@/components/ui/Button';
import { MapPinOff, RotateCcw, AlertTriangle, Layers } from 'lucide-react';
import { cn } from '@/utils';

export interface MapEmptyStateProps {
  type?: 'no-data' | 'no-coords' | 'no-match';
  unmappedCount?: number;
  onResetFilters?: () => void;
  className?: string;
}

export const MapEmptyState: React.FC<MapEmptyStateProps> = ({
  type = 'no-match',
  unmappedCount = 0,
  onResetFilters,
  className,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  let title = isBn ? 'কোনো অভিযোগের অবস্থান পাওয়া যায়নি' : 'No Mapped Complaints Found';
  let description = isBn
    ? 'ফিল্টারের মান পরিবর্তন করুন বা রিসেট করে ম্যাপে সব অভিযোগ পর্যবেক্ষণ করুন।'
    : 'Try adjusting or clearing your filters to view complaint markers on the map.';
  let icon = <MapPinOff className="w-6 h-6" />;

  if (type === 'no-data') {
    title = isBn ? 'ডাটাবেসে কোনো অভিযোগ নেই' : 'No Complaints in Database';
    description = isBn
      ? 'বর্তমানে সিস্টেমে কোনো অভিযোগ রেকর্ড করা নেই।'
      : 'There are currently no complaints recorded in the system.';
    icon = <Layers className="w-6 h-6" />;
  } else if (type === 'no-coords') {
    title = isBn ? 'স্থানাঙ্কযুক্ত কোনো অভিযোগ নেই' : 'No Geographic Coordinates Available';
    description = isBn
      ? `ডাটাবেসে ${unmappedCount}টি অভিযোগ রয়েছে, তবে কোনোটিতে বৈধ ভৌগোলিক স্থানাঙ্ক (Latitude / Longitude) উপস্থিত নেই।`
      : `Found ${unmappedCount} complaints in the database, but none contain valid geographic coordinates for mapping.`;
    icon = <AlertTriangle className="w-6 h-6 text-amber-500" />;
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-dashed border-slate-200 dark:border-slate-800',
        className
      )}
    >
      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-3">
        {icon}
      </div>

      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">
        {title}
      </h3>

      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4">
        {description}
      </p>

      {type === 'no-match' && onResetFilters && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onResetFilters}
          leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
        >
          {isBn ? 'ফিল্টার রিসেট করুন' : 'Reset Filters'}
        </Button>
      )}
    </div>
  );
};

export default MapEmptyState;
