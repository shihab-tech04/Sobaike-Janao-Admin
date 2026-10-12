import React from 'react';
import { MapSummary } from '@/types/Map';
import { useLanguage } from '@/context/LanguageContext';
import { Card } from '@/components/ui/Card';
import {
  MapPin,
  Layers,
  AlertCircle,
  CheckCircle2,
  Navigation,
} from 'lucide-react';
import { cn } from '@/utils';

export interface LocationSummaryProps {
  summary: MapSummary | null;
  loading?: boolean;
  className?: string;
}

export const LocationSummary: React.FC<LocationSummaryProps> = ({
  summary,
  loading = false,
  className,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  if (loading || !summary) {
    return (
      <div className={cn('grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3', className)}>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} variant="default" padding="none" className="animate-pulse">
            <div className="p-3.5 space-y-2">
              <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
              <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3', className)}>
      {/* 1. Mapped Complaints */}
      <Card
        variant="default"
        padding="none"
        className="border border-slate-200/80 dark:border-slate-800/80 shadow-2xs"
      >
        <div className="p-3.5 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
              {isBn ? 'ম্যাপে থাকা অভিযোগ' : 'Mapped Complaints'}
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono">
                {summary.mappedCount}
              </span>
              <span className="text-[11px] text-slate-400">
                {isBn ? 'টি' : 'items'}
              </span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
        </div>
      </Card>

      {/* 2. Submitted */}
      <Card
        variant="default"
        padding="none"
        className="border border-slate-200/80 dark:border-slate-800/80 shadow-2xs"
      >
        <div className="p-3.5 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
              {isBn ? 'দাখিলকৃত' : 'Submitted'}
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-bold text-amber-600 dark:text-amber-400 font-mono">
                {summary.submittedCount}
              </span>
              <span className="text-[11px] text-slate-400">
                / {summary.mappedCount}
              </span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 shrink-0">
            <AlertCircle className="w-4 h-4" />
          </div>
        </div>
      </Card>

      {/* 3. Published */}
      <Card
        variant="default"
        padding="none"
        className="border border-slate-200/80 dark:border-slate-800/80 shadow-2xs"
      >
        <div className="p-3.5 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
              {isBn ? 'প্রকাশিত' : 'Published'}
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-bold text-sky-600 dark:text-sky-400 font-mono">
                {summary.publishedCount}
              </span>
              <span className="text-[11px] text-slate-400">
                / {summary.mappedCount}
              </span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
      </Card>

      {/* 4. Districts */}
      <Card
        variant="default"
        padding="none"
        className="border border-slate-200/80 dark:border-slate-800/80 shadow-2xs"
      >
        <div className="p-3.5 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
              {isBn ? 'জেলা' : 'Districts'}
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono">
                {summary.districtsCount}
              </span>
              <span className="text-[11px] text-slate-400">
                {isBn ? 'টি জেলা' : 'areas'}
              </span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Navigation className="w-4 h-4" />
          </div>
        </div>
      </Card>
    </div>
  );
};

export default LocationSummary;
