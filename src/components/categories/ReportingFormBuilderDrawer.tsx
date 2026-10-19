import React, { useEffect, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import {
  isProtectedField, reportingFormApi, REPORTING_FIELD_TYPES,
  ReportingForm, ReportingFormField, validateReportingFormFields,
} from '@/services/api/reportingFormApi';
import { ArrowDown, ArrowUp, Plus, RefreshCw, Save, Send, Trash2 } from 'lucide-react';

type Props = {
  subcategoryId: string | null;
  subcategoryName: string;
  parentActive: boolean;
  subcategoryActive: boolean;
  onClose: () => void;
  onPublished?: () => void;
};

const selectableTypes = REPORTING_FIELD_TYPES.filter((type) =>
  !['location', 'subject_party', 'evidence', 'privacy', 'mob_justice_details'].includes(type));
const choiceTypes = new Set(['select', 'radio', 'multiselect']);

export const ReportingFormBuilderDrawer: React.FC<Props> = ({
  subcategoryId, subcategoryName, parentActive, subcategoryActive, onClose, onPublished,
}) => {
  const { language } = useLanguage();
  const bn = language === 'bn';
  const { hasPermission } = useAuth();
  const canManage = hasPermission('categories.manage');
  const [original, setOriginal] = useState<ReportingForm | null>(null);
  const [fields, setFields] = useState<ReportingFormField[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [publishConfirm, setPublishConfirm] = useState(false);

  useEffect(() => {
    if (!subcategoryId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotice(null);
    setDirty(false);
    reportingFormApi.get(subcategoryId).then((form) => {
      if (cancelled) return;
      setOriginal(form);
      setFields(form.fields);
      setNotes(form.schema?.notes || '');
    }).catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [subcategoryId]);

  const update = (index: number, change: Partial<ReportingFormField>) => {
    setFields((prior) => prior.map((field, i) => i === index ? { ...field, ...change } : field));
    setDirty(true);
    setNotice(null);
  };

  const move = (index: number, direction: number) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const revised = [...fields];
    [revised[index], revised[target]] = [revised[target], revised[index]];
    setFields(revised.map((field, i) => ({ ...field, sortOrder: (i + 1) * 10 })));
    setDirty(true);
  };

  const addField = () => {
    let seq = 1;
    while (fields.some((field) => field.fieldKey === `custom_field_${seq}`)) seq += 1;
    setFields((prior) => [...prior, {
      fieldKey: `custom_field_${seq}`, fieldType: 'text', storageMode: 'custom_json',
      storageKey: `custom_field_${seq}`, labelEn: '', labelBn: '',
      required: false, active: true, sortOrder: Math.min(999, (prior.length + 1) * 10),
      options: [], validation: {}, config: {},
    }]);
    setDirty(true);
  };

  const save = async () => {
    if (!subcategoryId || !canManage) return;
    const invalid = validateReportingFormFields(fields);
    if (invalid) { setError(invalid); return; }
    setSaving(true);
    setError(null);
    try {
      await reportingFormApi.saveDraft(subcategoryId, fields, notes);
      const next = await reportingFormApi.get(subcategoryId);
      setOriginal(next);
      setFields(next.fields);
      setNotes(next.schema?.notes || '');
      setDirty(false);
      setNotice(bn ? 'খসড়া সংরক্ষিত। প্রকাশ করা হয়নি।' : 'Draft saved. It is not published.');
    } catch (err: any) {
      setError(err.message || 'Could not save draft.');
    } finally { setSaving(false); }
  };

  const publish = async () => {
    if (!subcategoryId || !canManage || dirty || original?.schema?.status !== 'draft') return;
    setSaving(true);
    setPublishConfirm(false);
    setError(null);
    try {
      await reportingFormApi.publishForm(subcategoryId);
      const next = await reportingFormApi.get(subcategoryId);
      setOriginal(next);
      setFields(next.fields);
      setNotes(next.schema?.notes || '');
      setNotice(bn ? 'ফর্ম প্রকাশিত। শুধু সক্রিয় শ্রেণিবিন্যাসে পাবলিক ফর্ম দেখা যাবে।'
        : 'Form published. Public visibility still requires an active, published category and subcategory.');
      onPublished?.();
    } catch (err: any) { setError(err.message || 'Could not publish form.'); }
    finally { setSaving(false); }
  };

  const close = () => {
    if (saving) return;
    if (dirty && !window.confirm(bn ? 'অসংরক্ষিত পরিবর্তন বাতিল করবেন?' : 'Discard unsaved form changes?')) return;
    onClose();
  };

  return <>
    <Drawer isOpen={Boolean(subcategoryId)} onClose={close} size="xl"
      title={bn ? 'রিপোর্টিং ফর্ম বিল্ডার' : 'Reporting Form Builder'}
      description={subcategoryName}
      footer={canManage && original ? <div className="flex flex-wrap gap-2 justify-end w-full">
        <Button id="form-draft-save" variant="secondary" disabled={saving || loading || !dirty} isLoading={saving}
          onClick={save} leftIcon={<Save size={16} />}>{bn ? 'খসড়া সংরক্ষণ' : 'Save Draft'}</Button>
        <Button id="form-publish-open" variant="primary" disabled={saving || loading || dirty || original.schema?.status !== 'draft'}
          onClick={() => setPublishConfirm(true)} leftIcon={<Send size={16} />}>
          {bn ? 'ফর্ম পর্যালোচনা ও প্রকাশ' : 'Review & Publish Form'}
        </Button>
      </div> : undefined}>
      <div className="space-y-4">
        <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
          {bn ? 'ফর্ম সংরক্ষণ ও প্রকাশ আলাদা ধাপ। নিষ্ক্রিয় ক্যাটাগরি/সাব-ক্যাটাগরি পাবলিক রিপোর্টিংয়ে দেখাবে না।'
            : 'Saving and publishing are separate steps. Inactive categories/subcategories never appear in public reporting, even with a published form.'}
        </p>
        {(!parentActive || !subcategoryActive) && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" role="status">
          {bn ? 'এই শ্রেণিবিন্যাস এখন নিষ্ক্রিয়। ফর্ম প্রস্তুত করা যাবে, কিন্তু পাবলিকে যাবে না।'
            : 'This taxonomy is inactive. Its form can be staged for review, but will not go public until the taxonomy is explicitly published and activated.'}
        </p>}
        {original?.schema && <p className="text-xs text-slate-500 dark:text-slate-400" id="form-status">
          {bn ? 'সংস্করণ' : 'Version'} {original.schema.version} · {original.schema.status.toUpperCase()} · {fields.length} {bn ? 'টি ফিল্ড' : 'fields'}
        </p>}
        {loading && <p role="status" className="text-sm">{bn ? 'ফর্ম লোড হচ্ছে…' : 'Loading existing form…'}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
        {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{notice}</p>}
        {!loading && !original && <Button variant="secondary" onClick={() => {
          if (subcategoryId) {
            setLoading(true); setError(null);
            reportingFormApi.get(subcategoryId).then((form) => {
              setOriginal(form); setFields(form.fields); setNotes(form.schema?.notes || '');
            }).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
          }
        }} leftIcon={<RefreshCw size={16} />}>{bn ? 'আবার চেষ্টা' : 'Retry'}</Button>}
        {original && <>
          {fields.map((field, index) => {
            const locked = isProtectedField(field);
            return <section key={`${field.fieldKey}-${index}`} className="rounded-xl border border-slate-200 p-3 space-y-3 dark:border-slate-700"
              aria-label={`${field.fieldKey} field`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-mono text-slate-600 dark:text-slate-300">{index + 1}. {field.fieldKey} {locked ? '· Core' : ''}</span>
                {canManage && <div className="flex gap-1">
                  <button aria-label={`Move ${field.fieldKey} up`} disabled={index === 0 || saving} onClick={() => move(index, -1)} className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowUp size={16} /></button>
                  <button aria-label={`Move ${field.fieldKey} down`} disabled={index === fields.length - 1 || saving} onClick={() => move(index, 1)} className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowDown size={16} /></button>
                  {!locked && <button aria-label={`Remove ${field.fieldKey}`} disabled={saving} onClick={() => {
                    setFields((prior) => prior.filter((_, i) => i !== index)); setDirty(true);
                  }} className="p-2 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"><Trash2 size={16} /></button>}
                </div>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['labelEn', 'labelBn'] as const).map((key) => <label key={key} className="text-xs space-y-1 block">
                  <span>{key === 'labelEn' ? 'English label' : 'বাংলা লেবেল'}</span>
                  <input value={field[key] || ''} disabled={!canManage || saving} onChange={(event) => update(index, { [key]: event.target.value })}
                    className="w-full p-2 min-h-10 rounded border border-slate-300 bg-white dark:bg-slate-900 dark:border-slate-700" />
                </label>)}
                {(['helperEn', 'helperBn'] as const).map((key) => <label key={key} className="text-xs space-y-1 block">
                  <span>{key === 'helperEn' ? 'English help text' : 'বাংলা নির্দেশনা'}</span>
                  <input value={field[key] || ''} disabled={!canManage || saving} onChange={(event) => update(index, { [key]: event.target.value })}
                    className="w-full p-2 min-h-10 rounded border border-slate-300 bg-white dark:bg-slate-900 dark:border-slate-700" />
                </label>)}
                <label className="text-xs space-y-1 block"><span>{bn ? 'ফিল্ডের ধরন' : 'Field type'}</span>
                  <select value={field.fieldType} disabled={!canManage || saving || locked || field.storageMode === 'system_block'}
                    onChange={(event) => update(index, { fieldType: event.target.value as ReportingFormField['fieldType'] })}
                    className="w-full p-2 min-h-10 rounded border border-slate-300 bg-white dark:bg-slate-900 dark:border-slate-700">
                    {(!selectableTypes.includes(field.fieldType) ? REPORTING_FIELD_TYPES : selectableTypes).map((type) =>
                      <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
                  </select>
                </label>
                <label className="text-xs space-y-1 block"><span>{bn ? 'প্রদর্শনের ক্রম' : 'Sort order'}</span>
                  <input type="number" min={1} max={999} value={field.sortOrder} disabled={!canManage || saving}
                    onChange={(event) => update(index, { sortOrder: Number(event.target.value) })}
                    className="w-full p-2 min-h-10 rounded border border-slate-300 bg-white dark:bg-slate-900 dark:border-slate-700" />
                </label>
              </div>
              <div className="flex flex-wrap gap-4 text-xs">
                <label className="flex items-center gap-2"><input type="checkbox" checked={field.required} disabled={locked || !canManage || saving}
                  onChange={(event) => update(index, { required: event.target.checked })} />{bn ? 'আবশ্যক' : 'Required'}</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={field.active} disabled={locked || !canManage || saving}
                  onChange={(event) => update(index, { active: event.target.checked })} />{bn ? 'সক্রিয়' : 'Active'}</label>
                <span className="text-slate-400">{field.storageMode} → {field.storageKey}</span>
              </div>
              {choiceTypes.has(field.fieldType) && <div className="space-y-2">
                <p className="text-xs font-medium">{bn ? 'দুই ভাষায় বিকল্প' : 'Bilingual choices'}</p>
                {field.options.map((option, oi) => <div key={oi} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  {(['value', 'labelEn', 'labelBn'] as const).map((key) => <input key={key} aria-label={`${field.fieldKey} option ${oi + 1} ${key}`} placeholder={key}
                    value={option[key] || ''} disabled={!canManage || saving}
                    onChange={(event) => update(index, { options: field.options.map((entry, i) => i === oi ? { ...entry, [key]: event.target.value } : entry) })}
                    className="p-2 min-h-10 rounded border border-slate-300 bg-white dark:bg-slate-900 dark:border-slate-700" />)}
                  <button disabled={!canManage || saving} className="min-h-10 rounded border border-rose-200 text-rose-700" onClick={() => update(index, { options: field.options.filter((_, i) => i !== oi) })}>{bn ? 'মুছুন' : 'Remove'}</button>
                </div>)}
                <Button size="sm" variant="secondary" disabled={!canManage || saving} onClick={() => update(index, { options: [...field.options, { value: '', labelEn: '', labelBn: '' }] })}>
                  {bn ? 'বিকল্প যোগ' : 'Add choice'}
                </Button>
              </div>}
            </section>;
          })}
          {canManage && <Button id="form-add-field" variant="secondary" disabled={saving || fields.length >= 60} onClick={addField} leftIcon={<Plus size={16} />}>
            {bn ? 'কাস্টম ফিল্ড যোগ' : 'Add custom field'}
          </Button>}
          <label className="block text-xs space-y-1"><span>{bn ? 'পর্যালোচনা নোট' : 'Review notes'}</span>
            <textarea rows={3} value={notes} disabled={!canManage || saving} onChange={(event) => { setNotes(event.target.value); setDirty(true); }}
              className="w-full p-2 rounded border border-slate-300 bg-white dark:bg-slate-900 dark:border-slate-700" />
          </label>
        </>}
      </div>
    </Drawer>
    <Modal isOpen={publishConfirm} onClose={() => !saving && setPublishConfirm(false)} title={bn ? 'ফর্ম প্রকাশ নিশ্চিত করুন' : 'Confirm form publication'} size="md"
      footer={<div className="flex gap-2 justify-end w-full">
        <Button variant="secondary" disabled={saving} onClick={() => setPublishConfirm(false)}>{bn ? 'বাতিল' : 'Cancel'}</Button>
        <Button id="form-publish-confirm" variant="primary" disabled={saving || dirty || !canManage} isLoading={saving} onClick={publish}>{bn ? 'প্রকাশ করুন' : 'Publish saved draft'}</Button>
      </div>}>
      <p className="text-sm">{bn ? 'সংরক্ষিত ফর্মটি প্রকাশ করবেন? পরিবর্তন অডিট লগে থাকবে। নিষ্ক্রিয় শ্রেণিবিন্যাস পাবলিক থেকে আড়ালে থাকবে।'
        : 'Publish the saved form version? This operation is audited. Inactive taxonomy stays hidden until an explicit category publication.'}</p>
    </Modal>
  </>;
};
