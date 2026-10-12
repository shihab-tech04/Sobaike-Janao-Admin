import React, { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapComplaint } from '@/types/Map';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { Badge, BadgeStatus } from '@/components/ui/Badge';
import {
  MapPin,
  Folder,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/utils';

export interface MapComplaintListProps {
  complaints: MapComplaint[];
  selectedId: string | null;
  onSelectComplaint: (complaint: MapComplaint) => void;
  className?: string;
}

export const MapComplaintList: React.FC<MapComplaintListProps> = ({
  complaints,
  selectedId,
  onSelectComplaint,
  className,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';
  const { hasPermission } = useAuth();
  const canViewComplaints = hasPermission('complaints.view');
  const navigate = useNavigate();
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Auto-scroll selected item into view if selected from map marker
  useEffect(() => {
    if (selectedId && itemRefs.current[selectedId]) {
      itemRefs.current[selectedId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedId]);

  const getStatusBadge = (status: MapComplaint['status']) => {
    const map: Record<
      MapComplaint['status'],
      { badgeStatus: BadgeStatus; labelEn: string; labelBn: string }
    > = {
      submitted: { badgeStatus: 'pending', labelEn: 'Submitted', labelBn: 'দাখিলকৃত' },
      published: { badgeStatus: 'published', labelEn: 'Published', labelBn: 'প্রকাশিত' },
      unpublished: { badgeStatus: 'default', labelEn: 'Unpublished', labelBn: 'অপ্রকাশিত' },
      rejected: { badgeStatus: 'rejected', labelEn: 'Rejected', labelBn: 'বাতিলকৃত' },
      edited: { badgeStatus: 'info', labelEn: 'Edited', labelBn: 'সম্পাদিত' },
    };

    const cfg = map[status] || { badgeStatus: 'default', labelEn: status, labelBn: status };
    return (
      <Badge status={cfg.badgeStatus} size="sm">
        {isBn ? cfg.labelBn : cfg.labelEn}
      </Badge>
    );
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const formatLocation = (item: MapComplaint) => {
    const loc = item.location;
    if (loc.formattedAddress) return loc.formattedAddress;
    const parts = [loc.area, loc.road, loc.upazilaOrThana, loc.district].filter(
      Boolean
    );
    return parts.length > 0 ? parts.join(', ') : isBn ? 'অবস্থান অনুল্লিখিত' : 'Location unspecified';
  };

  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-xs',
        className
      )}
    >
      {/* Header */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span>{isBn ? 'ম্যাপে তালিকাভুক্ত অভিযোগ' : 'Mapped Complaints'}</span>
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {isBn
              ? 'ম্যাপে চিহ্নিত সকল সক্রিয় অভিযোগ পয়েন্ট'
              : 'Interactive markers visible on the map'}
          </p>
        </div>

        <Badge variant="outline" size="sm" className="font-mono">
          {complaints.length} {isBn ? 'টি' : 'items'}
        </Badge>
      </div>

      {/* List Container */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto max-h-[500px] sm:max-h-[560px] lg:max-h-[590px]">
        {complaints.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            {isBn ? 'কোনো অভিযোগ পাওয়া যায়নি' : 'No complaints match the filter'}
          </div>
        ) : (
          complaints.map((item) => {
            const isSelected = selectedId === item.id;

            return (
              <div
                key={item.id}
                ref={(el) => {
                  itemRefs.current[item.id] = el;
                }}
                onClick={() => onSelectComplaint(item)}
                className={cn(
                  'p-3.5 transition-colors cursor-pointer text-left group relative',
                  isSelected
                    ? 'bg-sky-50/80 dark:bg-sky-950/40 border-l-3 border-l-sky-500'
                    : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/50'
                )}
              >
                {/* Row 1: ID & Status */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                      #{item.id}
                    </span>
                  </div>

                  <div className="shrink-0">{getStatusBadge(item.status)}</div>
                </div>

                {/* Row 2: Title */}
                <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                  {isBn ? item.titleBn : item.titleEn}
                </h4>

                {/* Row 3: Segment & Subcategory */}
                <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  <Folder className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {(isBn ? item.segmentBn : item.segmentEn) || '—'}
                    {(isBn ? item.subcategoryBn : item.subcategoryEn)
                      ? ` • ${isBn ? item.subcategoryBn : item.subcategoryEn}`
                      : ''}
                  </span>
                </div>

                {/* Row 4: Location & Date & Action */}
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/70">
                  <div className="flex items-center gap-1 min-w-0">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                      {formatLocation(item)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-400 font-mono">
                      {formatDate(item.createdAt)}
                    </span>
                    {canViewComplaints && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/complaints/${item.id}`);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title={isBn ? 'অভিযোগের বিস্তারিত দেখুন' : 'Open full complaint workspace'}
                        aria-label={isBn ? `অভিযোগ #${item.id}-এর বিস্তারিত দেখুন` : `Open full complaint workspace for #${item.id}`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MapComplaintList;
