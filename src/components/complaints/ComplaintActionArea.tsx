import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { Complaint, ComplaintTimelineEvent, ComplaintUrgency } from '@/types/Complaint';
import { complaintApi } from '@/services';
import {
  getAvailableComplaintActions,
  getComplaintStatusGuidance,
  ComplaintActionConfig,
  ComplaintActionId,
} from '@/utils/complaintActions';
import {
  ShieldAlert,
  Edit,
  XCircle,
  Share2,
  EyeOff,
  Info,
  Check,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { cn } from '@/utils';

export interface ComplaintActionAreaProps {
  complaint: Complaint;
  className?: string;
  onComplaintUpdated?: (
    complaint: Complaint,
    timeline: ComplaintTimelineEvent[],
    timelineError?: string | null
  ) => void;
}

type ActionModalType = ComplaintActionId | null;

const CATEGORIES = [
  { value: 'harassment', labelEn: 'Harassment & Abuse', labelBn: 'হয়রানি ও নির্যাতন' },
  { value: 'rickshaw', labelEn: 'Illegal Auto-Rickshaw Charging', labelBn: 'অবৈধ অটো চার্জিং' },
  { value: 'extortion', labelEn: 'Extortion', labelBn: 'চাঁদাবাজি' },
  { value: 'load_shedding', labelEn: 'Utility Service Complaints', labelBn: 'ইউটিলিটি সেবা অভিযোগ' },
];

const SUBCATEGORIES: Record<string, { value: string; labelEn: string; labelBn: string }[]> = {
  harassment: [
    { value: 'rape-sexual-violence', labelEn: 'Rape / Sexual Violence', labelBn: 'ধর্ষণ / যৌন সহিংসতা' },
    { value: 'sexual-harassment', labelEn: 'Sexual Harassment', labelBn: 'যৌন হয়রানি' },
    { value: 'domestic-violence', labelEn: 'Domestic Violence', labelBn: 'পারিবারিক সহিংসতা' },
    { value: 'blackmail-coercion', labelEn: 'Blackmailing / Coercion', labelBn: 'ব্ল্যাকমেইল / জবরদস্তি' },
    { value: 'honeytrap', labelEn: 'Honeytrap', labelBn: 'হানিট্র্যাপ' },
  ],
  rickshaw: [
    { value: 'charging-station-location', labelEn: 'Illegal Auto-Rickshaw Charging', labelBn: 'অবৈধ অটো চার্জিং' },
  ],
  extortion: [
    { value: 'shop-business', labelEn: 'Shops & Businesses', labelBn: 'দোকান ও ব্যবসা' },
    { value: 'transport-movement', labelEn: 'Transport & Transit', labelBn: 'পরিবহন ও চলাচল' },
    { value: 'construction-property', labelEn: 'Construction & Property', labelBn: 'নির্মাণ ও সম্পত্তি' },
    { value: 'threat-money-demand', labelEn: 'Threats & Demands', labelBn: 'হুমকি ও টাকা দাবি' },
    { value: 'extortion-other', labelEn: 'Other Extortion', labelBn: 'অন্যান্য চাঁদাবাজি' },
  ],
  load_shedding: [
    { value: 'load-shedding-outage', labelEn: 'Load Shedding', labelBn: 'লোডশেডিং' },
    { value: 'gas-shortage', labelEn: 'Gas Shortage', labelBn: 'গ্যাস সংকট' },
    { value: 'excess-electricity-bill', labelEn: 'Excess Electricity Bill', labelBn: 'অতিরিক্ত বিদ্যুৎ বিল' },
  ],
};

export const ComplaintActionArea: React.FC<ComplaintActionAreaProps> = ({
  complaint,
  className,
  onComplaintUpdated,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const [activeModal, setActiveModal] = useState<ActionModalType>(null);
  const [actionNotes, setActionNotes] = useState<string>('');
  const [rejectReason, setRejectReason] = useState<string>('duplicate');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  // Edit Complaint Form State
  const [editTitleEn, setEditTitleEn] = useState(complaint.titleEn || '');
  const [editTitleBn, setEditTitleBn] = useState(complaint.titleBn || '');
  const [editDescEn, setEditDescEn] = useState(complaint.descriptionEn || '');
  const [editDescBn, setEditDescBn] = useState(complaint.descriptionBn || '');
  const [editCategoryId, setEditCategoryId] = useState(complaint.categoryId || 'harassment');
  const [editSubcategoryId, setEditSubcategoryId] = useState(complaint.subcategoryId || '');
  const [editUrgency, setEditUrgency] = useState<ComplaintUrgency>(complaint.urgency || 'medium');
  const [editWard, setEditWard] = useState(complaint.location?.ward || '');
  const [editZone, setEditZone] = useState(complaint.location?.zone || '');
  const [editAddressEn, setEditAddressEn] = useState(complaint.location?.addressEn || '');
  const [editAddressBn, setEditAddressBn] = useState(complaint.location?.addressBn || '');
  const [editNotes, setEditNotes] = useState('');

  const initEditForm = (comp: Complaint) => {
    setEditTitleEn(comp.titleEn || '');
    setEditTitleBn(comp.titleBn || '');
    setEditDescEn(comp.descriptionEn || '');
    setEditDescBn(comp.descriptionBn || '');
    setEditCategoryId(comp.categoryId || 'harassment');
    setEditSubcategoryId(comp.subcategoryId || '');
    setEditUrgency(comp.urgency || 'medium');
    setEditWard(comp.location?.ward || '');
    setEditZone(comp.location?.zone || '');
    setEditAddressEn(comp.location?.addressEn || '');
    setEditAddressBn(comp.location?.addressBn || '');
    setEditNotes('');
  };

  useEffect(() => {
    initEditForm(complaint);
  }, [complaint]);

  // Available actions strictly derived from centralized status rule function
  const availableActions = getAvailableComplaintActions(complaint.status);
  const statusGuidance = getComplaintStatusGuidance(complaint.status, language);

  const { hasPermission, hasAnyPermission } = useAuth();

  // Filter actions based on effective assigned permissions
  const isActionPermitted = (actionId: ComplaintActionId) => {
    switch (actionId) {
      case 'publish':
        return hasPermission('complaints.publish');
      case 'unpublish':
        return hasPermission('complaints.unpublish');
      case 'reject':
        return hasPermission('complaints.reject');
      case 'edit':
        return hasAnyPermission(['complaints.publish', 'complaints.unpublish', 'complaints.reject']);
      default:
        return false;
    }
  };

  const permittedActions = availableActions.filter((action) => isActionPermitted(action.id));

  const closeModal = () => {
    if (isSubmitting) return;
    setActiveModal(null);
    setActionNotes('');
    setActionError(null);
  };

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setFeedbackToast({ type, message });
    setTimeout(() => {
      setFeedbackToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  // 0. Handle Edit Complaint
  const handleSaveEdit = async () => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      const selectedCategory = CATEGORIES.find((c) => c.value === editCategoryId);
      const subs = SUBCATEGORIES[editCategoryId] || [];
      const selectedSub = subs.find((s) => s.value === editSubcategoryId) || subs[0];

      const updates: Partial<Complaint> = {
        titleEn: editTitleEn.trim() || complaint.titleEn,
        titleBn: editTitleBn.trim() || complaint.titleBn,
        descriptionEn: editDescEn.trim() || complaint.descriptionEn,
        descriptionBn: editDescBn.trim() || complaint.descriptionBn,
        categoryId: editCategoryId,
        categoryEn: selectedCategory?.labelEn || complaint.categoryEn,
        categoryBn: selectedCategory?.labelBn || complaint.categoryBn,
        subcategoryId: selectedSub ? selectedSub.value : editSubcategoryId,
        subcategoryEn: selectedSub ? selectedSub.labelEn : complaint.subcategoryEn,
        subcategoryBn: selectedSub ? selectedSub.labelBn : complaint.subcategoryBn,
        urgency: editUrgency,
        location: {
          ...complaint.location,
          ward: editWard.trim(),
          zone: editZone.trim(),
          addressEn: editAddressEn || complaint.location?.addressEn || '',
          addressBn: editAddressBn || complaint.location?.addressBn || '',
        },
      };

      const result = await complaintApi.editComplaint(complaint.id, updates, editNotes);
      showToast(isBn ? result.messageBn : result.messageEn, 'success');
      if (onComplaintUpdated) {
        onComplaintUpdated(result.complaint, result.timeline, result.timelineError || null);
      }
      closeModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update complaint';
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Handle Reject
  const handleReject = async () => {
    if (!actionNotes.trim()) {
      setActionError(
        isBn
          ? 'অনুগ্রহ করে বাতিলের বিস্তারিত কারণ উল্লেখ করুন।'
          : 'Please enter a clear explanation for rejecting this complaint.'
      );
      return;
    }
    setIsSubmitting(true);
    setActionError(null);
    try {
      const result = await complaintApi.rejectComplaint(
        complaint.id,
        rejectReason,
        actionNotes
      );
      showToast(isBn ? result.messageBn : result.messageEn, 'info');
      if (onComplaintUpdated) {
        const preservedComplaint = {
          ...result.complaint,
          media: (result.complaint.media && result.complaint.media.length > 0)
            ? result.complaint.media
            : complaint.media,
        };
        onComplaintUpdated(preservedComplaint, result.timeline, result.timelineError || null);
      }
      closeModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reject complaint';
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Handle Publish
  const handlePublish = async () => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      const result = await complaintApi.publishComplaint(complaint.id);
      showToast(isBn ? result.messageBn : result.messageEn, 'success');
      if (onComplaintUpdated) {
        const preservedComplaint = {
          ...result.complaint,
          media: (result.complaint.media && result.complaint.media.length > 0)
            ? result.complaint.media
            : complaint.media,
        };
        onComplaintUpdated(preservedComplaint, result.timeline, result.timelineError || null);
      }
      closeModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish complaint';
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Handle Unpublish
  const handleUnpublish = async () => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      const result = await complaintApi.unpublishComplaint(complaint.id);
      showToast(isBn ? result.messageBn : result.messageEn, 'info');
      if (onComplaintUpdated) {
        const preservedComplaint = {
          ...result.complaint,
          media: (result.complaint.media && result.complaint.media.length > 0)
            ? result.complaint.media
            : complaint.media,
        };
        onComplaintUpdated(preservedComplaint, result.timeline, result.timelineError || null);
      }
      closeModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to unpublish complaint';
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Icon resolver for action buttons
  const renderActionIcon = (iconName: ComplaintActionConfig['iconName']) => {
    switch (iconName) {
      case 'Edit':
        return <Edit className="w-4 h-4 text-white" />;
      case 'Share2':
        return <Share2 className="w-4 h-4 text-white" />;
      case 'EyeOff':
        return <EyeOff className="w-4 h-4 text-slate-600 dark:text-slate-300" />;
      case 'XCircle':
        return <XCircle className="w-4 h-4 text-white" />;
      default:
        return null;
    }
  };

  return (
    <>
      <Card variant="default" className={cn('overflow-hidden', className)}>
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span>{isBn ? 'প্রশাসনিক ট্রায়াজ ও অ্যাকশন কন্ট্রোল' : 'Administrative Triage & Actions'}</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Status Context Helper with Dynamic Guidance */}
          {statusGuidance && (
            <div className="p-3 rounded-lg bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-900/60 text-xs text-sky-900 dark:text-sky-200 flex items-start gap-2">
              <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold">
                  {isBn ? 'বর্তমান স্ট্যাটাস নির্দেশিকা:' : 'Status Transition Guidance:'}
                </span>
                <p className="text-sky-800 dark:text-sky-300">
                  {statusGuidance}
                </p>
              </div>
            </div>
          )}

          {/* Feedback Toast/Banner */}
          {feedbackToast && (
            <div
              className={cn(
                'p-3 rounded-lg border text-xs flex items-center gap-2 animate-in fade-in transition-all',
                feedbackToast.type === 'success' &&
                  'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200',
                feedbackToast.type === 'info' &&
                  'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
                feedbackToast.type === 'error' &&
                  'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              )}
            >
              {feedbackToast.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : feedbackToast.type === 'info' ? (
                <Info className="w-4 h-4 text-blue-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span className="font-medium">{feedbackToast.message}</span>
            </div>
          )}

          {/* Action Buttons Matrix */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {isBn ? 'উপলব্ধ ট্রায়াজ পদক্ষেপসমূহ' : 'Available Operational Actions'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {isBn ? 'রিয়েল-টাইম অডিট' : 'Audit-Ready'}
              </span>
            </div>

            {/* Dynamic Button Rendering Driven by Central Rule Function and Permissions */}
            {permittedActions.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {permittedActions.map((action) => (
                  <Button
                    key={action.id}
                    variant={action.variant}
                    size="sm"
                    onClick={() => {
                      if (action.id === 'edit') {
                        initEditForm(complaint);
                      }
                      setActiveModal(action.id);
                    }}
                    leftIcon={renderActionIcon(action.iconName)}
                    className={cn(
                      'justify-start h-9 text-xs',
                      action.id === 'publish' && 'bg-sky-600 hover:bg-sky-700 text-white shadow-xs',
                      permittedActions.length === 1 && 'col-span-full'
                    )}
                  >
                    <span>{isBn ? action.labelBn : action.labelEn}</span>
                  </Button>
                ))}
              </div>
            ) : availableActions.length > 0 ? (
              <div className="p-3 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200/60 dark:border-slate-800 flex items-center justify-center gap-2">
                <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  {isBn
                    ? 'আপনার ভূমিকা অনুযায়ী পদক্ষেপ গ্রহণের অনুমতি নেই (শুধুমাত্র দর্শনযোগ্য)।'
                    : 'Your role has read-only access. No triage actions permitted.'}
                </span>
              </div>
            ) : (
              <div className="p-3 text-center text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200/60 dark:border-slate-800">
                {isBn
                  ? 'বর্তমান স্ট্যাটাসে কোনো সরাসরি ট্রায়াজ পদক্ষেপ অবশিষ্ট নেই।'
                  : 'No active triage actions required for the current lifecycle status.'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Confirmation & Data-Entry Modals */}

      {/* 0. Edit Complaint Modal */}
      <Modal
        isOpen={activeModal === 'edit'}
        onClose={closeModal}
        title={isBn ? 'অভিযোগের বিবরণ সম্পাদনা' : 'Edit Complaint Details'}
        description={
          isBn
            ? `অভিযোগ নম্বর ${complaint.id} এর শিরোনাম, বিবরণ, ক্যাটাগরি ও লোকেশন তথ্য আপডেট করুন।`
            : `Update complaint ${complaint.id} details, classification, urgency, or location.`
        }
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="ghost" size="sm" onClick={closeModal} disabled={isSubmitting}>
              <span>{isBn ? 'বাতিল' : 'Cancel'}</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              onClick={handleSaveEdit}
              leftIcon={<Check className="w-3.5 h-3.5" />}
            >
              <span>{isBn ? 'সংরক্ষণ করুন' : 'Save Changes'}</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {actionError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-md text-xs text-rose-700 dark:text-rose-300">
              {actionError}
            </div>
          )}

          {/* Titles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={isBn ? 'শিরোনাম (বাংলা)' : 'Title (Bangla)'}
              value={editTitleBn}
              onChange={(e) => setEditTitleBn(e.target.value)}
              placeholder="অভিযোগের শিরোনাম বাংলায়..."
              disabled={isSubmitting}
            />
            <Input
              label={isBn ? 'শিরোনাম (ইংরেজি)' : 'Title (English)'}
              value={editTitleEn}
              onChange={(e) => setEditTitleEn(e.target.value)}
              placeholder="Title in English..."
              disabled={isSubmitting}
            />
          </div>

          {/* Category & Subcategory */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label={isBn ? 'ক্যাটাগরি / বিভাগ' : 'Category'}
              value={editCategoryId}
              onChange={(e) => {
                const newCat = e.target.value;
                setEditCategoryId(newCat);
                const availableSubs = SUBCATEGORIES[newCat] || [];
                setEditSubcategoryId(availableSubs[0]?.value || '');
              }}
              options={CATEGORIES.map((c) => ({
                value: c.value,
                label: isBn ? c.labelBn : c.labelEn,
              }))}
              disabled={isSubmitting}
            />

            <Select
              label={isBn ? 'সাবক্যাটাগরি' : 'Subcategory'}
              value={editSubcategoryId}
              onChange={(e) => setEditSubcategoryId(e.target.value)}
              options={(SUBCATEGORIES[editCategoryId] || []).map((s) => ({
                value: s.value,
                label: isBn ? s.labelBn : s.labelEn,
              }))}
              disabled={isSubmitting}
            />
          </div>

          {/* Urgency & Incident Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label={isBn ? 'জরুরিতা / প্রায়োরিটি' : 'Urgency Priority'}
              value={editUrgency}
              onChange={(e) => setEditUrgency(e.target.value as ComplaintUrgency)}
              options={[
                { value: 'low', label: isBn ? 'নিম্ন (Low)' : 'Low' },
                { value: 'medium', label: isBn ? 'মাঝারি (Medium)' : 'Medium' },
                { value: 'high', label: isBn ? 'উচ্চ (High)' : 'High' },
                { value: 'urgent', label: isBn ? 'জরুরি (Urgent)' : 'Urgent' },
              ]}
              disabled={isSubmitting}
            />

            <Input
              label={isBn ? 'উপজেলা / থানা' : 'Upazila / Thana'}
              value={editWard}
              onChange={(e) => setEditWard(e.target.value)}
              placeholder={isBn ? 'উপজেলা বা থানার নাম...' : 'Upazila or thana...'}
              disabled={isSubmitting}
            />
          </div>

          {/* Address & District */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={isBn ? 'জেলা' : 'District'}
              value={editZone}
              onChange={(e) => setEditZone(e.target.value)}
              placeholder={isBn ? 'জেলার নাম...' : 'District...'}
              disabled={isSubmitting}
            />
            <Input
              label={isBn ? 'ঠিকানা (বাংলা)' : 'Address (Bangla)'}
              value={editAddressBn}
              onChange={(e) => setEditAddressBn(e.target.value)}
              placeholder="ঠিকানা বাংলায়..."
              disabled={isSubmitting}
            />
          </div>

          <Input
            label={isBn ? 'ঠিকানা (ইংরেজি)' : 'Address (English)'}
            value={editAddressEn}
            onChange={(e) => setEditAddressEn(e.target.value)}
            placeholder="Address in English..."
            disabled={isSubmitting}
          />

          {/* Descriptions */}
          <div className="space-y-3">
            <Textarea
              label={isBn ? 'বিস্তারিত বিবরণ (বাংলা)' : 'Description (Bangla)'}
              value={editDescBn}
              onChange={(e) => setEditDescBn(e.target.value)}
              placeholder="অভিযোগের বিস্তারিত বিবরণ বাংলায়..."
              rows={3}
              disabled={isSubmitting}
            />
            <Textarea
              label={isBn ? 'বিস্তারিত বিবরণ (ইংরেজি)' : 'Description (English)'}
              value={editDescEn}
              onChange={(e) => setEditDescEn(e.target.value)}
              placeholder="Detailed description in English..."
              rows={3}
              disabled={isSubmitting}
            />
          </div>

          {/* Remarks */}
          <Textarea
            label={isBn ? 'প্রশাসনিক নোট / মন্তব্যের সারাংশ (ঐচ্ছিক)' : 'Audit Note / Remarks (Optional)'}
            placeholder={
              isBn
                ? 'সম্পাদনার কারণ বা প্রশাসনিক মন্তব্য লিখুন...'
                : 'Enter remarks or justification for this change...'
            }
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            rows={2}
            disabled={isSubmitting}
          />
        </div>
      </Modal>

      {/* 2. Reject Complaint Modal */}
      <Modal
        isOpen={activeModal === 'reject'}
        onClose={closeModal}
        title={isBn ? 'অভিযোগ বাতিল নিশ্চিতকরণ' : 'Reject Complaint'}
        description={
          isBn
            ? `অভিযোগ ${complaint.id} বাতিল করা হচ্ছে। বাতিলের কারণ নির্বাচন করুন।`
            : `Mark complaint ${complaint.id} as rejected with auditable justification.`
        }
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="ghost" size="sm" onClick={closeModal} disabled={isSubmitting}>
              <span>{isBn ? 'বাতিল' : 'Cancel'}</span>
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={isSubmitting}
              onClick={handleReject}
              leftIcon={<XCircle className="w-3.5 h-3.5" />}
            >
              <span>{isBn ? 'বাতিল নিশ্চিত করুন' : 'Confirm Rejection'}</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {actionError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-md text-xs text-rose-700 dark:text-rose-300">
              {actionError}
            </div>
          )}

          <Select
            label={isBn ? 'বাতিলের কারণ নির্বাচন করুন *' : 'Rejection Reason *'}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            options={[
              {
                value: 'duplicate',
                label: isBn ? 'ডুপ্লিকেট / একই বিষয়ের পুনরাবৃত্তি' : 'Duplicate Complaint',
              },
              {
                value: 'out_of_jurisdiction',
                label: isBn ? 'সিটি কর্পোরেশন / প্ল্যাটফর্মের আওতা বহির্ভূত' : 'Out of Jurisdiction',
              },
              {
                value: 'insufficient_evidence',
                label: isBn ? 'অপর্যাপ্ত বা ভুয়া প্রমাণাদি' : 'Insufficient / Fake Evidence',
              },
              {
                value: 'inappropriate_content',
                label: isBn ? 'নীতিমালা পরিপন্থী বা অসংলগ্ন তথ্য' : 'Inappropriate / Policy Violation',
              },
              {
                value: 'other',
                label: isBn ? 'অন্যান্য সুনির্দিষ্ট কারণ' : 'Other Specific Reason',
              },
            ]}
            disabled={isSubmitting}
          />

          <Textarea
            label={isBn ? 'বাতিলের বিশদ ব্যাখ্যা *' : 'Rejection Explanation *'}
            placeholder={
              isBn
                ? 'নাগরিকের অবগতির জন্য বাতিলের সুনির্দিষ্ট কারণ লিখুন...'
                : 'Provide a clear explanation for the citizen and audit record...'
            }
            value={actionNotes}
            onChange={(e) => setActionNotes(e.target.value)}
            rows={3}
            disabled={isSubmitting}
            required
          />
        </div>
      </Modal>

      {/* 3. Publish to Feed Modal */}
      <Modal
        isOpen={activeModal === 'publish'}
        onClose={closeModal}
        title={isBn ? 'পাবলিক ফিডে প্রকাশ' : 'Publish Complaint to Feed'}
        description={
          isBn
            ? `অভিযোগ ${complaint.id} উন্মুক্ত নাগরিক ফিডে প্রচারের জন্য প্রকাশ করুন।`
            : `Broadcast complaint ${complaint.id} on the public feed for community awareness.`
        }
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="ghost" size="sm" onClick={closeModal} disabled={isSubmitting}>
              <span>{isBn ? 'বাতিল' : 'Cancel'}</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              onClick={handlePublish}
              leftIcon={<Share2 className="w-3.5 h-3.5" />}
              className="bg-sky-600 hover:bg-sky-700 text-white"
            >
              <span>{isBn ? 'পাবলিক ফিডে প্রকাশ করুন' : 'Publish Live'}</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {actionError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-md text-xs text-rose-700 dark:text-rose-300">
              {actionError}
            </div>
          )}
          <div className="p-3 bg-sky-50 dark:bg-sky-950/40 rounded-lg border border-sky-200 dark:border-sky-900 text-xs text-sky-800 dark:text-sky-300 space-y-1">
            <p className="font-semibold">
              {isBn ? 'ফিড পাবলিকেশন তথ্য:' : 'Public Feed Information:'}
            </p>
            <p>
              {isBn
                ? 'প্রকাশের পর অভিযোগটি পাবলিক ফিডে দৃশ্যমান হবে।'
                : 'After publishing, this complaint will become visible on the public feed.'}
            </p>
          </div>
        </div>
      </Modal>

      {/* 4. Unpublish Confirmation Modal */}
      <Modal
        isOpen={activeModal === 'unpublish'}
        onClose={closeModal}
        title={isBn ? 'অভিযোগের প্রকাশনা বন্ধ করবেন?' : 'Unpublish Complaint?'}
        description={
          isBn
            ? `অভিযোগ ${complaint.id} পাবলিক ফিড থেকে প্রত্যাহার করে অপ্রকাশিত অবস্থায় সংরক্ষণ করুন।`
            : `Remove complaint ${complaint.id} from the public feed and return it to Unpublished state.`
        }
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="ghost" size="sm" onClick={closeModal} disabled={isSubmitting}>
              <span>{isBn ? 'বাতিল' : 'Cancel'}</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              isLoading={isSubmitting}
              onClick={handleUnpublish}
              leftIcon={<EyeOff className="w-3.5 h-3.5" />}
            >
              <span>{isBn ? 'প্রকাশনা বন্ধ করুন' : 'Unpublish'}</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {actionError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-md text-xs text-rose-700 dark:text-rose-300">
              {actionError}
            </div>
          )}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 space-y-1">
            <p className="font-semibold">
              {isBn ? 'স্ট্যাটাস পরিবর্তন তথ্য:' : 'Status Transition Note:'}
            </p>
            <p>
              {isBn
                ? 'প্রকাশনা বন্ধের পর অভিযোগটি অপ্রকাশিত ট্যাবে সংরক্ষিত থাকবে। পরবর্তীতে প্রয়োজনে যে কোনো সময় পুনরায় পাবলিক ফিডে প্রকাশ করতে পারবেন।'
                : 'After unpublishing, this report remains safely archived in the Unpublished tab. You can republish it to the public feed at any time.'}
            </p>
          </div>
        </div>
      </Modal>

      {/* Mobile Fixed Bottom Action Bar: Driven dynamically by permittedActions */}
      {permittedActions.length > 0 && (
        <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] shadow-lg flex items-center gap-2">
          {permittedActions.map((action) => (
            <Button
              key={action.id}
              variant={action.variant}
              size="md"
              onClick={() => {
                if (action.id === 'edit') {
                  initEditForm(complaint);
                }
                setActiveModal(action.id);
              }}
              leftIcon={renderActionIcon(action.iconName)}
              className={cn(
                'flex-1 h-10 text-xs justify-center font-medium shadow-xs',
                action.id === 'publish' && 'bg-sky-600 hover:bg-sky-700 text-white'
              )}
            >
              <span>{isBn ? action.labelBn : action.labelEn}</span>
            </Button>
          ))}
        </div>
      )}
    </>
  );
};

export default ComplaintActionArea;
