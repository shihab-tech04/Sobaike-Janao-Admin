import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { Complaint, ComplaintVersion } from '@/types/Complaint';
import { History, ChevronDown, ChevronUp, Clock, User, FileEdit } from 'lucide-react';
import { cn, formatDate } from '@/utils';

export interface ComplaintVersionHistoryProps {
  complaint: Complaint;
  className?: string;
}

export const ComplaintVersionHistory: React.FC<ComplaintVersionHistoryProps> = ({
  complaint,
  className,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);

  const versions = complaint.versions || [];

  if (versions.length === 0) {
    return null;
  }

  const toggleExpand = (verNum: number) => {
    setExpandedVersion((prev) => (prev === verNum ? null : verNum));
  };

  return (
    <Card variant="default" className={cn('overflow-hidden', className)}>
      <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <History className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span>{isBn ? 'সম্পাদনা ও সংস্করণ ইতিহাস' : 'Complaint Version & Revision History'}</span>
        </CardTitle>
        <Badge status="info" size="sm">
          {isBn ? `${versions.length}টি সংস্করণ` : `${versions.length} Version${versions.length > 1 ? 's' : ''}`}
        </Badge>
      </CardHeader>

      <CardContent className="pt-4 space-y-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {isBn
            ? 'এই অভিযোগটির পূর্ববর্তী সকল সংস্করণ ও পরিবর্তনের রেকর্ড নিচে সংরক্ষিত আছে।'
            : 'Audit log of prior revisions and metadata snapshots captured during administrative edits.'}
        </p>

        <div className="space-y-2.5">
          {versions.map((ver: ComplaintVersion) => {
            const isExpanded = expandedVersion === ver.versionNumber;
            return (
              <div
                key={ver.versionNumber}
                className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-900/80 transition-colors space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-mono">
                      v{ver.versionNumber}.0
                    </span>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      {ver.editedBy?.name || 'Admin'}
                    </span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {formatDate(ver.editedAt)}
                    </span>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpand(ver.versionNumber)}
                    className="h-6 px-2 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                  >
                    <span>{isExpanded ? (isBn ? 'সংক্ষেপ' : 'Hide') : (isBn ? 'স্ন্যাপশট দেখুন' : 'View Snapshot')}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
                  </Button>
                </div>

                {ver.editNotes && (
                  <div className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5 pt-0.5">
                    <FileEdit className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-slate-700 dark:text-slate-200 font-medium">
                        {isBn ? 'সম্পাদনার কারণ: ' : 'Reason: '}
                      </strong>
                      {ver.editNotes}
                    </span>
                  </div>
                )}

                {isExpanded && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 animate-in fade-in">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {isBn ? 'পূর্ববর্তী অবস্থার স্ন্যাপশট' : 'Pre-Revision State Snapshot'}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-white dark:bg-slate-950 p-2.5 rounded border border-slate-100 dark:border-slate-800">
                      {ver.titleBn && (
                        <div>
                          <span className="text-slate-400 block text-[11px]">{isBn ? 'শিরোনাম (বাংলা)' : 'Title (BN)'}</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{ver.titleBn}</span>
                        </div>
                      )}
                      {ver.titleEn && (
                        <div>
                          <span className="text-slate-400 block text-[11px]">{isBn ? 'শিরোনাম (ইংরেজি)' : 'Title (EN)'}</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{ver.titleEn}</span>
                        </div>
                      )}
                      {ver.categoryEn && (
                        <div>
                          <span className="text-slate-400 block text-[11px]">{isBn ? 'ক্যাটাগরি' : 'Category'}</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {isBn ? ver.categoryBn || ver.categoryEn : ver.categoryEn}
                          </span>
                        </div>
                      )}
                      {ver.urgency && (
                        <div>
                          <span className="text-slate-400 block text-[11px]">{isBn ? 'জরুরিতা' : 'Urgency'}</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200 capitalize">{ver.urgency}</span>
                        </div>
                      )}
                      {ver.location?.ward && (
                        <div>
                          <span className="text-slate-400 block text-[11px]">{isBn ? 'ওয়ার্ড' : 'Ward'}</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{ver.location.ward}</span>
                        </div>
                      )}
                      {ver.descriptionBn && (
                        <div className="col-span-full">
                          <span className="text-slate-400 block text-[11px]">{isBn ? 'বিবরণ (বাংলা)' : 'Description (BN)'}</span>
                          <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{ver.descriptionBn}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default ComplaintVersionHistory;
