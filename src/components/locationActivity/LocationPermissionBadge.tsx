import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { LocationPermissionStatus } from '@/types/LocationActivity';
import { CheckCircle2, XCircle, AlertCircle, HelpCircle } from 'lucide-react';
import { cn } from '@/utils';

export interface LocationPermissionBadgeProps {
  status: LocationPermissionStatus;
  className?: string;
}

export const LocationPermissionBadge: React.FC<LocationPermissionBadgeProps> = ({
  status,
  className,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const normalized = (status || '').toLowerCase().trim();

  switch (normalized) {
    case 'granted':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
            className
          )}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>{isBn ? 'অনুমোদিত' : 'Granted'}</span>
        </span>
      );

    case 'denied':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60',
            className
          )}
        >
          <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          <span>{isBn ? 'অনুমতি দেওয়া হয়নি' : 'Denied'}</span>
        </span>
      );

    case 'prompt':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
            className
          )}
        >
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>{isBn ? 'এখন নয়' : 'Not Now'}</span>
        </span>
      );

    case 'unavailable':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700',
            className
          )}
        >
          <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
          <span>{isBn ? 'অনুপলব্ধ' : 'Unavailable'}</span>
        </span>
      );

    default:
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
            className
          )}
        >
          <span className="capitalize">{status || '—'}</span>
        </span>
      );
  }
};

export default LocationPermissionBadge;
