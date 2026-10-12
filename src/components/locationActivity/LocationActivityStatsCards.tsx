import React from 'react';
import { Card } from '@/components/ui/Card';
import { useLanguage } from '@/context/LanguageContext';
import { LocationActivityStats } from '@/types/LocationActivity';
import {
  Users,
  MapPin,
  XCircle,
  Clock,
  Radio,
} from 'lucide-react';

export interface LocationActivityStatsCardsProps {
  stats: LocationActivityStats | null;
  isLoading?: boolean;
}

export const LocationActivityStatsCards: React.FC<LocationActivityStatsCardsProps> = ({
  stats,
  isLoading = false,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const formatCount = (num: number): string => {
    if (isBn) {
      return num.toLocaleString('bn-BD');
    }
    return num.toLocaleString('en-US');
  };

  const total = stats?.totalSessions ?? 0;
  const granted = stats?.grantedCount ?? 0;
  const denied = stats?.deniedCount ?? 0;
  const prompt = stats?.promptCount ?? 0;
  const recent = stats?.recentSessionsCount ?? 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5">
      {/* 1. Total Sessions */}
      <Card variant="default" className="p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
            {isBn ? 'মোট সেশন' : 'Total Sessions'}
          </span>
          <div className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 shrink-0">
            <Users className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          {isLoading ? (
            <div className="h-6 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          ) : (
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {formatCount(total)}
            </p>
          )}
        </div>
      </Card>

      {/* 2. Granted Location */}
      <Card variant="default" className="p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 truncate">
            {isBn ? 'অনুমোদিত লোকেশন' : 'Granted Location'}
          </span>
          <div className="w-7 h-7 rounded-md bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-100 dark:border-emerald-900/40">
            <MapPin className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          {isLoading ? (
            <div className="h-6 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          ) : (
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {formatCount(granted)}
            </p>
          )}
        </div>
      </Card>

      {/* 3. Denied */}
      <Card variant="default" className="p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400 truncate">
            {isBn ? 'অনুমতি দেওয়া হয়নি' : 'Denied'}
          </span>
          <div className="w-7 h-7 rounded-md bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0 border border-rose-100 dark:border-rose-900/40">
            <XCircle className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          {isLoading ? (
            <div className="h-6 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          ) : (
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {formatCount(denied)}
            </p>
          )}
        </div>
      </Card>

      {/* 4. Not Now / Prompt */}
      <Card variant="default" className="p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 truncate">
            {isBn ? 'এখন নয়' : 'Not Now'}
          </span>
          <div className="w-7 h-7 rounded-md bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 border border-amber-100 dark:border-amber-900/40">
            <Clock className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          {isLoading ? (
            <div className="h-6 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          ) : (
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {formatCount(prompt)}
            </p>
          )}
        </div>
      </Card>

      {/* 5. Recent Sessions (last 15m) */}
      <Card variant="default" className="p-3.5 col-span-2 sm:col-span-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400 truncate">
            {isBn ? 'সাম্প্রতিক সেশন' : 'Recent Sessions'}
          </span>
          <div className="w-7 h-7 rounded-md bg-sky-50 dark:bg-sky-950/60 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0 border border-sky-100 dark:border-sky-900/40">
            <Radio className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          {isLoading ? (
            <div className="h-6 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {formatCount(recent)}
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default LocationActivityStatsCards;
