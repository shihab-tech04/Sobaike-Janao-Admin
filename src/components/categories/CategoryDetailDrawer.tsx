import React, { useState } from 'react';
import {
  TaxonomySegment,
  TaxonomySubcategory,
  TaxonomySegmentNode,
  TaxonomyUpdateInput,
} from '@/types/Category';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { Drawer } from '@/components/ui/Drawer';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/Divider';
import { categoryApi } from '@/services/api/categoryApi';
import { CategoryEditModal } from './CategoryEditModal';
import { CategoryConfigurationModal } from './CategoryConfigurationModal';
import {
  Folder,
  Tag,
  CheckCircle2,
  XCircle,
  Hash,
  ArrowUpDown,
  Layers,
  Pencil,
  MoveRight,
  Send,
  ListChecks,
  SlidersHorizontal,
} from 'lucide-react';

export type DetailDrawerTarget =
  | { type: 'segment'; data: TaxonomySegmentNode }
  | { type: 'subcategory'; data: TaxonomySubcategory; parentSegment?: TaxonomySegment };

export interface CategoryDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  target: DetailDrawerTarget | null;
  allSegments?: TaxonomySegment[];
  onUpdated?: () => void;
  onOpenForm?: (subcategory: TaxonomySubcategory, parentActive: boolean) => void;
}

