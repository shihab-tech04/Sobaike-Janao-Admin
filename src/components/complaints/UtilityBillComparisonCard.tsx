import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { useLanguage } from '@/context/LanguageContext';
import { Complaint } from '@/types/Complaint';
import { Receipt, Calendar, CreditCard } from 'lucide-react';
import { cn } from '@/utils';

export interface UtilityBillComparisonCardProps {
  complaint: Complaint;
  className?: string;
}

const BN_MONTHS: Record<string, string> = {
  '01': 'জানুয়ারি',
  '02': 'ফেব্রুয়ারি',
  '03': 'মার্চ',
  '04': 'এপ্রিল',
  '05': 'মে',
  '06': 'জুন',
  '07': 'জুলাই',
  '08': 'আগস্ট',
  '09': 'সেপ্টেম্বর',
  '10': 'অক্টোবর',
  '11': 'নভেম্বর',
  '12': 'ডিসেম্বর',
};

const EN_MONTHS: Record<string, string> = {
  '01': 'January',
  '02': 'February',
  '03': 'March',
  '04': 'April',
  '05': 'May',
  '06': 'June',
  '07': 'July',
  '08': 'August',
  '09': 'September',
  '10': 'October',
  '11': 'November',
  '12': 'December',
};

function toBengaliNumerals(input: string | number): string {
  const str = String(input);
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return str
    .split('')
    .map((char) => (/[0-9]/.test(char) ? bnDigits[parseInt(char, 10)] : char))
    .join('');
}

function formatBillMonth(monthStr: string | null | undefined, isBn: boolean): string {
  if (!monthStr || !monthStr.trim()) {
    return isBn ? 'তথ্য নেই' : 'Not provided';
  }
  const match = monthStr.trim().match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const [, year, month] = match;
    const monthName = isBn
      ? BN_MONTHS[month] || month
      : EN_MONTHS[month] || month;
    const yearDisplay = isBn ? toBengaliNumerals(year) : year;
    return `${monthName} ${yearDisplay}`;
  }
  return isBn ? toBengaliNumerals(monthStr) : monthStr;
}

function formatCurrency(amount: number | null | undefined, isBn: boolean): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return isBn ? 'তথ্য নেই' : 'N/A';
  }
  const formatted = amount.toLocaleString('en-US');
  if (isBn) {
    return `৳ ${toBengaliNumerals(formatted)}`;
  }
  return `৳${formatted}`;
}

export const UtilityBillComparisonCard: React.FC<UtilityBillComparisonCardProps> = ({
  complaint,
  className,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const isUtility = complaint.categoryId === 'load_shedding';
  const isExcessElectricityBill =
    isUtility && complaint.subcategoryId === 'excess-electricity-bill';

  // Only render for Excess Electricity Bill complaints
  if (!isExcessElectricityBill) {
    return null;
  }

  const recentMonth = complaint.recentBillMonth;
  const recentAmount = complaint.recentBillAmount;
  const previousMonth = complaint.previousBillMonth;
  const previousAmount = complaint.previousBillAmount;

  return (
    <Card
      variant="default"
      className={cn(
        'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',
        className
      )}
    >
      <CardHeader className="bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <Receipt className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span>
            {isBn ? 'বিদ্যুৎ বিলের বিবরণ' : 'Electricity Bill Information'}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* 1. Recent Bill Section */}
          <div className="p-4 rounded-lg bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/50 space-y-3">
            <div className="flex items-center gap-2 border-b border-amber-200/50 dark:border-amber-900/40 pb-2">
              <Receipt className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h4 className="text-sm font-bold text-amber-950 dark:text-amber-200">
                {isBn ? 'সাম্প্রতিক বিল' : 'Recent Bill'}
              </h4>
            </div>

            <div className="space-y-2">
              {/* Recent Bill Month */}
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {isBn ? 'সাম্প্রতিক বিলের মাস' : 'Recent Bill Month'}
                </span>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {formatBillMonth(recentMonth, isBn)}
                </p>
              </div>

              {/* Recent Bill Amount */}
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  {isBn ? 'সাম্প্রতিক বিলের পরিমাণ' : 'Recent Bill Amount'}
                </span>
                <p className="text-base font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                  {formatCurrency(recentAmount, isBn)}
                </p>
              </div>
            </div>
          </div>

          {/* 2. Previous Bill Section */}
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-2">
              <Receipt className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {isBn ? 'আগের বিল' : 'Previous Bill'}
              </h4>
            </div>

            <div className="space-y-2">
              {/* Previous Bill Month */}
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {isBn ? 'আগের বিলের মাস' : 'Previous Bill Month'}
                </span>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {formatBillMonth(previousMonth, isBn)}
                </p>
              </div>

              {/* Previous Bill Amount */}
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  {isBn ? 'আগের বিলের পরিমাণ' : 'Previous Bill Amount'}
                </span>
                <p className="text-base font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                  {formatCurrency(previousAmount, isBn)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default UtilityBillComparisonCard;
