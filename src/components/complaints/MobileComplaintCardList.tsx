import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Badge, BadgeStatus } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { useLanguage } from '@/context/LanguageContext';
import { Complaint, ComplaintLifecycleStatus } from '@/types/Complaint';
import { ComplaintEmptyState } from './ComplaintEmptyState';
import {
  MapPin,
  Calendar,
  Eye,
  Tag,
  ExternalLink,
  ChevronRight,
  User,
} from 'lucide-react';
import { cn } from '@/utils';

export interface MobileComplaintCardListProps {
  complaints: Complaint[];
  loading?: boolean;
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
  onRetry?: () => void;
}

export const MobileComplaintCardList: React.FC<MobileComplaintCardListProps> = ({
  complaints,
  loading = false,
  hasActiveFilters = false,
  onResetFilters,
  onRetry,
}) => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const isDrawerOpen = Boolean(selectedComplaint);

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

  const formatDate = (isoString: string): string => {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleCardClick = (complaint: Complaint) => {
    setSelectedComplaint(complaint);
  };

  const handleCloseDrawer = () => {
    setSelectedComplaint(null);
  };

  const handleNavigateToFullDetail = (id: string) => {
    handleCloseDrawer();
    navigate(`/complaints/${id}`);
  };

  // 1. Loading Skeleton for Mobile Cards
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-4 space-y-3 animate-pulse border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded-full" />
            </div>
            <div className="h-4 w-5/6 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="flex items-center justify-between pt-1">
              <div className="h-3.5 w-28 bg-slate-100 dark:bg-slate-800 rounded" />
              <div className="h-3.5 w-20 bg-slate-100 dark:bg-slate-800 rounded" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  // 2. Empty State
  if (complaints.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <ComplaintEmptyState
          type={hasActiveFilters ? 'filtered_empty' : 'empty'}
          onResetFilters={onResetFilters}
          onRetry={onRetry}
        />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {complaints.map((complaint) => {
          const statusCfg = statusBadgeMap[complaint.status] || {
            badgeStatus: 'default',
            labelEn: complaint.status,
            labelBn: complaint.status,
          };

          const title = (isBn ? complaint.titleBn : complaint.titleEn) || complaint.titleEn || complaint.titleBn || complaint.id;
          const location = isBn ? complaint.location.addressBn : complaint.location.addressEn;
          const category = isBn ? complaint.categoryBn : complaint.categoryEn;

          return (
            <Card
              key={complaint.id}
              variant="default"
              padding="none"
              onClick={() => handleCardClick(complaint)}
              className={cn(
                'w-full text-left transition-all overflow-hidden border border-slate-200 dark:border-slate-800',
                'hover:border-sky-300 dark:hover:border-sky-700 active:scale-[0.99] cursor-pointer'
              )}
            >
              <div className="p-4 space-y-2.5">
                {/* Header: Complaint ID + Status Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sky-700 dark:text-sky-400 text-xs">
                      {complaint.id}
                    </span>
                    {category && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        <Tag className="w-3 h-3 text-slate-400" />
                        <span className="truncate max-w-[110px]">{category}</span>
                      </span>
                    )}
                  </div>
                  <Badge status={statusCfg.badgeStatus} size="sm" dot>
                    {isBn ? statusCfg.labelBn : statusCfg.labelEn}
                  </Badge>
                </div>

                {/* Main: Complaint Title */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">
                    {title}
                  </h4>
                </div>

                {/* Meta Row: Location + Date */}
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">
                      {complaint.location.ward}
                      {location ? ` • ${location}` : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{formatDate(complaint.createdAt)}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Complaint Detail Drawer for Mobile Interaction */}
      {selectedComplaint && (
        <Drawer
          isOpen={isDrawerOpen}
          onClose={handleCloseDrawer}
          title={isBn ? `অভিযোগ: ${selectedComplaint.id}` : `Complaint: ${selectedComplaint.id}`}
          description={isBn ? 'অভিযোগের সংক্ষিপ্ত বিবরণ' : 'Quick Complaint Overview'}
          size="md"
          mobileSheet={true}
          footer={
            <div className="flex items-center justify-between w-full gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseDrawer}
                className="text-xs"
              >
                <span>{isBn ? 'বন্ধ করুন' : 'Close'}</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleNavigateToFullDetail(selectedComplaint.id)}
                rightIcon={<ExternalLink className="w-3.5 h-3.5 ml-1" />}
                className="text-xs"
              >
                <span>{isBn ? 'সম্পূর্ণ বিবরণ ও অ্যাকশন' : 'Full Detail & Actions'}</span>
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            {/* Status & ID Header */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  {isBn ? 'অভিযোগ আইডি' : 'Complaint ID'}
                </span>
                <span className="font-mono text-sm font-bold text-sky-700 dark:text-sky-400">
                  {selectedComplaint.id}
                </span>
              </div>
              <Badge
                status={
                  (statusBadgeMap[selectedComplaint.status] || { badgeStatus: 'default' }).badgeStatus
                }
                size="md"
                dot
              >
                {isBn
                  ? (statusBadgeMap[selectedComplaint.status] || { labelBn: selectedComplaint.status }).labelBn
                  : (statusBadgeMap[selectedComplaint.status] || { labelEn: selectedComplaint.status }).labelEn}
              </Badge>
            </div>

            {/* Title & Description */}
            <div className="space-y-1.5">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {(isBn ? selectedComplaint.titleBn : selectedComplaint.titleEn) || selectedComplaint.titleEn || selectedComplaint.titleBn || selectedComplaint.id}
              </h4>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50/70 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                {(isBn ? selectedComplaint.descriptionBn : selectedComplaint.descriptionEn) || selectedComplaint.descriptionEn || selectedComplaint.descriptionBn}
              </p>
            </div>

            {/* Categorization and Meta Info */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-0.5">
                <span className="text-[10px] text-slate-400 font-medium">{isBn ? 'বিভাগ' : 'Category'}</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {isBn ? selectedComplaint.categoryBn : selectedComplaint.categoryEn}
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-0.5">
                <span className="text-[10px] text-slate-400 font-medium">{isBn ? 'উপ-বিভাগ' : 'Subcategory'}</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {isBn ? selectedComplaint.subcategoryBn : selectedComplaint.subcategoryEn}
                </p>
              </div>
            </div>

            {/* Location Info */}
            <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-semibold">
                <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>{selectedComplaint.location.ward}</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-[11px] pl-5">
                {isBn ? selectedComplaint.location.addressBn : selectedComplaint.location.addressEn}
              </p>
            </div>

            {/* Reporter and Date */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {selectedComplaint.isAnonymous
                    ? isBn
                      ? 'বেনামী নাগরিক'
                      : 'Anonymous Citizen'
                    : selectedComplaint.citizenName || (isBn ? 'নাম প্রকাশে অনিচ্ছুক নাগরিক' : 'Citizen')}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{formatDate(selectedComplaint.createdAt)}</span>
              </div>
            </div>
          </div>
        </Drawer>
      )}
    </>
  );
};

export default MobileComplaintCardList;
