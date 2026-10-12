import React from 'react';
import { ResponseItem, ResponseStatus, ResponseType } from '@/types/Response';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useLanguage } from '@/context/LanguageContext';
import {
  MessageSquare,
  FileText,
  Info,
  Calendar,
  Clock,
  MapPin,
  Building,
  User,
  ShieldAlert,
  HelpCircle,
  FileCheck,
} from 'lucide-react';

export interface ResponseDetailDrawerProps {
  response: ResponseItem | null;
  isOpen: boolean;
  onClose: () => void;
  canPublish: boolean;
  canReject: boolean;
  canUnpublish: boolean;
  canResubmit: boolean;
  isModerating?: boolean;
  onPublish: () => void;
  onReject: () => void;
  onUnpublish: () => void;
  onResubmit: () => void;
}

export const ResponseDetailDrawer: React.FC<ResponseDetailDrawerProps> = ({
  response,
  isOpen,
  onClose,
  canPublish,
  canReject,
  canUnpublish,
  canResubmit,
  isModerating = false,
  onPublish,
  onReject,
  onUnpublish,
  onResubmit,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  if (!response) return null;

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

  const getTypeLabel = (type: ResponseType) => {
    if (type === 'citizen_information') {
      return isBn ? 'তথ্য / অভিজ্ঞতা' : 'Information / Experience';
    }
    if (type === 'subject_response') {
      return isBn ? 'উল্লিখিত ব্যক্তি / পক্ষ' : 'Mentioned Person / Party';
    }
    return type;
  };

  const getResponderTypeLabel = (
    responderType?: 'mentioned_person' | 'organization_rep' | 'legal_rep' | null
  ) => {
    switch (responderType) {
      case 'mentioned_person':
        return isBn ? 'উল্লিখিত ব্যক্তি' : 'Mentioned Person';
      case 'organization_rep':
        return isBn ? 'প্রতিষ্ঠানের প্রতিনিধি' : 'Organization Representative';
      case 'legal_rep':
        return isBn ? 'আইনি প্রতিনিধি' : 'Legal Representative';
      default:
        return isBn ? 'অনির্দিষ্ট' : 'Unspecified';
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return isBn ? 'প্রযোজ্য নয়' : 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      mobileSheet={true}
      title={isBn ? 'প্রতিক্রিয়ার বিস্তারিত' : 'Response Details'}
      description={`ID: #${response.id}`}
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 w-full">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isModerating}
            className="w-full sm:w-auto px-5 min-h-[44px]"
          >
            {isBn ? 'বন্ধ করুন' : 'Close'}
          </Button>

          {/* Pending Review Actions: Reject and/or Publish */}
          {response.status === 'pending_review' && (
            <>
              {canReject && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={onReject}
                  disabled={isModerating}
                  className="w-full sm:w-auto px-5 min-h-[44px]"
                >
                  {isBn ? 'প্রত্যাখ্যান করুন' : 'Reject'}
                </Button>
              )}
              {canPublish && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={onPublish}
                  disabled={isModerating}
                  className="w-full sm:w-auto px-5 min-h-[44px]"
                >
                  {isBn ? 'প্রকাশ করুন' : 'Publish'}
                </Button>
              )}
            </>
          )}

          {/* Published Actions: Unpublish */}
          {response.status === 'published' && canUnpublish && (
            <Button
              type="button"
              variant="danger"
              onClick={onUnpublish}
              disabled={isModerating}
              className="w-full sm:w-auto px-5 min-h-[44px]"
            >
              {isBn ? 'অপ্রকাশিত করুন' : 'Unpublish'}
            </Button>
          )}

          {/* Rejected Actions: Resubmit */}
          {response.status === 'rejected' && canResubmit && (
            <Button
              type="button"
              variant="primary"
              onClick={onResubmit}
              disabled={isModerating}
              className="w-full sm:w-auto px-5 min-h-[44px]"
            >
              {isBn ? 'পুনরায় পর্যালোচনায় পাঠান' : 'Resubmit'}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6 pb-2">
        {/* HEADER SUMMARY BAR */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {isBn ? 'ধরন' : 'Type'}:
            </span>
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {getTypeLabel(response.responseType)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {isBn ? 'স্ট্যাটাস' : 'Status'}:
            </span>
            {getStatusBadge(response.status)}
          </div>
        </div>

        {/* SECTION 1: Response */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
            <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              {isBn ? 'প্রতিক্রিয়ার বক্তব্য' : 'Response Content'}
            </h4>
          </div>
          <div className="whitespace-pre-wrap text-sm text-slate-900 dark:text-slate-100 leading-relaxed font-normal bg-slate-50/50 dark:bg-slate-950/40 p-4 rounded-lg border border-slate-100 dark:border-slate-800/60">
            {response.content || (
              <span className="text-slate-400 italic">
                {isBn ? 'কোনো বক্তব্য নেই' : 'No content provided'}
              </span>
            )}
          </div>
        </div>

        {/* SECTION 2: Related Report */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
            <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              {isBn ? 'সম্পর্কিত অভিযোগ / প্রতিবেদন' : 'Related Report'}
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {isBn ? 'প্রতিবেদন আইডি' : 'Report ID'}
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                #{response.complaint.id}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {isBn ? 'প্রতিবেদনের স্ট্যাটাস' : 'Report Status'}
              </p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-0.5 capitalize">
                {response.complaint.status || (isBn ? 'অজানা' : 'Unknown')}
              </p>
            </div>

            <div className="sm:col-span-2">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {isBn ? 'প্রতিবেদনের শিরোনাম' : 'Report Title'}
              </p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                {response.complaint.title || (isBn ? 'শিরোনামহীন' : 'Untitled')}
              </p>
            </div>

            {(response.complaint.segmentNameEn || response.complaint.segmentNameBn) && (
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {isBn ? 'ক্যাটাগরি / সেগমেন্ট' : 'Category / Segment'}
                </p>
                <p className="text-sm text-slate-800 dark:text-slate-200 mt-0.5">
                  {isBn
                    ? response.complaint.segmentNameBn || response.complaint.segmentNameEn
                    : response.complaint.segmentNameEn || response.complaint.segmentNameBn}
                </p>
              </div>
            )}

            {response.complaint.district && (
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {isBn ? 'জেলা / এলাকা' : 'District / Area'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">
                    {response.complaint.district}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: Response Details */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              {isBn ? 'প্রতিক্রিয়ার বিবরণ' : 'Response Details'}
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {isBn ? 'প্রতিক্রিয়ার ধরন' : 'Response Type'}
              </p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                {getTypeLabel(response.responseType)}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {isBn ? 'জমা দেওয়ার তারিখ ও সময়' : 'Submitted Date & Time'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-sm text-slate-800 dark:text-slate-200">
                  {formatDate(response.createdAt)}
                </span>
              </div>
            </div>

            {response.incidentDate && (
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {isBn ? 'ঘটনার তারিখ' : 'Incident Date'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">
                    {formatDate(response.incidentDate)}
                  </span>
                </div>
              </div>
            )}

            {response.publishedAt && (
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {isBn ? 'প্রকাশের তারিখ' : 'Published At'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">
                    {formatDate(response.publishedAt)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {(response.rejectionReason || response.rejectionNote || response.unpublishReason) && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-xs">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                {isBn ? 'অভ্যন্তরীণ মডারেশন রেকর্ড' : 'Internal Moderation Record'}
              </h4>
            </div>

            <div className="space-y-3">
              {response.rejectionReason && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {isBn ? 'প্রত্যাখ্যানের কারণ' : 'Rejection Reason'}
                  </p>
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-1 whitespace-pre-wrap">
                    {response.rejectionReason}
                  </p>
                </div>
              )}

              {response.rejectionNote && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {isBn ? 'প্রত্যাখ্যানের প্রশাসনিক নোট' : 'Rejection Administrative Note'}
                  </p>
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-1 whitespace-pre-wrap">
                    {response.rejectionNote}
                  </p>
                </div>
              )}

              {response.unpublishReason && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {isBn ? 'অপ্রকাশিত করার কারণ' : 'Unpublish Reason'}
                  </p>
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-1 whitespace-pre-wrap">
                    {response.unpublishReason}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 4: Type-specific metadata */}
        {response.responseType === 'citizen_information' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-xs">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
              <User className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                {isBn ? 'নাগরিক তথ্য মেটাডাটা' : 'Citizen Information Metadata'}
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {isBn ? 'যোগাযোগের সম্মতি' : 'Contact Consent'}
                </p>
                <div className="mt-1">
                  {response.contactConsent ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                      <FileCheck className="w-3.5 h-3.5" />
                      {isBn ? 'হ্যাঁ (সম্মত)' : 'Yes (Consented)'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      {isBn ? 'না' : 'No'}
                    </span>
                  )}
                </div>
              </div>

              {response.contactConsent && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {isBn ? 'ফলো-আপ যোগাযোগ' : 'Follow-up contact'}
                  </p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-1 break-all">
                    {response.contactInfo || (isBn ? 'যোগাযোগের তথ্য পাওয়া যায়নি' : 'Contact information unavailable')}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {isBn
                      ? 'ব্যক্তিগত — শুধুমাত্র অনুমোদিত প্রশাসকের জন্য দৃশ্যমান'
                      : 'Private — visible to authorized administrators only'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {response.responseType === 'subject_response' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-xs">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
              <Building className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                {isBn ? 'উল্লিখিত পক্ষের বিবরণ' : 'Subject Response Metadata'}
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {isBn ? 'উত্তরদাতার ধরন' : 'Responder Type'}
                </p>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                  {getResponderTypeLabel(response.responderType)}
                </p>
              </div>

              {response.responderName && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {isBn ? 'উত্তরদাতার নাম' : 'Responder Name'}
                  </p>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                    {response.responderName}
                  </p>
                </div>
              )}

              {response.designation && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {isBn ? 'পদবি' : 'Designation'}
                  </p>
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-0.5">
                    {response.designation}
                  </p>
                </div>
              )}

              {response.organizationName && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {isBn ? 'প্রতিষ্ঠান / সংস্থা' : 'Organization'}
                  </p>
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-0.5">
                    {response.organizationName}
                  </p>
                </div>
              )}

              {(response.contactEmailOrPhone || response.contactInfo) && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {isBn ? 'উত্তরদাতার যোগাযোগ' : 'Responder contact'}
                  </p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-1 break-all">
                    {response.contactEmailOrPhone || response.contactInfo}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {isBn
                      ? 'ব্যক্তিগত — শুধুমাত্র অনুমোদিত প্রশাসকের জন্য দৃশ্যমান'
                      : 'Private — visible to authorized administrators only'}
                  </p>
                </div>
              )}

              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {isBn ? 'সংশোধন বা প্রত্যাহারের অনুরোধ' : 'Correction / Removal Requested'}
                </p>
                <div className="mt-1">
                  {response.requestCorrectionOrRemoval ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      {isBn ? 'হ্যাঁ (অনুরোধ করা হয়েছে)' : 'Yes (Requested)'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      {isBn ? 'না' : 'No'}
                    </span>
                  )}
                </div>
              </div>

              {response.correctionDetails && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {isBn ? 'সংশোধনের বিবরণ' : 'Correction Details'}
                  </p>
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-1 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-md border border-slate-200/60 dark:border-slate-700/60 whitespace-pre-wrap">
                    {response.correctionDetails}
                  </p>
                </div>
              )}

              {response.officialStatement && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {isBn ? 'অফিসিয়াল বক্তব্য' : 'Official Statement'}
                  </p>
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-1 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-md border border-slate-200/60 dark:border-slate-700/60 whitespace-pre-wrap">
                    {response.officialStatement}
                  </p>
                </div>
              )}

              {response.supportingDocumentsNote && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {isBn ? 'সহায়ক দলিলের নোট' : 'Supporting Documents Note'}
                  </p>
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-1 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-md border border-slate-200/60 dark:border-slate-700/60 whitespace-pre-wrap">
                    {response.supportingDocumentsNote}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
};

export default ResponseDetailDrawer;