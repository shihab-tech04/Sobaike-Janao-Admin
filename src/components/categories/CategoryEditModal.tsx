import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { useLanguage } from '@/context/LanguageContext';
import {
  TaxonomyItemType,
  TaxonomySegment,
  TaxonomySubcategory,
  TaxonomyUpdateInput,
} from '@/types/Category';
import { AlertCircle } from 'lucide-react';

export interface CategoryEditModalProps {
  isOpen: boolean;
  itemType: TaxonomyItemType | null;
  item: TaxonomySegment | TaxonomySubcategory | null;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: TaxonomyUpdateInput) => void;
}

export const CategoryEditModal: React.FC<CategoryEditModalProps> = ({
  isOpen,
  itemType,
  item,
  isSaving,
  error,
  onClose,
  onSave,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';
  const [nameEn, setNameEn] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [order, setOrder] = useState('0');
  const [active, setActive] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !item) return;
    setNameEn(item.nameEn);
    setNameBn(item.nameBn);
    setOrder(String(item.order));
    setActive(item.status === 'active');
    setValidationError(null);
  }, [isOpen, item]);

  if (!item || !itemType) return null;

  const handleSave = () => {
    const trimmedNameEn = nameEn.trim();
    const trimmedNameBn = nameBn.trim();
    const parsedOrder = Number(order);

    if (!trimmedNameEn || !trimmedNameBn) {
      setValidationError(
        isBn ? 'ইংরেজি ও বাংলা—দুইটি নামই আবশ্যক।' : 'Both English and Bangla names are required.'
      );
      return;
    }

    if (!Number.isInteger(parsedOrder)) {
      setValidationError(isBn ? 'সোর্ট অর্ডার পূর্ণসংখ্যা হতে হবে।' : 'Sort order must be an integer.');
      return;
    }

    setValidationError(null);
    onSave({
      itemType,
      id: item.id,
      nameEn: trimmedNameEn,
      nameBn: trimmedNameBn,
      status: active ? 'active' : 'inactive',
      order: parsedOrder,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isSaving ? () => {} : onClose}
      title={
        itemType === 'segment'
          ? isBn
            ? 'বিভাগ সম্পাদনা করুন'
            : 'Edit Segment'
          : isBn
          ? 'সাব-ক্যাটাগরি সম্পাদনা করুন'
          : 'Edit Subcategory'
      }
      size="md"
      closeOnBackdrop={!isSaving}
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 w-full">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSaving}
            className="w-full sm:w-auto min-h-[44px]"
          >
            {isBn ? 'বাতিল' : 'Cancel'}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSave}
            isLoading={isSaving}
            disabled={isSaving}
            className="w-full sm:w-auto min-h-[44px]"
          >
            {isBn ? 'সংরক্ষণ করুন' : 'Save Changes'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isBn ? 'অনন্য আইডি পরিবর্তন করা যাবে না' : 'Unique ID is read-only'}
          </p>
          <p className="mt-1 text-sm font-mono font-semibold text-slate-800 dark:text-slate-200 break-all">
            {item.id}
          </p>
        </div>

        <Input
          id="taxonomy-name-en"
          label={isBn ? 'ইংরেজি নাম' : 'Name (English)'}
          value={nameEn}
          onChange={(event) => setNameEn(event.target.value)}
          disabled={isSaving}
          required
        />

        <Input
          id="taxonomy-name-bn"
          label={isBn ? 'বাংলা নাম' : 'Name (Bangla)'}
          value={nameBn}
          onChange={(event) => setNameBn(event.target.value)}
          disabled={isSaving}
          required
        />

        <Input
          id="taxonomy-sort-order"
          type="number"
          step="1"
          label={isBn ? 'প্রদর্শনের ক্রম' : 'Sort Order'}
          value={order}
          onChange={(event) => setOrder(event.target.value)}
          disabled={isSaving}
        />

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5">
          <Switch
            id="taxonomy-active-switch"
            checked={active}
            onChange={setActive}
            disabled={isSaving}
            label={isBn ? 'পাবলিক রিপোর্টিংয়ে সক্রিয়' : 'Active in public reporting'}
            description={
              isBn
                ? 'নিষ্ক্রিয় করলে নতুন পাবলিক রিপোর্টিং অপশনে এই আইটেমটি দেখানো হবে না।'
                : 'Inactive items are removed from new public reporting options.'
            }
          />
        </div>

        {(validationError || error) && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{validationError || error}</p>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default CategoryEditModal;
