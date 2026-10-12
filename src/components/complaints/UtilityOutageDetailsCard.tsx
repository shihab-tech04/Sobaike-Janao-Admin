import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { useLanguage } from '@/context/LanguageContext';
import { Complaint } from '@/types/Complaint';
import { Zap, Flame, Clock, Calendar } from 'lucide-react';
import { cn } from '@/utils';

export interface UtilityOutageDetailsCardProps {
  complaint: Complaint;
  className?: string;
}

function toBengaliNumerals(input: string | number): string {
  const str = String(input);
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return str
    .split('')
    .map((char) => (/[0-9]/.test(char) ? bnDigits[parseInt(char, 10)] : char))
    .join('');
}

function formatIncidentTime(timeStr: string | null | undefined, isBn: boolean): string {
  if (!timeStr || !timeStr.trim()) {
    return isBn ? 'তথ্য নেই' : 'Not specified';
  }
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = hours >= 12 ? (isBn ? 'অপরাহ্ন' : 'PM') : (isBn ? 'পূর্বাহ্ন' : 'AM');
    const displayHours = hours % 12 || 12;
    const timeFormatted = `${displayHours}:${minutes} ${period}`;
    return isBn ? toBengaliNumerals(timeFormatted) : timeFormatted;
  }
  return isBn ? toBengaliNumerals(timeStr) : timeStr;
}

function formatIncidentDate(dateStr: string | null | undefined, isBn: boolean): string {
  if (!dateStr || !dateStr.trim()) {
    return isBn ? 'তথ্য নেই' : 'Not specified';
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return isBn ? toBengaliNumerals(dateStr) : dateStr;
  }
  return d.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export const UtilityOutageDetailsCard: React.FC<UtilityOutageDetailsCardProps> = ({
  complaint,
  className,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const isUtility = complaint.categoryId === 'load_shedding';
  const isLoadShedding =
    isUtility && complaint.subcategoryId === 'load-shedding-outage';
  const isGasShortage =
    isUtility && complaint.subcategoryId === 'gas-shortage';

  // Only render for Load Shedding or Gas Shortage utility complaints
  if (!isLoadShedding && !isGasShortage) {
    return null;
  }

  const typeLabel = isGasShortage
    ? isBn
      ? 'গ্যাস সংকট'
      : 'Gas Shortage'
    : isBn
    ? 'লোডশেডিং'
    : 'Load Shedding';

  const hasEndTime = Boolean(complaint.utilityEndTime && complaint.utilityEndTime.trim());

  return (
    <Card
      variant="default"
      className={cn(
        'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',
        className
      )}
    >
      <CardHeader className="bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
            <div
              className={cn(
                'w-6 h-6 rounded-md flex items-center justify-center',
                isGasShortage
                  ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                  : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
              )}
            >
              {isGasShortage ? (
                <Flame className="w-3.5 h-3.5" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
            </div>
            <span>{typeLabel}</span>
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        <div
          className={cn(
            'grid grid-cols-1 gap-3',
            hasEndTime ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
          )}
        >
          {/* Incident Date */}
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {isBn ? 'ঘটনার তারিখ' : 'Incident Date'}
            </span>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {formatIncidentDate(complaint.incidentDate, isBn)}
            </p>
          </div>

          {/* Start Time */}
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {isBn ? 'শুরুর সময়' : 'Start Time'}
            </span>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {formatIncidentTime(complaint.incidentTime, isBn)}
            </p>
          </div>

          {/* End Time (only if available) */}
          {hasEndTime && (
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {isBn ? 'শেষের সময়' : 'End Time'}
              </span>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatIncidentTime(complaint.utilityEndTime, isBn)}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default UtilityOutageDetailsCard;
