import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge, BadgeStatus } from '@/components/ui/Badge';
import { EmptyState } from '@/components/common/EmptyState';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import {
  Complaint,
  ComplaintLifecycleStatus,
  ComplaintTimelineEvent,
  ReporterDeviceLocation,
} from '@/types/Complaint';
import { complaintApi } from '@/services/api';
import { getComplaintParties, ComplaintParty } from '@/services/api/complaintPartiesApi';
import {
  ComplaintSummaryCard,
  ComplaintInfoSection,
  ComplaintMediaViewer,
  ComplaintLocationCard,
  ComplaintTimeline,
  ComplaintActionArea,
  ComplaintVersionHistory,
  ComplaintPartiesCard,
} from '@/components/complaints';
import {
  RefreshCw,
  Share2,
  FileQuestion,
  RotateCcw,
  ArrowLeft,
  AlertTriangle,
  History,
} from 'lucide-react';

export const ComplaintDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { hasPermission } = useAuth();
  const isBn = language === 'bn';
  const canViewEvidence = hasPermission('complaints.evidence_view');

  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [timeline, setTimeline] = useState<ComplaintTimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState<boolean>(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [reporterLocation, setReporterLocation] = useState<ReporterDeviceLocation | null>(null);
  const [reporterLocationLoading, setReporterLocationLoading] = useState<boolean>(false);
  const [reporterLocationError, setReporterLocationError] = useState<string | null>(null);
  const [reporterLocationDenied, setReporterLocationDenied] = useState<boolean>(false);
  const [parties, setParties] = useState<ComplaintParty[]>([]);
  const [partiesLoading, setPartiesLoading] = useState<boolean>(false);
  const [partiesError, setPartiesError] = useState<string | null>(null);

  const fetchComplaintData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(false);
    setNotFound(false);
    setTimelineError(null);
    setEvidenceError(null);
    setReporterLocationError(null);
    setReporterLocationDenied(false);
    try {
      const detailRes = await complaintApi.getComplaintDetail(id, {
        loadEvidence: canViewEvidence,
        loadReporterLocation: true,
      });

      if (!detailRes || !detailRes.complaint) {
        setNotFound(true);
      } else {
        setComplaint(detailRes.complaint);
        setTimeline(detailRes.timeline || []);
        setTimelineError(detailRes.timelineError || null);
        setEvidenceError(detailRes.evidenceError || null);
        setReporterLocation(detailRes.reporterLocation || detailRes.complaint.reporterDeviceLocation || null);
        setReporterLocationError(detailRes.reporterLocationError || null);
        setReporterLocationDenied(Boolean(detailRes.reporterLocationPermissionDenied));
      }
    } catch (err) {
      console.error('Failed to fetch complaint detail:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id, canViewEvidence]);

  const fetchParties = useCallback(async () => {
    if (!id) return;
    setPartiesLoading(true);
    setPartiesError(null);
    try {
      setParties(await getComplaintParties(id));
    } catch (err: any) {
      setPartiesError(err?.message || 'Failed to load mentioned-party information.');
    } finally {
      setPartiesLoading(false);
    }
  }, [id]);

  const handleRetryTimeline = useCallback(async () => {
    if (!id) return;
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const res = await complaintApi.getComplaintTimeline(id);
      setTimeline(res || []);
    } catch {
      setTimelineError('Failed to load complaint timeline.');
    } finally {
      setTimelineLoading(false);
    }
  }, [id]);

  const handleRetryReporterLocation = useCallback(async () => {
    if (!id) return;
    setReporterLocationLoading(true);
    setReporterLocationError(null);
    setReporterLocationDenied(false);
    try {
      const res = await complaintApi.getComplaintReporterLocation(id);
      if (res.error) {
        setReporterLocationError(res.error);
        setReporterLocationDenied(Boolean(res.isPermissionDenied));
      } else {
        setReporterLocation(res.data);
        if (complaint && res.data) {
          setComplaint({
            ...complaint,
            reporterDeviceLocation: res.data,
          });
        }
      }
    } catch (err: any) {
      setReporterLocationError(err?.message || 'Failed to reload reporter device location.');
    } finally {
      setReporterLocationLoading(false);
    }
  }, [id, complaint]);

  const handleComplaintUpdated = useCallback(
    (
      updatedComplaint: Complaint,
      updatedTimeline?: ComplaintTimelineEvent[],
      newTimelineError?: string | null
    ) => {
      setComplaint((prev) => ({
        ...(prev || {}),
        ...updatedComplaint,
        media:
          updatedComplaint.media && updatedComplaint.media.length > 0
            ? updatedComplaint.media
            : prev?.media || [],
      }));

      if (updatedTimeline !== undefined) {
        setTimeline(updatedTimeline);
        setTimelineError(newTimelineError || null);
      }
    },
    []
  );

  // Reset complaint state when navigating to a different complaint ID
  useEffect(() => {
    setComplaint(null);
    setTimeline([]);
    setTimelineError(null);
    setEvidenceError(null);
    setReporterLocation(null);
    setReporterLocationError(null);
    setReporterLocationDenied(false);
    setParties([]);
    setPartiesError(null);
    setNotFound(false);
    setLoadError(false);
  }, [id]);

  useEffect(() => {
    fetchComplaintData();
    fetchParties();
  }, [fetchComplaintData, fetchParties]);

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

  // 1. Initial Loading Skeleton State
  if (loading && !complaint) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
            <div className="h-7 w-64 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          </div>
          <div className="h-9 w-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        </div>

        <div className="h-36 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
            <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
          </div>
          <div className="lg:col-span-4 space-y-6">
            <div className="h-48 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
            <div className="h-80 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // 2. Genuine Not Found State (404)
  if (notFound && !complaint) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={isBn ? 'অভিযোগ পাওয়া যায়নি' : 'Complaint Not Found'}
          backButton={{
            label: isBn ? 'অভিযোগ তালিকায় ফিরুন' : 'Back to Complaints',
            onClick: () => navigate('/complaints'),
          }}
        />
        <Card variant="default">
          <CardContent className="py-12">
            <EmptyState
              title={isBn ? `আইডি "${id}" এর কোনো অভিযোগ নেই` : `No Complaint Found with ID: "${id}"`}
              description={
                isBn
                  ? 'এই আইডির অভিযোগটি পাওয়া যায়নি। অভিযোগটি মুছে ফেলা হয়েছে অথবা আর্কাইভ করা হয়েছে।'
                  : 'The requested complaint does not exist in the platform registry or has been archived.'
              }
              icon={FileQuestion}
              action={
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate('/complaints')}
                    leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
                  >
                    <span>{isBn ? 'অভিযোগের তালিকায় যান' : 'Go to Complaints List'}</span>
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // 3. Recoverable Initial Load Error State
  if (loadError && !complaint) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={isBn ? 'অভিযোগ লোড করা যায়নি' : 'Couldn’t load complaint'}
          backButton={{
            label: isBn ? 'অভিযোগ তালিকায় ফিরুন' : 'Back to Complaints',
            onClick: () => navigate('/complaints'),
          }}
        />
        <Card variant="default">
          <CardContent className="py-12">
            <EmptyState
              title={isBn ? 'অভিযোগের তথ্য লোড করা যায়নি' : 'Complaint data could not be loaded'}
              description={
                isBn
                  ? 'অভিযোগটি লোড করতে সমস্যা হয়েছে। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।'
                  : 'There was a problem loading this complaint. Check the connection and try again.'
              }
              icon={AlertTriangle}
              action={
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate('/complaints')}
                    leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
                  >
                    <span>{isBn ? 'অভিযোগ তালিকায় ফিরুন' : 'Back to Complaints'}</span>
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={fetchComplaintData}
                    disabled={loading}
                    leftIcon={<RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
                  >
                    <span>{isBn ? 'আবার চেষ্টা করুন' : 'Retry'}</span>
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!complaint) return null;

  const statusCfg = statusBadgeMap[complaint.status] || {
    badgeStatus: 'default',
    labelEn: complaint.status,
    labelBn: complaint.status,
  };

  return (
    <div className="space-y-6 pb-24 sm:pb-8">
      {/* 1. Page Header with Back Button and Quick Actions */}
      <PageHeader
        title={
          isBn
            ? `অভিযোগ ট্রায়াজ ও বিবরণ: ${complaint.id}`
            : `Complaint Inspection: ${complaint.id}`
        }
        description={
          isBn
            ? 'নাগরিক প্রমাণের অখণ্ডতা যাচাই, বিভাগীয় প্রতিক্রিয়া এবং অডিট ট্রেইল'
            : 'Detailed evidentiary inspection, verification status, and administrative action workflow'
        }
        backButton={{
          label: isBn ? 'অভিযোগ তালিকায় ফিরুন' : 'Back to Complaints',
          onClick: () => navigate('/complaints'),
        }}
        actions={
          <div className="flex items-center gap-2">
            <Badge status={statusCfg.badgeStatus} size="md" dot>
              {isBn ? statusCfg.labelBn : statusCfg.labelEn}
            </Badge>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                fetchComplaintData();
                fetchParties();
              }}
              disabled={loading || partiesLoading}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading || partiesLoading ? 'animate-spin' : ''}`} />}
              aria-label="Refresh complaint"
            >
              <span className="hidden sm:inline">{isBn ? 'রিফ্রেশ' : 'Refresh'}</span>
            </Button>
          </div>
        }
      />

      {/* Recoverable Reload Error Banner */}
      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-200"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold">
                {isBn ? 'সর্বশেষ তথ্য আপডেট করা যায়নি' : 'Couldn’t refresh complaint'}
              </h3>
              <p className="text-xs text-rose-700 dark:text-rose-300">
                {isBn
                  ? 'সর্বশেষ তথ্য লোড করা যায়নি। পূর্বে লোড করা তথ্য প্রদর্শিত হচ্ছে।'
                  : 'The latest details could not be reloaded. Previously loaded data is still shown.'}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchComplaintData}
            disabled={loading}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
            className="shrink-0 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900/40"
          >
            <span>{isBn ? 'আবার চেষ্টা করুন' : 'Retry'}</span>
          </Button>
        </div>
      )}

      {/* 2. Complaint Summary Card (Full Width) */}
      <ComplaintSummaryCard complaint={complaint} />

      {/* 3. Two-Column Desktop & Tablet Layout (Stacked on Mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols on desktop): Narrative, Version History, Evidence, Location */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          {/* Complaint Description & Reporter Info */}
          <ComplaintInfoSection complaint={complaint} />

          {/* Mentioned People & Organizations */}
          <ComplaintPartiesCard
            parties={parties}
            loading={partiesLoading}
            error={partiesError}
            onRetry={fetchParties}
          />

          {/* Version / Revision History if edited */}
          <ComplaintVersionHistory complaint={complaint} />

          {/* Evidence Media Viewer */}
          <ComplaintMediaViewer
            media={complaint.media}
            error={evidenceError}
            onRetry={fetchComplaintData}
          />

          {/* Location & Jurisdictional Area (Incident Location + Reporter Device Location) */}
          <ComplaintLocationCard
            location={complaint.location}
            reporterDeviceLocation={reporterLocation || complaint.reporterDeviceLocation}
            reporterLocationLoading={reporterLocationLoading}
            reporterLocationError={reporterLocationError}
            reporterLocationPermissionDenied={reporterLocationDenied}
            onRetryReporterLocation={handleRetryReporterLocation}
          />
        </div>

        {/* Right Column (4-5 cols on desktop): Action Area & Lifecycle Timeline */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-6 lg:sticky lg:top-20">
          {/* Administrative Action Control Area */}
          <ComplaintActionArea
            complaint={complaint}
            onComplaintUpdated={handleComplaintUpdated}
          />

          {/* Audit Trail & Lifecycle History */}
          {timelineError !== null ? (
            <Card variant="default" className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>{isBn ? 'কার্যক্রম ও অডিট টাইমলাইন' : 'Audit Trail & Lifecycle History'}</span>
                </CardTitle>
                <span className="text-xs text-rose-500 font-medium">
                  {isBn ? 'ত্রুটি' : 'Error'}
                </span>
              </CardHeader>
              <CardContent className="pt-4">
                <div
                  role="alert"
                  className="p-4 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <h4 className="text-sm font-semibold">
                        {isBn ? 'টাইমলাইন লোড করা যায়নি' : 'Timeline could not be loaded'}
                      </h4>
                      <p className="text-xs text-rose-700 dark:text-rose-300">
                        {isBn
                          ? 'অভিযোগের ইতিহাস সাময়িকভাবে পাওয়া যাচ্ছে না।'
                          : 'Complaint history is temporarily unavailable.'}
                      </p>
                    </div>
                  </div>
                  <div className="pt-1 flex justify-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleRetryTimeline}
                      disabled={timelineLoading}
                      leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${timelineLoading ? 'animate-spin' : ''}`} />}
                      className="border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900/40"
                    >
                      <span>{isBn ? 'টাইমলাইন আবার লোড করুন' : 'Retry Timeline'}</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <ComplaintTimeline timeline={timeline} />
          )}
        </div>
      </div>
    </div>
  );
};

export default ComplaintDetailPage;
