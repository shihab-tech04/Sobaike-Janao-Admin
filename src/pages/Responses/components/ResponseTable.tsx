import React from 'react';
import { ResponseItem, ResponseStatus, ResponseType } from '@/types/Response';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { Eye } from 'lucide-react';

export interface ResponseTableProps {
  responses: ResponseItem[];
  onViewDetails: (response: ResponseItem) => void;
  isLoading?: boolean;
}

export const ResponseTable: React.FC<ResponseTableProps> = ({
  responses,
  onViewDetails,
  isLoading,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const getStatusBadge = (status: ResponseStatus) => {
    switch (status) {
      case 'pending_review':
        return (
          <Badge status="warning">
            {isBn ? 'পর্যালোচনা অপেক্ষমাণ' : 'Pending Review'}
          </Badge>
        );
      case 'published':
        return (
          <Badge status="success">
            {isBn ? 'প্রকাশিত' : 'Published'}
          </Badge>
        );
      case 'rejected':
        return (
          <Badge status="error">
            {isBn ? 'প্রত্যাখ্যাত' : 'Rejected'}
          </Badge>
        );
      case 'unpublished':
        return (
          <Badge status="default">
            {isBn ? 'অপ্রকাশিত' : 'Unpublished'}
          </Badge>
        );
      default:
        return (
          <Badge status="default">
            {status}
          </Badge>
        );
    }
  };

  const getTypeBadge = (type: ResponseType) => {
    if (type === 'citizen_information') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 border border-cyan-200/60 dark:border-cyan-800/40 whitespace-nowrap">
          {isBn ? 'তথ্য / অভিজ্ঞতা' : 'Information / Experience'}
        </span>
      );
    }
    if (type === 'subject_response') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/40 whitespace-nowrap">
          {isBn ? 'উল্লিখিত ব্যক্তি / পক্ষ' : 'Mentioned Person / Party'}
        </span>
      );
    }
    return <span>{type}</span>;
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse min-w-[760px]">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th scope="col" className="py-3 px-4 w-28">
                {isBn ? 'রেসপন্স আইডি' : 'Response ID'}
              </th>
              <th scope="col" className="py-3 px-4 w-28">
                {isBn ? 'রিপোর্ট আইডি' : 'Report ID'}
              </th>
              <th scope="col" className="py-3 px-4 w-44">
                {isBn ? 'ধরন' : 'Type'}
              </th>
              <th scope="col" className="py-3 px-4">
                {isBn ? 'প্রতিক্রিয়া' : 'Response'}
              </th>
              <th scope="col" className="py-3 px-4 w-36">
                {isBn ? 'স্ট্যাটাস' : 'Status'}
              </th>
              <th scope="col" className="py-3 px-4 w-32">
                {isBn ? 'জমা দেওয়া হয়েছে' : 'Submitted'}
              </th>
              <th scope="col" className="py-3 px-4 text-right w-24">
                {isBn ? 'পদক্ষেপ' : 'Action'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
            {responses.map((item) => (
              <tr
                key={item.id}
                className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
              >
                {/* Response ID */}
                <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  #{item.id}
                </td>

                {/* Report ID */}
                <td className="py-3.5 px-4 font-mono text-xs text-sky-600 dark:text-sky-400 font-medium whitespace-nowrap">
                  #{item.complaintId}
                </td>

                {/* Type */}
                <td className="py-3.5 px-4">{getTypeBadge(item.responseType)}</td>

                {/* Response preview */}
                <td className="py-3.5 px-4 max-w-xs md:max-w-md">
                  <p className="truncate text-slate-800 dark:text-slate-200 text-xs font-normal" title={item.content}>
                    {item.content || (
                      <span className="text-slate-400 italic">
                        {isBn ? 'কোনো বক্তব্য নেই' : 'No content'}
                      </span>
                    )}
                  </p>
                </td>

                {/* Status */}
                <td className="py-3.5 px-4">{getStatusBadge(item.status)}</td>

                {/* Submitted */}
                <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {formatDate(item.createdAt)}
                </td>

                {/* Action */}
                <td className="py-3.5 px-4 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewDetails(item)}
                    disabled={isLoading}
                    className="h-8 px-2.5 text-xs text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/40 font-medium"
                    aria-label={`${isBn ? 'দেখুন' : 'View'} #${item.id}`}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" />
                    <span>{isBn ? 'দেখুন' : 'View'}</span>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResponseTable;
