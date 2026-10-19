import React, { useState } from 'react';
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
import { Drawer } from '@/components/ui/Drawer';
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
  sortBy?: 'created_at' | 'status' | 'segment_id';
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: 'created_at' | 'status' | 'segment_id') => void;
}

export const ComplaintTable: React.FC<ComplaintTableProps> = ({
  complaints,
  loading = false,
  hasActiveFilters = false,
  onResetFilters,
  onRetry,
  sortBy,
  sortDirection,
  onSort,
}) => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isBn = language === 'bn';
  const [selected, setSelected] = useState<Complaint | null>(null);

  const originLabel = (origin: Complaint['postedBy']) => origin === 'admin'
    ? (isBn ? 'অ্যাডমিন' : 'Admin')
    : origin === 'user'
    ? (isBn ? 'ব্যবহারকারী' : 'User')
    : (isBn ? 'অনির্ধারিত' : 'Unverified');

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
              <TableHead>{isBn ? 'পোস্ট করেছেন' : 'Posted by'}</TableHead>
              <TableHead className="w-[120px]">{isBn ? 'স্ট্যাটাস' : 'Status'}</TableHead>
              <TableHead className="w-[90px] text-right">{isBn ? 'অ্যাকশন' : 'Action'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableLoadingRow colSpan={8} message={isBn ? 'অভিযোগ তালিকা লোড হচ্ছে...' : 'Loading complaints...'} />
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
            <TableHead className="font-semibold" sortable={Boolean(onSort)}
              sortDirection={sortBy === 'segment_id' ? sortDirection : null}
              onSort={() => onSort?.('segment_id')}>{isBn ? 'বিভাগ' : 'Category'}</TableHead>
            <TableHead className="font-semibold">{isBn ? 'উপ-বিভাগ ও বিবরণ' : 'Subcategory & Title'}</TableHead>
            <TableHead className="font-semibold">{isBn ? 'অবস্থান' : 'Location'}</TableHead>
            <TableHead className="w-[130px] font-semibold" sortable={Boolean(onSort)}
              sortDirection={sortBy === 'created_at' ? sortDirection : null}
              onSort={() => onSort?.('created_at')}>{isBn ? 'জমার তারিখ' : 'Submitted Date'}</TableHead>
            <TableHead className="font-semibold">{isBn ? 'পোস্ট করেছেন' : 'Posted by'}</TableHead>
            <TableHead className="w-[125px] font-semibold" sortable={Boolean(onSort)}
              sortDirection={sortBy === 'status' ? sortDirection : null}
              onSort={() => onSort?.('status')}>{isBn ? 'স্ট্যাটাস' : 'Status'}</TableHead>
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
              <TableRow key={c.id} tabIndex={0}
                aria-label={`${isBn ? 'অভিযোগের সারসংক্ষেপ' : 'Open complaint overview'} ${c.id}`}
                onClick={() => setSelected(c)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(c); } }}
                className="group cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-500 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
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
                <TableCell className="text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                  {originLabel(c.postedBy)}
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
                    onClick={(event) => { event.stopPropagation(); handleView(c.id); }}
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
      {selected && (
        <Drawer isOpen onClose={() => setSelected(null)} size="md"
          title={isBn ? 'অভিযোগের সারসংক্ষেপ' : 'Complaint Overview'}
          description={isBn ? 'প্রাথমিক তথ্য ও বর্তমান অবস্থা' : 'Verified report summary and current status'}
          footer={<div className="flex w-full justify-between gap-2">
            <Button variant="secondary" onClick={() => setSelected(null)}>{isBn ? 'বন্ধ করুন' : 'Close'}</Button>
            <Button variant="primary" onClick={() => { const id = selected.id; setSelected(null); handleView(id); }}>
              {isBn ? 'বিস্তারিত ও মডারেশন' : 'Detail & Moderation'}
            </Button>
          </div>}>
          <div className="space-y-4 text-sm">
            <h3 className="font-semibold break-words text-slate-900 dark:text-white">
              {(isBn ? selected.titleBn : selected.titleEn) || selected.titleEn || selected.titleBn}
            </h3>
            <p className="line-clamp-5 whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">
              {(isBn ? selected.descriptionBn : selected.descriptionEn) || selected.descriptionEn || selected.descriptionBn}
            </p>
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
              <div><dt className="text-xs text-slate-500 dark:text-slate-400">{isBn ? 'পোস্ট করেছেন' : 'Posted by'}</dt><dd className="font-medium">{originLabel(selected.postedBy)}</dd></div>
              <div><dt className="text-xs text-slate-500 dark:text-slate-400">{isBn ? 'অবস্থা' : 'Status'}</dt><dd className="font-medium">{isBn ? statusBadgeMap[selected.status].labelBn : statusBadgeMap[selected.status].labelEn}</dd></div>
              <div><dt className="text-xs text-slate-500 dark:text-slate-400">{isBn ? 'বিভাগ' : 'Category'}</dt><dd className="font-medium">{isBn ? selected.categoryBn : selected.categoryEn}</dd></div>
              <div><dt className="text-xs text-slate-500 dark:text-slate-400">{isBn ? 'জমা' : 'Submitted'}</dt><dd className="font-medium">{formatDate(selected.createdAt)}</dd></div>
            </dl>
          </div>
        </Drawer>
      )}
    </div>
  );
};

export default ComplaintTable;