export const CategoryDetailDrawer: React.FC<CategoryDetailDrawerProps> = ({
  isOpen,
  onClose,
  target,
  allSegments = [],
  onUpdated,
  onOpenForm,
}) => {
  const { language } = useLanguage();
  const { hasPermission } = useAuth();
  const isBn = language === 'bn';
  const canManage = hasPermission('categories.manage');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [targetSegmentId, setTargetSegmentId] = useState('');
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  if (!target) return null;

  const isSegment = target.type === 'segment';

  const handleOpenEdit = () => {
    setSaveError(null);
    setIsEditOpen(true);
  };

  const handleCloseEdit = () => {
    if (isSaving) return;
    setIsEditOpen(false);
    setSaveError(null);
  };

  const handleSave = async (input: TaxonomyUpdateInput) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await categoryApi.updateTaxonomyItem(input);
      setIsEditOpen(false);
      onClose();
      onUpdated?.();
    } catch (error: any) {
      setSaveError(error?.message || 'Failed to update taxonomy.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMove = async () => {
    if (target.type !== 'subcategory' || !targetSegmentId || targetSegmentId === target.data.segmentId) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await categoryApi.moveSubcategory({
        subcategoryId: target.data.id,
        targetSegmentId,
        order: target.data.order,
      });
      setIsMoveOpen(false);
      onClose();
      onUpdated?.();
    } catch (error: any) {
      setSaveError(error?.message || 'Failed to move subcategory.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await categoryApi.publishTaxonomyItem(target.type, target.data.id);
      setPublishConfirm(false);
      onClose();
      onUpdated?.();
    } catch (error: any) {
      setSaveError(error?.message || 'Could not publish taxonomy item.');
    } finally { setIsSaving(false); }
  };

  return (
    <>
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={
        isSegment
          ? isBn
            ? 'বিভাগ বিবরণ'
            : 'Segment Details'
          : isBn
          ? 'সাব-ক্যাটাগরি বিবরণ'
          : 'Subcategory Details'
      }
      description={
        isSegment
          ? isBn
            ? 'পাবলিক রিপোর্টিং সেগমেন্টের বিস্তারিত তথ্য'
            : 'Operational details for this reporting segment'
          : isBn
          ? 'সাব-ক্যাটাগরির বিস্তারিত তথ্য'
          : 'Operational details for this reporting subcategory'
      }
      size="md"
      footer={
        canManage ? (
          <div className="flex gap-2 justify-end flex-wrap">
            <Button id="taxonomy-config-open" type="button" variant="secondary" onClick={() => setIsConfigOpen(true)}
              leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />} className="min-h-[44px]">
              {isBn ? 'কনফিগারেশন' : 'Configure'}
            </Button>
            {target.type === 'subcategory' && onOpenForm && <Button id="taxonomy-form-open" type="button" variant="secondary"
              onClick={() => onOpenForm(target.data, target.parentSegment?.status === 'active')}
              leftIcon={<ListChecks className="w-3.5 h-3.5" />} className="min-h-[44px]">
              {isBn ? 'ফর্ম বিল্ডার' : 'Form Builder'}
            </Button>}
            {target.data.status !== 'active' && <Button id="taxonomy-publish-open" type="button" variant="secondary"
              disabled={isSaving} onClick={() => { setSaveError(null); setPublishConfirm(true); }}
              leftIcon={<Send className="w-3.5 h-3.5" />} className="min-h-[44px]">
              {isBn ? 'পর্যালোচনা ও প্রকাশ' : 'Review & Publish'}
            </Button>}
            {target.type === 'subcategory' && allSegments.some((s) => s.id !== target.data.segmentId) && (
              <Button type="button" variant="secondary" onClick={() => {
                setSaveError(null);
                setTargetSegmentId('');
                setIsMoveOpen(true);
              }} leftIcon={<MoveRight className="w-3.5 h-3.5" />} className="min-h-[44px]">
                {isBn ? 'অন্য বিভাগে সরান' : 'Move to Category'}
              </Button>
            )}
            <Button type="button" variant="primary" onClick={handleOpenEdit}
              leftIcon={<Pencil className="w-3.5 h-3.5" />} className="min-h-[44px]">
              {isBn ? 'সম্পাদনা করুন' : 'Edit'}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {/* Header Summary Banner */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            {isSegment ? <Folder className="w-5 h-5" /> : <Tag className="w-5 h-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              {isBn ? target.data.nameBn : target.data.nameEn}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate">
              ID: {target.data.id}
            </p>
          </div>
          <Badge
            status={target.data.status === 'active' ? 'success' : 'default'}
            variant="subtle"
            size="sm"
            className="shrink-0"
          >
            {target.data.status === 'active' ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {isBn ? 'সক্রিয়' : 'Active'}
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                {isBn ? 'নিষ্ক্রিয়' : 'Inactive'}
              </span>
            )}
          </Badge>
        </div>

        {/* Detailed Metadata Grid */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {isBn ? 'সাধারণ বৈশিষ্ট্য' : 'Attributes'}
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* English Name */}
            <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 space-y-1">
              <span className="text-[11px] text-slate-400 block">
                {isBn ? 'ইংরেজি নাম (English)' : 'Name (English)'}
              </span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {target.data.nameEn}
              </span>
            </div>

            {/* Bangla Name */}
            <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 space-y-1">
              <span className="text-[11px] text-slate-400 block">
                {isBn ? 'বাংলা নাম (Bangla)' : 'Name (Bangla)'}
              </span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {target.data.nameBn}
              </span>
            </div>

            {/* Unique Slug/ID */}
            <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 space-y-1">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Hash className="w-3 h-3" />
                {isBn ? 'অনন্য শনাক্তকারী (ID)' : 'Unique Identifier (ID)'}
              </span>
              <span className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200">
                {target.data.id}
              </span>
            </div>

            {/* Sort Order */}
            <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 space-y-1">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" />
                {isBn ? 'প্রদর্শনের ক্রম (Sort Order)' : 'Sort Order'}
              </span>
              <span className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200">
                #{target.data.order}
              </span>
            </div>

            {/* Parent Segment (for Subcategories) */}
            {!isSegment && target.parentSegment && (
              <div className="sm:col-span-2 p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 space-y-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  {isBn ? 'মূল বিভাগ (Parent Segment)' : 'Parent Segment'}
                </span>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {isBn ? target.parentSegment.nameBn : target.parentSegment.nameEn}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {target.parentSegment.id}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Subcategories list (for Segment) */}
        {isSegment && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {isBn ? 'অন্তর্ভুক্ত সাব-ক্যাটাগরি' : 'Subcategories'}
              </h4>
              <Badge status="default" variant="outline" size="sm" className="font-mono text-[11px]">
                {target.data.subcategories?.length || 0}{' '}
                {isBn ? 'টি আইটেম' : 'items'}
              </Badge>
            </div>

            {target.data.subcategories && target.data.subcategories.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {target.data.subcategories.map((sub) => (
                  <div
                    key={sub.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {isBn ? sub.nameBn : sub.nameEn}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        {sub.id}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        status={sub.status === 'active' ? 'success' : 'default'}
                        variant="subtle"
                        size="sm"
                        className="text-[10px]"
                      >
                        {sub.status === 'active'
                          ? isBn
                            ? 'সক্রিয়'
                            : 'Active'
                          : isBn
                          ? 'নিষ্ক্রিয়'
                          : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 text-center text-xs text-slate-400">
                {isBn ? 'কোনো সাব-ক্যাটাগরি নেই।' : 'No subcategories.'}
              </div>
            )}
          </div>
        )}

        <Divider />

        {/* Read-Only Notice */}
        {saveError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{saveError}</p>}
        <div className="text-[11px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl">
          {canManage
            ? isBn
              ? 'শ্রেণিবিন্যাসের তথ্য সরাসরি সুপাবেজ ডেটাবেসের সাথে সমন্বিত। অনুমোদিত পরিবর্তন পাবলিক রিপোর্টিং অপশনে প্রযোজ্য হবে।'
              : 'Taxonomy is synchronized directly with Supabase. Authorized changes apply to public reporting options.'
            : isBn
            ? 'শ্রেণিবিন্যাসের তথ্য সরাসরি সুপাবেজ (Supabase) ডেটাবেস থেকে রীড-অনলি মোডে লোড করা হয়েছে।'
            : 'Taxonomy configuration is synchronized directly from Supabase database tables in read-only mode.'}
        </div>
      </div>
    </Drawer>

    <CategoryEditModal
      isOpen={isEditOpen}
      itemType={target.type}
      item={target.data}
      isSaving={isSaving}
      error={saveError}
      onClose={handleCloseEdit}
      onSave={handleSave}
    />
    <CategoryConfigurationModal itemType={target.type} itemId={isConfigOpen ? target.data.id : null}
      onClose={() => setIsConfigOpen(false)} onSaved={() => onUpdated?.()} />
    <Modal isOpen={publishConfirm} onClose={isSaving ? () => {} : () => setPublishConfirm(false)}
      title={isBn ? 'প্রকাশ নিশ্চিত করুন' : 'Confirm taxonomy publication'} size="md"
      footer={<div className="flex gap-2 justify-end w-full">
        <Button variant="secondary" disabled={isSaving} onClick={() => setPublishConfirm(false)}>{isBn ? 'বাতিল' : 'Cancel'}</Button>
        <Button id="taxonomy-publish-confirm" variant="primary" isLoading={isSaving} disabled={isSaving} onClick={handlePublish}>{isBn ? 'প্রকাশ করুন' : 'Publish'}</Button>
      </div>}>
      <p className="text-sm">{isBn
        ? 'প্রকাশের আগে সার্ভার ফর্ম, ক্যাটাগরি এবং ব্যানারের প্রস্তুতি যাচাই করবে। অসম্পূর্ণ থাকলে প্রকাশ করা হবে না।'
        : 'The server checks the required form, parent category, and banner readiness. Incomplete drafts cannot become public.'}</p>
      {saveError && <p role="alert" className="text-sm text-red-700 mt-2">{saveError}</p>}
    </Modal>
    <Modal isOpen={isMoveOpen && target.type === 'subcategory'}
      onClose={isSaving ? () => {} : () => setIsMoveOpen(false)}
      closeOnBackdrop={!isSaving}
      title={isBn ? 'সাব-ক্যাটাগরি অন্য বিভাগে সরান' : 'Move Subcategory'} size="md"
      footer={
        <div className="flex gap-2 justify-end w-full">
          <Button type="button" variant="secondary" disabled={isSaving} onClick={() => setIsMoveOpen(false)}>{isBn ? 'বাতিল' : 'Cancel'}</Button>
          <Button id="taxonomy-move-confirm" type="button" variant="primary" isLoading={isSaving}
            disabled={isSaving || !targetSegmentId || (target.type === 'subcategory' && targetSegmentId === target.data.segmentId)} onClick={handleMove}>
            {isBn ? 'নিষ্ক্রিয় করে সরান' : 'Deactivate and Move'}
          </Button>
        </div>
      }>
      <div className="space-y-4">
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {isBn
            ? 'সরালে আইটেমটি নিষ্ক্রিয় হবে। আগের রিপোর্ট সংরক্ষিত থাকবে; নতুন বিভাগে পুনরায় প্রকাশ ও সক্রিয় করতে হবে।'
            : 'Moving deactivates this subcategory. Historical reports remain intact; explicit review, publication, and reactivation are required.'}
        </p>
        <label htmlFor="taxonomy-move-target" className="block text-sm font-semibold">{isBn ? 'নতুন বিভাগ' : 'Target category'}</label>
        <select id="taxonomy-move-target" value={targetSegmentId} onChange={(event) => setTargetSegmentId(event.target.value)} disabled={isSaving}
          className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white p-2 dark:bg-slate-900 dark:border-slate-700">
          <option value="">{isBn ? 'বিভাগ নির্বাচন করুন' : 'Select category'}</option>
          {allSegments.filter((seg) => target.type === 'subcategory' && seg.id !== target.data.segmentId)
            .map((seg) => <option key={seg.id} value={seg.id}>{isBn ? seg.nameBn : seg.nameEn}</option>)}
        </select>
        {saveError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{saveError}</p>}
      </div>
    </Modal>
    </>
  );
};

export default CategoryDetailDrawer;
