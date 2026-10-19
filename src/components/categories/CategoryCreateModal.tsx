import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useLanguage } from '@/context/LanguageContext';
import { TaxonomySegment } from '@/types/Category';
import { TaxonomyCreateInput } from '@/services/api/categoryApi';

export interface CategoryCreateModalProps {
  isOpen: boolean;
  segments: TaxonomySegment[];
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: TaxonomyCreateInput) => void;
}

export const CategoryCreateModal: React.FC<CategoryCreateModalProps> = ({
  isOpen, segments, isSaving, error, onClose, onSave,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';
  const [itemType, setItemType] = useState<'segment' | 'subcategory'>('subcategory');
  const [id, setId] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [parentSegmentId, setParentSegmentId] = useState('');
  const [order, setOrder] = useState('1');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setItemType('subcategory');
    setId('');
    setNameEn('');
    setNameBn('');
    setParentSegmentId('');
    setOrder('1');
    setValidationError(null);
  }, [isOpen]);

  const handleSave = () => {
    const parsedOrder = Number(order);
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(id.trim()) || !nameEn.trim() || !nameBn.trim()
      || (itemType === 'subcategory' && !parentSegmentId)
      || !Number.isInteger(parsedOrder) || parsedOrder < 1 || parsedOrder > 999) {
      setValidationError(isBn
        ? 'সঠিক আইডি, দুটি নাম, বিভাগ ও ১–৯৯৯ ক্রম পূরণ করুন।'
        : 'Enter a valid ID, both names, a parent where required, and order 1–999.');
      return;
    }
    setValidationError(null);
    onSave({ itemType, id: id.trim(), nameEn, nameBn, parentSegmentId, order: parsedOrder });
  };

  return (
    <Modal isOpen={isOpen} onClose={isSaving ? () => {} : onClose} size="md"
      title={isBn ? 'শ্রেণিবিন্যাসের নতুন খসড়া' : 'Create Taxonomy Draft'}
      closeOnBackdrop={!isSaving}
      footer={
        <div className="flex flex-wrap gap-2 justify-end w-full">
          <Button type="button" variant="secondary" disabled={isSaving} onClick={onClose}>{isBn ? 'বাতিল' : 'Cancel'}</Button>
          <Button id="taxonomy-create-confirm" type="button" variant="primary" isLoading={isSaving} disabled={isSaving} onClick={handleSave}>
            {isBn ? 'খসড়া তৈরি করুন' : 'Create Inactive Draft'}
          </Button>
        </div>
      }>
      <div className="space-y-4">
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {isBn ? 'নতুন আইটেম নিষ্ক্রিয় খসড়া হিসেবে তৈরি হবে; ফর্ম পর্যালোচনা ও প্রকাশের আগে জনসাধারণের কাছে যাবে না।'
            : 'New items are inactive drafts. They require form review and explicit publication before Public can use them.'}
        </p>
        <div>
          <label htmlFor="taxonomy-create-type" className="block text-sm font-semibold mb-1">{isBn ? 'ধরন' : 'Item type'}</label>
          <select id="taxonomy-create-type" value={itemType} disabled={isSaving}
            onChange={(event) => setItemType(event.target.value as 'segment' | 'subcategory')}
            className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white p-2 dark:bg-slate-900 dark:border-slate-700">
            <option value="subcategory">{isBn ? 'সাব-ক্যাটাগরি' : 'Subcategory'}</option>
            <option value="segment">{isBn ? 'বিভাগ' : 'Category'}</option>
          </select>
        </div>
        <Input id="taxonomy-create-id" label={isBn ? 'অনন্য আইডি (ইংরেজি ছোট হাতের)' : 'Unique ID (lowercase_underscores)'} value={id} onChange={(e) => setId(e.target.value)} disabled={isSaving} required />
        <Input id="taxonomy-create-name-en" label={isBn ? 'ইংরেজি নাম' : 'Name (English)'} value={nameEn} onChange={(e) => setNameEn(e.target.value)} disabled={isSaving} required />
        <Input id="taxonomy-create-name-bn" label={isBn ? 'বাংলা নাম' : 'Name (Bangla)'} value={nameBn} onChange={(e) => setNameBn(e.target.value)} disabled={isSaving} required />
        {itemType === 'subcategory' && (
          <div>
            <label htmlFor="taxonomy-create-parent" className="block text-sm font-semibold mb-1">{isBn ? 'মূল বিভাগ' : 'Parent category'}</label>
            <select id="taxonomy-create-parent" value={parentSegmentId} onChange={(e) => setParentSegmentId(e.target.value)} disabled={isSaving} required
              className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white p-2 dark:bg-slate-900 dark:border-slate-700">
              <option value="">{isBn ? 'বিভাগ নির্বাচন করুন' : 'Select category'}</option>
              {segments.map((segment) => <option key={segment.id} value={segment.id}>{isBn ? segment.nameBn : segment.nameEn}</option>)}
            </select>
          </div>
        )}
        <Input id="taxonomy-create-order" type="number" step="1" min="1" max="999" label={isBn ? 'প্রদর্শনের ক্রম' : 'Sort order'} value={order} onChange={(e) => setOrder(e.target.value)} disabled={isSaving} required />
        {(error || validationError) && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error || validationError}</p>}
      </div>
    </Modal>
  );
};
