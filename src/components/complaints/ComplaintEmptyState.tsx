import React from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { AlertCircle, RotateCcw, SearchX } from 'lucide-react';

export interface ComplaintEmptyStateProps {
  type?: 'empty' | 'filtered_empty' | 'error';
  onResetFilters?: () => void;
  onRetry?: () => void;
}

export const ComplaintEmptyState: React.FC<ComplaintEmptyStateProps> = ({
  type = 'empty',
  onResetFilters,
  onRetry,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  if (type === 'error') {
    return (
      <EmptyState
        title={isBn ? 'অভিযোগ লোড করতে সমস্যা হয়েছে' : 'Failed to Load Complaints'}
        description={
          isBn
            ? 'সার্ভার থেকে অভিযোগের তালিকা আনা সম্ভব হয়নি। অনুগ্রহ করে পুনরায় চেষ্টা করুন।'
            : 'Unable to retrieve the complaint list from the server. Please verify network connectivity.'
        }
        icon={AlertCircle}
        action={
          onRetry && (
            <Button
              variant="primary"
              size="sm"
              onClick={onRetry}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              <span>{isBn ? 'পুনরায় চেষ্টা করুন' : 'Retry Request'}</span>
            </Button>
          )
        }
      />
    );
  }

  if (type === 'filtered_empty') {
    return (
      <EmptyState
        title={isBn ? 'ফিল্টারের সাথে কোনো অভিযোগ মেলেনি' : 'No Matching Complaints Found'}
        description={
          isBn
            ? 'আপনার নির্বাচিত অনুসন্ধান বা ফিল্টারের সাথে মিলে এমন কোনো অভিযোগ পাওয়া যায়নি।'
            : 'No citizen complaints match your search query or active filter criteria.'
        }
        icon={SearchX}
        action={
          onResetFilters && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onResetFilters}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              <span>{isBn ? 'সকল ফিল্টার মুছুন' : 'Clear All Filters'}</span>
            </Button>
          )
        }
      />
    );
  }

  return (
    <EmptyState
      title={isBn ? 'কোন অভিযোগ জমা নেই' : 'No Complaints in This Category'}
      description={
        isBn
          ? 'এই স্ট্যাটাসে বর্তমানে কোনো নাগরিক অভিযোগ নেই।'
          : 'There are currently no complaints in this queue.'
      }
      icon={AlertCircle}
    />
  );
};

export default ComplaintEmptyState;
