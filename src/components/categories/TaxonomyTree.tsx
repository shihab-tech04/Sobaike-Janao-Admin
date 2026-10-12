import React from 'react';
import {
  TaxonomySegment,
  TaxonomySubcategory,
  TaxonomySegmentNode,
} from '@/types/Category';
import { useLanguage } from '@/context/LanguageContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Folder,
  Tag,
  CheckCircle2,
  XCircle,
  Eye,
  ArrowUpDown,
  Layers,
} from 'lucide-react';
import { cn } from '@/utils';

export interface TaxonomyTreeProps {
  segments: TaxonomySegmentNode[];
  onInspectSegment: (segment: TaxonomySegmentNode) => void;
  onInspectSubcategory: (subcategory: TaxonomySubcategory, parentSegment: TaxonomySegment) => void;
  className?: string;
}

export const TaxonomyTree: React.FC<TaxonomyTreeProps> = ({
  segments,
  onInspectSegment,
  onInspectSubcategory,
  className,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  return (
    <div className={cn('space-y-4', className)}>
      {segments.map((segment) => {
        const subcategories = segment.subcategories || [];
        const hasSubcategories = subcategories.length > 0;

        return (
          <div
            key={segment.id}
            id={`taxonomy-segment-card-${segment.id}`}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs transition-shadow duration-150 hover:shadow-md"
          >
            {/* Segment Header Bar */}
            <div className="p-4 sm:p-5 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Folder className="w-5 h-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 break-words">
                      {isBn ? segment.nameBn : segment.nameEn}
                    </h3>
                    <span className="text-xs text-slate-400 font-medium">
                      ({isBn ? segment.nameEn : segment.nameBn})
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <Badge status="default" variant="outline" size="sm" className="font-mono text-[11px]">
                      {segment.id}
                    </Badge>
                    <Badge
                      status={segment.status === 'active' ? 'success' : 'default'}
                      variant="subtle"
                      size="sm"
                      className="text-[11px]"
                    >
                      {segment.status === 'active' ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {isBn ? 'সক্রিয়' : 'Active'}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          {isBn ? 'নিষ্ক্রিয়' : 'Inactive'}
                        </span>
                      )}
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                      <ArrowUpDown className="w-3 h-3" />
                      #{segment.order}
                    </span>
                  </div>
                </div>
              </div>

              {/* Segment Actions & Count */}
              <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200/60 dark:border-slate-800">
                <Badge status="default" variant="subtle" size="sm" className="text-xs font-semibold">
                  <Layers className="w-3 h-3 mr-1 text-slate-400" />
                  {subcategories.length} {isBn ? 'টি সাব-ক্যাটাগরি' : 'subcategories'}
                </Badge>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onInspectSegment(segment)}
                  leftIcon={<Eye className="w-3.5 h-3.5" />}
                  className="h-8 px-2.5 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  {isBn ? 'বিবরণ' : 'Details'}
                </Button>
              </div>
            </div>

            {/* Subcategories Container */}
            <div className="p-3 sm:p-4">
              {hasSubcategories ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800/80 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="py-2.5 px-3 font-semibold">
                          {isBn ? 'সাব-ক্যাটাগরি' : 'Subcategory'}
                        </th>
                        <th className="py-2.5 px-3 font-semibold">
                          {isBn ? 'শনাক্তকারী (ID)' : 'Identifier (ID)'}
                        </th>
                        <th className="py-2.5 px-3 font-semibold">
                          {isBn ? 'স্ট্যাটাস' : 'Status'}
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-center">
                          {isBn ? 'ক্রম' : 'Order'}
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-right">
                          {isBn ? 'অ্যাকশন' : 'Action'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {subcategories.map((sub) => (
                        <tr
                          key={sub.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                                <Tag className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                  {isBn ? sub.nameBn : sub.nameEn}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {isBn ? sub.nameEn : sub.nameBn}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-mono text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                              {sub.id}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <Badge
                              status={sub.status === 'active' ? 'success' : 'default'}
                              variant="subtle"
                              size="sm"
                              className="text-[10px]"
                            >
                              {sub.status === 'active' ? (
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {isBn ? 'সক্রিয়' : 'Active'}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <XCircle className="w-3 h-3" />
                                  {isBn ? 'নিষ্ক্রিয়' : 'Inactive'}
                                </span>
                              )}
                            </Badge>
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-slate-400 text-xs">
                            #{sub.order}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onInspectSubcategory(sub, segment)}
                              leftIcon={<Eye className="w-3 h-3" />}
                              className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                            >
                              {isBn ? 'বিবরণ' : 'Details'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 italic">
                  {isBn ? 'কোনো সাব-ক্যাটাগরি নেই।' : 'No subcategories.'}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TaxonomyTree;
