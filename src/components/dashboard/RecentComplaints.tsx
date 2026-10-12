import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge, BadgeStatus } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { RecentComplaintItem, LifecycleStatusKey } from '@/types/Dashboard';
import {
  ListFilter,
  ArrowRight,
  MapPin,
  Calendar,
  FileText,
} from 'lucide-react';

export interface RecentComplaintsProps {
  complaints: RecentComplaintItem[];
  loading?: boolean;
}

export const RecentComplaints: React.FC<RecentComplaintsProps> = ({
  complaints,
  loading,
}) => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const statusBadgeMap: Record<
    LifecycleStatusKey,
    { badgeStatus: BadgeStatus; labelEn: string; labelBn: string }
  > = {
    submitted: { badgeStatus: 'pending', labelEn: 'Submitted', labelBn: 'জমা পড়েছে' },
    published: { badgeStatus: 'published', labelEn: 'Published', labelBn: 'প্রকাশিত' },
    unpublished: { badgeStatus: 'default', labelEn: 'Unpublished', labelBn: 'অপ্রকাশিত' },
    rejected: { badgeStatus: 'rejected', labelEn: 'Rejected', labelBn: 'প্রত্যাখ্যাত' },
    edited: { badgeStatus: 'info', labelEn: 'Edited', labelBn: 'সম্পাদিত' },
  };

  if (loading) {
    return (
      <Card variant="default">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="space-y-1">
            <div className="h-4 w-44 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            <div className="h-3 w-64 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          </div>
          <div className="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-14 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 animate-pulse p-3"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="default" className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ListFilter className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <CardTitle className="text-sm font-semibold">
              {isBn ? 'সাম্প্রতিক প্রতিবেদন' : 'Recent Reports'}
            </CardTitle>
          </div>
          <CardDescription>
            {isBn
              ? 'প্ল্যাটফর্মে জমা পড়া সর্বশেষ প্রতিবেদনসমূহ'
              : 'Latest reports submitted to the platform'}
          </CardDescription>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/complaints')}
          className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700"
          rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
        >
          {isBn ? 'সকল অভিযোগ দেখুন' : 'View All Complaints'}
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {complaints.length === 0 ? (
          <div className="p-8 text-center border-t border-slate-100 dark:border-slate-800">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-2">
              <FileText className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {isBn ? 'এখনও কোনো প্রতিবেদন নেই' : 'No Reports Yet'}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {isBn
                ? 'প্রতিবেদন জমা পড়লে এখানে দেখা যাবে।'
                : 'Reports will appear here after they are submitted.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-medium">
                <tr>
                  <th className="py-2.5 px-4">{isBn ? 'আইডি ও শিরোনাম' : 'ID & Title'}</th>
                  <th className="py-2.5 px-4">{isBn ? 'বিভাগ' : 'Segment'}</th>
                  <th className="py-2.5 px-4">{isBn ? 'অবস্থান' : 'Location'}</th>
                  <th className="py-2.5 px-4">{isBn ? 'তারিখ' : 'Date'}</th>
                  <th className="py-2.5 px-4 text-center">{isBn ? 'স্ট্যাটাস' : 'Status'}</th>
                  <th className="py-2.5 px-4 text-right">{isBn ? 'পদক্ষেপ' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {complaints.map((c) => {
                  const statusInfo = statusBadgeMap[c.status] || {
                    badgeStatus: 'default',
                    labelEn: c.status,
                    labelBn: c.status,
                  };

                  return (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/complaints/${c.id}`)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      {/* ID & Title */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="flex flex-col">
                          <span className="font-mono text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                            #{c.id.slice(0, 8)}
                          </span>
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate mt-0.5">
                            {isBn ? c.titleBn : c.titleEn}
                          </span>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-xs text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {isBn ? c.categoryBn : c.categoryEn}
                        </span>
                      </td>

                      {/* Location */}
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1.5 truncate max-w-[180px]">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">
                            {isBn ? c.locationBn : c.locationEn}
                          </span>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{c.date}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <Badge status={statusInfo.badgeStatus} size="sm">
                          {isBn ? statusInfo.labelBn : statusInfo.labelEn}
                        </Badge>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/complaints/${c.id}`);
                          }}
                          className="h-7 px-2 text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                        >
                          {isBn ? 'পর্যালোচনা' : 'Review'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentComplaints;
