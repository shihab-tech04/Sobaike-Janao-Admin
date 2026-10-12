import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableLoadingRow,
} from '@/components/ui/Table';
import { Badge, BadgeStatus } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { Complaint, ComplaintLifecycleStatus } from '@/types/Complaint';
import { ComplaintEmptyState } from './ComplaintEmptyState';
import { Eye, MapPin, Calendar, Tag } from 'lucide-react';

export interface ComplaintTableProps {
  complaints: Complaint[];
  loading?: boolean;
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
  onRetry?: () => void;
}

export const ComplaintTable: React.FC<ComplaintTableProps> = ({
  complaints,
  loading = false,
  hasActiveFilters = false,
  onResetFilters,
  onRetry,
}) => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const statusBadgeMap: Record<
    ComplaintLifecycleStatus,
    { badgeStatus: BadgeStatus; labelEn: string; labelBn: string }
  > = {
    submitted: { badgeStatus: 'pending', labelEn: 'Submitted', labelBn: 'দাখিলকৃত' },
    published: { badgeStatus: 'published', labelEn: 'Published', labelBn: 'প্রকাশিত' },
    unpublished: { badgeStatus: 'default', labelEn: 'Unpublished', labelBn: 'অপ্রকাশিত' },
    rejected: { badgeStatus: 'rejected', labelEn: 'Rejected', labelBn: 'বাতিলকৃত' },
    edited: { badgeStatus: 'info', labelEn: 'Edited', labelBn: 'সম্পাদিত' },
  };

  const handleView = (id: string) => {
    navigate(`/complaints/${id}`);
  };

  // Format date helper
  const formatDate = (isoString: string): string => {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Loading Skeleton for Desktop Table
  if (loading) {
    return (
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">{isBn ? 'আইডি' : 'Complaint ID'}</TableHead>
              <TableHead>{isBn ? 'বিভাগ' : 'Category'}</TableHead>
              <TableHead>{isBn ? 'উপ-বিভাগ' : 'Subcategory'}</TableHead>
              <TableHead>{isBn ? 'অবস্থান' : 'Location'}</TableHead>
              <TableHead className="w-[130px]">{isBn ? 'জমার তারিখ' : 'Submitted Date'}</TableHead>
              <TableHead className="w-[120px]">{isBn ? 'স্ট্যাটাস' : 'Status'}</TableHead>
              <TableHead className="w-[90px] text-right">{isBn ? 'অ্যাকশন' : 'Action'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableLoadingRow colSpan={7} message={isBn ? 'অভিযোগ তালিকা লোড হচ্ছে...' : 'Loading complaints...'} />
          </TableBody>
        </Table>
      </div>
    );
  }

  // Empty State
  if (complaints.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8">
        <ComplaintEmptyState
          type={hasActiveFilters ? 'filtered_empty' : 'empty'}
          onResetFilters={onResetFilters}
          onRetry={onRetry}
        />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[125px] font-semibold">{isBn ? 'অভিযোগ আইডি' : 'Complaint ID'}</TableHead>
            <TableHead className="font-semibold">{isBn ? 'বিভাগ' : 'Category'}</TableHead>
            <TableHead className="font-semibold">{isBn ? 'উপ-বিভাগ ও বিবরণ' : 'Subcategory & Title'}</TableHead>
            <TableHead className="font-semibold">{isBn ? 'অবস্থান' : 'Location'}</TableHead>
            <TableHead className="w-[130px] font-semibold">{isBn ? 'জমার তারিখ' : 'Submitted Date'}</TableHead>
            <TableHead className="w-[125px] font-semibold">{isBn ? 'স্ট্যাটাস' : 'Status'}</TableHead>
            <TableHead className="w-[85px] text-right font-semibold">{isBn ? 'অ্যাকশন' : 'Action'}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {complaints.map((c) => {
            const statusCfg = statusBadgeMap[c.status] || {
              badgeStatus: 'default',
              labelEn: c.status,
              labelBn: c.status,
            };

            const category = isBn ? c.categoryBn : c.categoryEn;
            const subcategory = isBn ? c.subcategoryBn : c.subcategoryEn;
            const title = (isBn ? c.titleBn : c.titleEn) || c.titleEn || c.titleBn || c.id;
            const location = isBn ? c.location.addressBn : c.location.addressEn;

            return (
              <TableRow key={c.id} className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                {/* Complaint ID */}
                <TableCell className="font-mono font-bold text-sky-700 dark:text-sky-400 text-xs">
                  {c.id}
                </TableCell>

                {/* Category */}
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <Tag className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{category}</span>
                  </span>
                </TableCell>

                {/* Subcategory & Title preview */}
                <TableCell className="max-w-xs lg:max-w-md">
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100 line-clamp-1 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                      {title}
                    </p>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                      {subcategory}
                    </span>
                  </div>
                </TableCell>

                {/* Location */}
                <TableCell>
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 text-xs">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div className="truncate max-w-[160px]">
                      <span className="font-medium">{c.location.ward}</span>
                      <span className="text-[11px] text-slate-400 block truncate">{location}</span>
                    </div>
                  </div>
                </TableCell>

                {/* Submitted Date */}
                <TableCell className="text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>{formatDate(c.createdAt)}</span>
                  </div>
                </TableCell>

                {/* Status */}
                <TableCell>
                  <Badge status={statusCfg.badgeStatus} size="sm" dot>
                    {isBn ? statusCfg.labelBn : statusCfg.labelEn}
                  </Badge>
                </TableCell>

                {/* Action */}
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleView(c.id)}
                    className="h-7 px-2.5 text-xs text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400"
                    aria-label={`${isBn ? 'অভিযোগ দেখুন' : 'View complaint'} ${c.id}`}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" />
                    <span>{isBn ? 'দেখুন' : 'View'}</span>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default ComplaintTable;
