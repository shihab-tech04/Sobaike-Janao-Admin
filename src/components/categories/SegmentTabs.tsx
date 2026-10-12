import React from 'react';
import { TaxonomySegmentNode } from '@/types/Category';
import { useLanguage } from '@/context/LanguageContext';
import { Badge } from '@/components/ui/Badge';
import { Layers, Folder } from 'lucide-react';
import { cn } from '@/utils';

export interface SegmentTabsProps {
  segments: TaxonomySegmentNode[];
  selectedSegmentId: string;
  onSelectSegment: (id: string) => void;
  totalItemsCount: number;
  className?: string;
}

export const SegmentTabs: React.FC<SegmentTabsProps> = ({
  segments,
  selectedSegmentId,
  onSelectSegment,
  totalItemsCount,
  className,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  return (
    <div
      className={cn(
        'flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800',
        className
      )}
    >
      {/* All Segments Tab */}
      <button
        type="button"
        id="segment-tab-all"
        onClick={() => onSelectSegment('all')}
        className={cn(
          'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer shrink-0 border',
          selectedSegmentId === 'all'
            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-transparent shadow-xs'
            : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/80 border-slate-200 dark:border-slate-800'
        )}
      >
        <Layers className="w-3.5 h-3.5" />
        <span>{isBn ? 'সকল বিভাগ' : 'All Segments'}</span>
        <Badge
          status="default"
          variant={selectedSegmentId === 'all' ? 'outline' : 'subtle'}
          size="sm"
          className={cn(
            'text-[10px] px-1.5 py-0 font-medium',
            selectedSegmentId === 'all'
              ? 'border-white/30 text-white dark:border-slate-800 dark:text-slate-900'
              : ''
          )}
        >
          {totalItemsCount}
        </Badge>
      </button>

      {/* Dynamic Segment Tabs from Supabase */}
      {segments.map((segment) => {
        const isSelected = selectedSegmentId === segment.id;
        const subCount = segment.subcategories?.length || 0;

        return (
          <button
            key={segment.id}
            type="button"
            id={`segment-tab-${segment.id}`}
            onClick={() => onSelectSegment(segment.id)}
            className={cn(
              'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer shrink-0 border',
              isSelected
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-transparent shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/80 border-slate-200 dark:border-slate-800'
            )}
          >
            <Folder className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{isBn ? segment.nameBn : segment.nameEn}</span>
            <Badge
              status="default"
              variant={isSelected ? 'outline' : 'subtle'}
              size="sm"
              className={cn(
                'text-[10px] px-1.5 py-0 font-medium',
                isSelected
                  ? 'border-white/30 text-white dark:border-slate-800 dark:text-slate-900'
                  : ''
              )}
            >
              {subCount}
            </Badge>
          </button>
        );
      })}
    </div>
  );
};

export default SegmentTabs;
