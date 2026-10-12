import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useLanguage } from '@/context/LanguageContext';
import { Complaint } from '@/types/Complaint';
import {
  FileText,
  User,
  ShieldCheck,
  Phone,
  Layers,
  Globe2,
  Lock,
} from 'lucide-react';
import { cn } from '@/utils';
import { UtilityBillComparisonCard } from './UtilityBillComparisonCard';
import { UtilityOutageDetailsCard } from './UtilityOutageDetailsCard';
import {
  getHarassmentAgeGroupLabel,
  getHarassmentRelationshipLabel,
  getHarassmentReportingForLabel,
} from '@/utils/harassmentClassification';

export interface ComplaintInfoSectionProps {
  complaint: Complaint;
  className?: string;
}

export const ComplaintInfoSection: React.FC<ComplaintInfoSectionProps> = ({
  complaint,
  className,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const hasBnDesc = Boolean(complaint.descriptionBn?.trim());
  const hasEnDesc = Boolean(
    complaint.descriptionEn?.trim() &&
    complaint.descriptionEn.trim() !== complaint.descriptionBn?.trim()
  );
  const hasBothDesc = hasBnDesc && hasEnDesc;
  const hasOnlyBn = hasBnDesc && !hasEnDesc;
  const hasOnlyEn = hasEnDesc && !hasBnDesc;

  // Title distinctness check
  const hasBnTitle = Boolean(complaint.titleBn?.trim());
  const hasEnTitle = Boolean(
    complaint.titleEn?.trim() &&
    complaint.titleEn.trim() !== complaint.titleBn?.trim()
  );
  const hasBothTitles = hasBnTitle && hasEnTitle;

  // Allow switching description language tab or viewing both
  const initialTab = hasBothDesc ? 'both' : (hasOnlyBn ? 'bn' : (hasOnlyEn ? 'en' : 'both'));
  const [descLangTab, setDescLangTab] = useState<'both' | 'bn' | 'en'>(initialTab);

  // Synchronize active tab based on available language narratives
  useEffect(() => {
    if (hasBothDesc) {
      setDescLangTab('both');
    } else if (hasOnlyBn) {
      setDescLangTab('bn');
    } else if (hasOnlyEn) {
      setDescLangTab('en');
    }
  }, [hasBothDesc, hasOnlyBn, hasOnlyEn]);

  const publicationPreferenceRows = complaint.publicationPreferences
    ? [
        {
          key: 'showSubjectName' as const,
          labelEn: 'Subject name',
          labelBn: 'অভিযুক্ত/বিষয়ের নাম',
        },
        {
          key: 'showOrganization' as const,
          labelEn: 'Organization',
          labelBn: 'প্রতিষ্ঠান',
        },
        {
          key: 'showGeneralLocation' as const,
          labelEn: 'General location',
          labelBn: 'সাধারণ অবস্থান',
        },
        {
          key: 'showDescription' as const,
          labelEn: 'Description',
          labelBn: 'বিবরণ',
        },
      ]
    : [];

  const renderPreferenceValue = (value: boolean | undefined) => {
    if (value === true) return isBn ? 'প্রদর্শনের অনুমতি' : 'Show';
    if (value === false) return isBn ? 'গোপন রাখুন' : 'Hide';
    return isBn ? 'উল্লেখ করা হয়নি' : 'Not specified';
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* 1. Description Section */}
      <Card variant="default">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span>{isBn ? 'অভিযোগের মূল বিবরণ' : 'Complaint Narrative & Statement'}</span>
          </CardTitle>

          {/* Language display switcher: only rendered when both language versions exist */}
          {hasBothDesc && (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md text-xs">
              <button
                type="button"
                onClick={() => setDescLangTab('both')}
                className={cn(
                  'px-2 py-1 rounded transition-colors text-xs font-medium',
                  descLangTab === 'both'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                )}
              >
                {isBn ? 'উভয় ভাষা' : 'Both (EN & BN)'}
              </button>
              <button
                type="button"
                onClick={() => setDescLangTab('bn')}
                className={cn(
                  'px-2 py-1 rounded transition-colors text-xs font-medium',
                  descLangTab === 'bn'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                )}
              >
                {isBn ? 'বাংলা' : 'Bengali'}
              </button>
              <button
                type="button"
                onClick={() => setDescLangTab('en')}
                className={cn(
                  'px-2 py-1 rounded transition-colors text-xs font-medium',
                  descLangTab === 'en'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                )}
              >
                {isBn ? 'ইংরেজি' : 'English'}
              </button>
            </div>
          )}

          {/* If only Bengali version exists */}
          {hasOnlyBn && (
            <Badge variant="subtle" size="sm" className="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 font-normal">
              <Globe2 className="w-3 h-3 mr-1" />
              {isBn ? 'মূল ভাষা: বাংলা' : 'Submission Language: Bengali'}
            </Badge>
          )}

          {/* If only English version exists */}
          {hasOnlyEn && (
            <Badge variant="subtle" size="sm" className="text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800 font-normal">
              <Globe2 className="w-3 h-3 mr-1" />
              {isBn ? 'মূল ভাষা: ইংরেজি' : 'Submission Language: English'}
            </Badge>
          )}
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Primary Subject Title */}
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              {isBn ? 'অভিযোগের শিরোনাম' : 'Subject Heading'}
            </span>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
              {isBn ? complaint.titleBn || complaint.titleEn : complaint.titleEn || complaint.titleBn}
            </h3>
            {hasBothTitles && (hasBothDesc ? descLangTab === 'both' : false) && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium italic">
                {isBn ? complaint.titleEn : complaint.titleBn}
              </p>
            )}
          </div>

          {/* Description Content */}
          <div className="space-y-4 pt-2">
            {hasBnDesc && (hasBothDesc ? descLangTab === 'both' || descLangTab === 'bn' : true) && (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <Globe2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{isBn ? 'বাংলা বিবরণ' : 'Bengali Submission Statement'}</span>
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {complaint.descriptionBn}
                </p>
              </div>
            )}

            {hasEnDesc && (hasBothDesc ? descLangTab === 'both' || descLangTab === 'en' : true) && (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <Globe2 className="w-3.5 h-3.5 text-sky-600" />
                  <span>{isBn ? 'ইংরেজি বিবরণ' : 'English Submission Statement'}</span>
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {complaint.descriptionEn}
                </p>
              </div>
            )}

            {!hasBnDesc && !hasEnDesc && (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-200 dark:border-slate-800 text-center text-slate-400 dark:text-slate-500 text-xs">
                {isBn ? 'কোনো বিবরণ প্রদান করা হয়নি' : 'No submission statement provided'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Utility Bill Comparison Card (if electricity bill data is present) */}
      <UtilityBillComparisonCard complaint={complaint} />

      {/* Utility Outage / Event Details Card (if incident date/time or outage info is present) */}
      <UtilityOutageDetailsCard complaint={complaint} />

      {/* Harassment Classification Context (read-only citizen-submitted metadata) */}
      {complaint.categoryId === 'harassment' && (
        <Card variant="default">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span>{isBn ? 'হয়রানি শ্রেণিবিন্যাস প্রসঙ্গ' : 'Harassment Classification Context'}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isBn ? 'প্রভাবিত ব্যক্তির বয়সের গ্রুপ' : "Affected person's age group"}
                </p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {getHarassmentAgeGroupLabel(complaint.affectedPersonAgeGroup, isBn ? 'bn' : 'en')}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isBn ? 'অভিযুক্ত ব্যক্তির সঙ্গে সম্পর্ক' : 'Relationship with alleged abuser'}
                </p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {getHarassmentRelationshipLabel(complaint.allegedAbuserRelationship, isBn ? 'bn' : 'en')}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isBn ? 'কার জন্য প্রতিবেদন' : 'Reporting for'}
                </p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {getHarassmentReportingForLabel(complaint.reportingFor, isBn ? 'bn' : 'en')}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
              {isBn ? 'নাগরিকের জমা দেওয়া শ্রেণিবিন্যাস; অ্যাডমিন ভিউতে শুধু-পঠনযোগ্য।' : 'Citizen-submitted classification; read-only in the Admin view.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 2. Reporter Information & Privacy Card */}
      <Card variant="default">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>{isBn ? 'আবেদনকারী নাগরিকের তথ্য' : 'Citizen Reporter Information'}</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Identity Status */}
            <div className="space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                {isBn ? 'নাগরিক পরিচয় ধরন' : 'Submission Identity Mode'}
              </span>
              <div className="pt-0.5">
                {complaint.privacyChoice === 'anonymous' ? (
                  <Badge status="default" size="md">
                    <Lock className="w-3 h-3 mr-1 text-slate-400" />
                    {isBn ? 'বেনামী দাখিল' : 'Anonymous submission'}
                  </Badge>
                ) : complaint.privacyChoice === 'admin_only' ? (
                  <Badge status="default" size="md">
                    <Lock className="w-3 h-3 mr-1 text-slate-400" />
                    {isBn ? 'পরিচয় শুধু অ্যাডমিনের জন্য দৃশ্যমান' : 'Identity visible to Admin only'}
                  </Badge>
                ) : complaint.privacyChoice === 'public_identity' ? (
                  <Badge status="pending" size="md">
                    <ShieldCheck className="w-3 h-3 mr-1 text-amber-500" />
                    {isBn ? 'পাবলিক পরিচয় প্রকাশের অনুরোধ' : 'Public identity requested'}
                  </Badge>
                ) : (
                  <Badge status="default" size="md">
                    {isBn ? 'উল্লেখ করা হয়নি' : 'Not specified'}
                  </Badge>
                )}
              </div>
            </div>

            {/* Reporter Name (Only if available / not anonymous) */}
            <div className="space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {isBn ? 'নাগরিকের নাম' : 'Citizen Name'}
              </span>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {complaint.isAnonymous
                  ? isBn
                    ? 'বেনামী নাগরিক (সুরক্ষিত)'
                    : 'Anonymous Citizen (Protected)'
                  : complaint.citizenName || (isBn ? 'নাম প্রদান করা হয়নি' : 'Not provided')}
              </p>
            </div>

            {/* Contact Phone (Only if provided, masked for privacy) */}
            {!complaint.isAnonymous && complaint.citizenPhone && (
              <div className="space-y-1">
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {isBn ? 'যোগাযোগ নম্বর' : 'Contact Phone'}
                </span>
                <p className="text-sm font-mono font-medium text-slate-900 dark:text-slate-100">
                  {complaint.citizenPhone}
                </p>
              </div>
            )}

            {complaint.privacyChoice === 'public_identity' && (
              <div className="space-y-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {isBn ? 'পাবলিক পরিচয় নিশ্চিতকরণ' : 'Public Identity Confirmation'}
                </span>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {complaint.confirmPublicIdentity === true
                    ? isBn
                      ? 'নাগরিক নিশ্চিত করেছেন'
                      : 'Confirmed by citizen'
                    : complaint.confirmPublicIdentity === false
                    ? isBn
                      ? 'নাগরিক নিশ্চিত করেননি'
                      : 'Not confirmed by citizen'
                    : isBn
                    ? 'উল্লেখ করা হয়নি'
                    : 'Not specified'}
                </p>
              </div>
            )}

            {/* Platform Trust & Protection Note */}
            <div className="space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {isBn ? 'নাগরিক সুরক্ষা প্রোটোকল' : 'Data Privacy Standard'}
              </span>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {isBn
                  ? 'সবাইকে জানাও প্ল্যাটফর্মের গোপনীয়তা নীতি অনুযায়ী নাগরিক সংবেদনশীল তথ্য সুরক্ষিত থাকে।'
                  : 'Protected according to Sobai Ke Janao Citizen Whistleblower Privacy Standard.'}
              </p>
            </div>
          </div>

          {publicationPreferenceRows.length > 0 && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {isBn ? 'নাগরিকের প্রকাশনা পছন্দ' : 'Citizen Publication Preferences'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {isBn
                    ? 'নাগরিক যেভাবে জমা দিয়েছেন সেভাবেই শুধু-পঠনযোগ্যভাবে দেখানো হচ্ছে। অনুপস্থিত পছন্দ অনুমান করা হয়নি।'
                    : 'Read-only values as submitted by the citizen. Missing preferences are not inferred.'}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {publicationPreferenceRows.map(({ key, labelEn, labelBn }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-md border border-slate-200 dark:border-slate-800 px-3 py-2"
                  >
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {isBn ? labelBn : labelEn}
                    </p>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 text-right">
                      {renderPreferenceValue(complaint.publicationPreferences?.[key])}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ComplaintInfoSection;
