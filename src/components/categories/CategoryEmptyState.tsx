import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { Button } from '@/components/ui/Button';
import { Layers, RotateCcw } from 'lucide-react';
import { cn } from '@/utils';

export interface CategoryEmptyStateProps {
  isFiltered?: boolean;
  onResetFilters?: () => void;
  className?: string;
}

export const CategoryEmptyState: React.FC<CategoryEmptyStateProps> = ({
  isFiltered = false,
  onResetFilters,
  className,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs',
        className
      )}
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
        <Layers className="w-7 h-7" />
      </div>

      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
        {isFiltered
          ? isBn
            ? 'কোনো শ্রেণিবিন্যাস পাওয়া যায়নি'
            : 'No matching taxonomy items found'
          : isBn
          ? 'কোনো শ্রেণিবিন্যাস বিভাগ পাওয়া যায়নি'
          : 'No taxonomy segments found'}
      </h3>

      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">
        {isFiltered
          ? isBn
            ? 'আপনার বর্তমান ফিল্টারের সাথে মিলে এমন কোনো বিভাগ বা সাব-ক্যাটাগরি নেই।'
            : 'No segments or subcategories match your current filter criteria.'
          : isBn
          ? 'পাবলিক রিপোর্টিং ফ্লোর জন্য ডেটাবেজে কোনো শ্রেণিবিন্যাস রেকর্ড পাওয়া যায়নি।'
          : 'No segments or subcategories are currently configured in Supabase.'}
      </p>

      {isFiltered && onResetFilters && (
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

export default CategoryEmptyState;
