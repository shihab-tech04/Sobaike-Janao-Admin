import React from 'react';
import { MapPinOff, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';

export interface LocationActivityEmptyStateProps {
  hasFilters?: boolean;
  onResetFilters?: () => void;
}

export const LocationActivityEmptyState: React.FC<LocationActivityEmptyStateProps> = ({
  hasFilters = false,
  onResetFilters,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  return (
    <div className="py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-3">
        <MapPinOff className="w-6 h-6" />
      </div>

      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
        {hasFilters
          ? isBn
            ? 'কোনো সেশন পাওয়া যায়নি'
            : 'No matching sessions found'
          : isBn
          ? 'এখনও কোনো লোকেশন অ্যাক্টিভিটি রেকর্ড করা হয়নি।'
          : 'No location activity recorded yet.'}
      </h3>

      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
        {hasFilters
          ? isBn
            ? 'আপনার ফিল্টারের শর্ত পরিবর্তন করে আবার চেষ্টা করুন বা রিসেট করুন।'
            : 'Try adjusting your search criteria or clearing selected filters.'
          : isBn
          ? 'পাবলিক প্ল্যাটফর্ম থেকে ভিজিটরদের লোকেশন সেশন আসলে এখানে রিয়েল-টাইমে তালিকাভুক্ত হবে।'
          : 'When public visitors interact with the site, their sessions and consented location context will appear here.'}
      </p>

      {hasFilters && onResetFilters && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onResetFilters}
          leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
          className="text-xs"
        >
          <span>{isBn ? 'ফিল্টার রিসেট' : 'Reset Filters'}</span>
        </Button>
      )}
    </div>
  );
};

export default LocationActivityEmptyState;
