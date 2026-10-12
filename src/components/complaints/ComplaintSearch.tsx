import React from 'react';
import { Input } from '@/components/ui/Input';
import { useLanguage } from '@/context/LanguageContext';
import { Loader2 } from 'lucide-react';

export interface ComplaintSearchProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  isLoading?: boolean;
  className?: string;
}

export const ComplaintSearch: React.FC<ComplaintSearchProps> = ({
  value,
  onChange,
  onClear,
  isLoading = false,
  className,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  return (
    <div className="relative w-full">
      <Input
        type="text"
        isSearch
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClear={onClear}
        placeholder={
          isBn
            ? 'অভিযোগ আইডি (উদাঃ CMP-10492), কীওয়ার্ড, বা বিভাগ দিয়ে খুঁজুন...'
            : 'Search by Complaint ID (e.g. CMP-10492), keyword, ward, or topic...'
        }
        rightIcon={
          isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-sky-600 dark:text-sky-400" />
          ) : undefined
        }
        className={className}
        aria-label={isBn ? 'অভিযোগ অনুসন্ধান' : 'Search Complaints'}
      />
    </div>
  );
};

export default ComplaintSearch;
