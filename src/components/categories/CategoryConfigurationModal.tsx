import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { categoryApi, TaxonomyConfiguration } from '@/services/api/categoryApi';

type Props = {
  itemType: 'segment' | 'subcategory';
  itemId: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export const CategoryConfigurationModal: React.FC<Props> = ({ itemType, itemId, onClose, onSaved }) => {
  const { language } = useLanguage();
  const bn = language === 'bn';
  const [config, setConfig] = useState<TaxonomyConfiguration | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!itemId) return;
    let stale = false;
    setConfig(null);
    setError(null);
    setBusy(true);
    categoryApi.getTaxonomyConfigurationItem(itemType, itemId).then((item) => {
      if (!stale) setConfig(item);
    }).catch((err: Error) => { if (!stale) setError(err.message); })
      .finally(() => { if (!stale) setBusy(false); });
    return () => { stale = true; };
  }, [itemType, itemId]);

  const update = (value: Partial<TaxonomyConfiguration>) => setConfig((old) => old ? { ...old, ...value } : old);
  const save = async () => {
    if (!config || !itemId) return;
    if (!config.descriptionEn.trim() || !config.descriptionBn.trim()) {
      setError(bn ? 'উভয় ভাষায় বিবরণ লিখুন।' : 'English and Bangla descriptions are required for publication readiness.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await categoryApi.updateTaxonomyConfiguration(itemType, config);
      onSaved();
      onClose();
    } catch (err: any) { setError(err.message || 'Could not save category details.'); }
    finally { setBusy(false); }
  };

  return <Modal isOpen={Boolean(itemId)} onClose={busy ? () => {} : onClose}
    title={bn ? 'ক্যাটাগরি কনফিগারেশন' : 'Category Configuration'} size="lg"
    footer={<div className="flex gap-2 justify-end w-full">
      <Button variant="secondary" disabled={busy} onClick={onClose}>{bn ? 'বাতিল' : 'Cancel'}</Button>
      <Button id="taxonomy-config-save" variant="primary" disabled={!config || busy} isLoading={busy} onClick={save}>{bn ? 'সংরক্ষণ' : 'Save Configuration'}</Button>
    </div>}>
    <div className="space-y-4">
      <p className="text-xs text-slate-500">{itemId} · {bn ? 'আইডি পরিবর্তনযোগ্য নয়' : 'Immutable category identity'}</p>
      {busy && !config && <p role="status" className="text-sm">{bn ? 'লোড হচ্ছে…' : 'Loading configuration…'}</p>}
      {config && <>
        {itemType === 'segment' && <>
          <p className="text-xs text-slate-500">{bn ? 'স্থায়ী URL স্লাগ' : 'Existing URL slug'}: <span className="font-mono">{config.slug}</span></p>
          {(['shortNameEn', 'shortNameBn'] as const).map((key) => <label className="block text-sm space-y-1" key={key}>
            <span>{key === 'shortNameEn' ? 'Short name (English)' : 'সংক্ষিপ্ত নাম (বাংলা)'}</span>
            <input value={config[key] || ''} disabled={busy} onChange={(event) => update({ [key]: event.target.value })}
              className="w-full rounded border border-slate-300 bg-white p-2 dark:bg-slate-900 dark:border-slate-700" />
          </label>)}
        </>}
        {(['descriptionEn', 'descriptionBn'] as const).map((key) => <label className="block text-sm space-y-1" key={key}>
          <span>{key === 'descriptionEn' ? 'Description (English)' : 'বিবরণ (বাংলা)'}</span>
          <textarea rows={3} required value={config[key]} disabled={busy} onChange={(event) => update({ [key]: event.target.value })}
            className="w-full rounded border border-slate-300 bg-white p-2 dark:bg-slate-900 dark:border-slate-700" />
        </label>)}
      </>}
      {error && <p role="alert" className="rounded bg-rose-50 p-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
      <p className="text-xs text-slate-500">{bn
        ? 'নতুন বিভাগ প্রকাশের আগে অনুমোদিত ব্যানার এবং ফর্ম প্রস্তুত থাকতে হবে। প্রকাশ আলাদা নিশ্চিতকরণ ধাপ।'
        : 'New segments also need a reviewed banner; subcategories need a published form. Configuration changes do not publish automatically.'}</p>
    </div>
  </Modal>;
};
