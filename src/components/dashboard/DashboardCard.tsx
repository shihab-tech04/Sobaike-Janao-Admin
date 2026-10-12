import React from 'react';
import { Card } from '@/components/ui/Card';
import { useLanguage } from '@/context/LanguageContext';
import {
  FileText,
  Clock,
  CheckCircle2,
  EyeOff,
  XCircle,
  LucideIcon,
} from 'lucide-react';
import { DashboardStats } from '@/types/Dashboard';
import { cn } from '@/utils';

export interface DashboardStatCardItemProps {
  titleEn: string;
  titleBn: string;
  value: number;
  icon: LucideIcon;
  subtextEn: string;
  subtextBn: string;
  iconBgClass: string;
  iconColorClass: string;
}

export const StatCard: React.FC<DashboardStatCardItemProps> = ({
  titleEn,
  titleBn,
  value,
  icon: Icon,
  subtextEn,
  subtextBn,
  iconBgClass,
  iconColorClass,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  // Convert number to Bengali numerals if language is Bangla
  const formatNumber = (num: number): string => {
    if (!isBn) return num.toLocaleString();
    const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return num
      .toLocaleString()
      .split('')
      .map((d) => (/[0-9]/.test(d) ? bnDigits[parseInt(d, 10)] : d))
      .join('');
  };

  return (
    <Card
      variant="default"
      padding="sm"
      className="relative overflow-hidden transition-all duration-150 hover:shadow-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isBn ? titleBn : titleEn}
          </p>
          <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono">
            {formatNumber(value)}
          </div>
        </div>
        <div
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
            iconBgClass,
            iconColorClass
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400 dark:text-slate-500">
        <span className="truncate block">
          {isBn ? subtextBn : subtextEn}
        </span>
      </div>
    </Card>
  );
};

export interface DashboardCardsGridProps {
  stats: DashboardStats | null;
  loading?: boolean;
}

export const DashboardCardsGrid: React.FC<DashboardCardsGridProps> = ({ stats, loading }) => {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-24 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/40 animate-pulse p-4 flex flex-col justify-between"
          >
            <div className="flex justify-between items-center">
              <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700" />
            </div>
            <div className="h-6 w-14 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const cardsData: DashboardStatCardItemProps[] = [
    {
      titleEn: 'Total Reports',
      titleBn: 'মোট প্রতিবেদন',
      value: stats.totalComplaints,
      icon: FileText,
      subtextEn: 'All registered reports',
      subtextBn: 'নিবন্ধিত সকল প্রতিবেদন',
      iconBgClass: 'bg-sky-50 dark:bg-sky-950/60',
      iconColorClass: 'text-sky-600 dark:text-sky-400',
    },
    {
      titleEn: 'Submitted',
      titleBn: 'জমা পড়েছে',
      value: stats.submitted,
      icon: Clock,
      subtextEn: 'Awaiting moderation',
      subtextBn: 'মডারেশন অপেক্ষমান',
      iconBgClass: 'bg-amber-50 dark:bg-amber-950/60',
      iconColorClass: 'text-amber-600 dark:text-amber-400',
    },
    {
      titleEn: 'Published',
      titleBn: 'প্রকাশিত',
      value: stats.published,
      icon: CheckCircle2,
      subtextEn: 'Visible publicly',
      subtextBn: 'পাবলিক সাইটে দৃশ্যমান',
      iconBgClass: 'bg-emerald-50 dark:bg-emerald-950/60',
      iconColorClass: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      titleEn: 'Unpublished',
      titleBn: 'অপ্রকাশিত',
      value: stats.unpublished,
      icon: EyeOff,
      subtextEn: 'Removed from public view',
      subtextBn: 'পাবলিক ভিউ থেকে সরানো',
      iconBgClass: 'bg-slate-100 dark:bg-slate-800',
      iconColorClass: 'text-slate-600 dark:text-slate-400',
    },
    {
      titleEn: 'Rejected',
      titleBn: 'প্রত্যাখ্যাত',
      value: stats.rejected,
      icon: XCircle,
      subtextEn: 'Not approved for publication',
      subtextBn: 'প্রকাশের জন্য অনুমোদিত নয়',
      iconBgClass: 'bg-rose-50 dark:bg-rose-950/60',
      iconColorClass: 'text-rose-600 dark:text-rose-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {cardsData.map((card, idx) => (
        <StatCard key={idx} {...card} />
      ))}
    </div>
  );
};

export default DashboardCardsGrid;
