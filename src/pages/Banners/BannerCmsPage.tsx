import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Save, Send } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Textarea } from '@/components/ui/Textarea';
import { LoadingState } from '@/components/common/LoadingState';
import { useLanguage } from '@/context/LanguageContext';
import { recoveryApi } from '@/services/api/recoveryApi';
import { NormalizedBannerRow, RecoveryRecord } from '@/services/recoveryContracts.mjs';
import { baseTokens } from '@/themes/tokens';

const TEXT_FIELDS = [
  { key: 'titleBn', en: 'Title (Bangla)', bn: 'শিরোনাম (বাংলা)', multiline: false },
  { key: 'titleEn', en: 'Title (English)', bn: 'শিরোনাম (ইংরেজি)', multiline: false },
  { key: 'mobileDescriptionBn', en: 'Mobile description (Bangla)', bn: 'মোবাইল বিবরণ (বাংলা)', multiline: true },
  { key: 'mobileDescriptionEn', en: 'Mobile description (English)', bn: 'মোবাইল বিবরণ (ইংরেজি)', multiline: true },
  { key: 'tabletDescriptionBn', en: 'Tablet description (Bangla)', bn: 'ট্যাবলেট বিবরণ (বাংলা)', multiline: true },
  { key: 'tabletDescriptionEn', en: 'Tablet description (English)', bn: 'ট্যাবলেট বিবরণ (ইংরেজি)', multiline: true },
  { key: 'desktopDescriptionBn', en: 'Desktop description (Bangla)', bn: 'ডেস্কটপ বিবরণ (বাংলা)', multiline: true },
  { key: 'desktopDescriptionEn', en: 'Desktop description (English)', bn: 'ডেস্কটপ বিবরণ (ইংরেজি)', multiline: true },
  { key: 'illustrationSrc', en: 'Illustration URL or path', bn: 'ইলাস্ট্রেশনের URL বা পাথ', multiline: false },
  { key: 'primaryCtaBn', en: 'Button label (Bangla)', bn: 'বোতামের লেখা (বাংলা)', multiline: false },
  { key: 'primaryCtaEn', en: 'Button label (English)', bn: 'বোতামের লেখা (ইংরেজি)', multiline: false },
] as const;

const REQUIRED_TEXT_KEYS = TEXT_FIELDS.map((field) => field.key);
const DESCRIPTION_LENGTHS = {
  mobileDescriptionBn: 60,
  tabletDescriptionBn: 60,
  desktopDescriptionBn: 60,
  mobileDescriptionEn: 62,
  tabletDescriptionEn: 62,
  desktopDescriptionEn: 62,
} as const;

const textValue = (value: unknown) => typeof value === 'string' ? value : '';
const displayDate = (value: string | null, locale: string) => value ? new Date(value).toLocaleString(locale) : '—';
type BannerError = 'load' | 'draft-validation' | 'save' | 'publish-validation' | 'publish' | null;
const BANNER_CATEGORY_LABELS: Record<string, { en: string; bn: string }> = {
  harassment: { en: 'Harassment & abuse', bn: 'হয়রানি ও নির্যাতন' },
  load_shedding: { en: 'Utility issues', bn: 'ইউটিলিটি সমস্যা' },
  extortion: { en: 'Extortion', bn: 'চাঁদাবাজি' },
  public_safety: { en: 'Public Safety', bn: 'জননিরাপত্তা' },
  road_transport: { en: 'Road & Transport Issues', bn: 'সড়ক ও যাতায়াত সমস্যা' },
  illegal_occupation: { en: 'Illegal Occupation', bn: 'অবৈধ দখল' },
  rickshaw: { en: 'Illegal auto-rickshaw charging', bn: 'অবৈধ অটো চার্জিং' },
};
const contentLabel = (row: NormalizedBannerRow, key: 'draft_content' | 'published_content', language: 'en' | 'bn') => {
  const field = language === 'bn' ? 'titleBn' : 'titleEn';
  return textValue(row[key][field]) || BANNER_CATEGORY_LABELS[row.category_key]?.[language] || row.category_key;
};
const bannerErrorText = (error: Exclude<BannerError, null>, isBn: boolean) => {
  if (error === 'draft-validation') return isBn
    ? 'সব প্রয়োজনীয় লেখা, দৃশ্যমানতা এবং ১–৯৯ sort order পূরণ করুন।'
    : 'Complete all required text, visibility, and a sort order from 1 to 99.';
  if (error === 'publish-validation') return isBn
    ? 'প্রকাশের আগে সব বিবরণ নির্ধারিত অক্ষরসংখ্যায় পূরণ করুন।'
    : 'Before publishing, complete all required fields and exact description lengths.';
  if (error === 'save') return isBn ? 'খসড়া সংরক্ষণ করা যায়নি। আপনার অনুমতি যাচাই করে আবার চেষ্টা করুন।' : 'Draft could not be saved. Check your access and try again.';
  if (error === 'publish') return isBn ? 'ব্যানার প্রকাশ করা যায়নি। আপনার অনুমতি যাচাই করে আবার চেষ্টা করুন।' : 'Banner could not be published. Check your access and try again.';
  return isBn ? 'ব্যানার লোড করা যায়নি। আবার চেষ্টা করুন।' : 'Banners could not be loaded. Try again.';
};

export const BannerCmsPage: React.FC = () => {
  const { language } = useLanguage();
  const isBn = language === 'bn';
  const [rows, setRows] = useState<NormalizedBannerRow[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [draft, setDraft] = useState<RecoveryRecord>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<BannerError>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRows = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const nextRows = await recoveryApi.getBannerRows();
      setRows(nextRows);
      setSelectedKey((current) => current || nextRows[0]?.category_key || '');
    } catch {
      setError('load');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => { void loadRows(); }, [loadRows]);

  const selectedRow = useMemo(() => rows.find((row) => row.category_key === selectedKey) ?? null, [rows, selectedKey]);
  useEffect(() => {
    setDraft(selectedRow ? { ...selectedRow.draft_content } : {});
    setNotice(null);
  }, [selectedRow]);

  const isDirty = Boolean(selectedRow && JSON.stringify(draft) !== JSON.stringify(selectedRow.draft_content));
  const publishedMatchesDraft = Boolean(selectedRow && JSON.stringify(draft) === JSON.stringify(selectedRow.published_content));
  const requiredFieldsPresent = REQUIRED_TEXT_KEYS.every((key) => textValue(draft[key]).trim().length > 0);
  const sortOrder = Number(draft.sortOrder);
  const sortOrderValid = Number.isInteger(sortOrder) && sortOrder >= 1 && sortOrder <= 99;
  const descriptionLengthsValid = Object.entries(DESCRIPTION_LENGTHS).every(([key, length]) =>
    Array.from(textValue(draft[key])).length === length
  );
  const draftValid = requiredFieldsPresent && sortOrderValid && typeof draft.isActive === 'boolean' && typeof draft.showOnHome === 'boolean';

  const updateField = (key: string, value: string | number | boolean | null) => {
    setNotice(null);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const saveDraft = async () => {
    if (!selectedRow) return;
    if (!draftValid) {
      setError('draft-validation');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await recoveryApi.saveBannerDraft(selectedRow.category_key, draft);
      await loadRows(false);
      setNotice(isBn ? 'খসড়া সংরক্ষিত হয়েছে।' : 'Draft saved.');
    } catch {
      setError('save');
    } finally {
      setSaving(false);
    }
  };

  const publishDraft = async () => {
    if (!selectedRow) return;
    if (!draftValid || !descriptionLengthsValid) {
      setError('publish-validation');
      return;
    }
    const prompt = isBn
      ? `${contentLabel(selectedRow, 'draft_content', language)} ব্যানার প্রকাশ করবেন? এটি পাবলিক সাইটে দেখানো হবে।`
      : `Publish the ${contentLabel(selectedRow, 'draft_content', language)} banner? This updates the public site content.`;
    if (typeof window !== 'undefined' && !window.confirm(prompt)) return;
    setPublishing(true);
    setError(null);
    setNotice(null);
    try {
      await recoveryApi.publishBanner(selectedRow.category_key);
      await loadRows(false);
      setNotice(isBn ? 'ব্যানার প্রকাশিত হয়েছে।' : 'Banner published.');
    } catch {
      setError('publish');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div
      className="space-y-6 pb-12"
      lang={language}
      style={isBn ? { fontFamily: baseTokens.typography.fontFamily.bengali } : undefined}
    >
      <PageHeader
        title={isBn ? 'ব্যানার ব্যবস্থাপনা' : 'Banner CMS'}
        description={isBn
          ? 'সার্ভার-অনুমোদিত ব্যানার খসড়া সম্পাদনা করুন এবং প্রকাশের আগে পূর্বরূপ যাচাই করুন।'
          : 'Edit authorized banner drafts and review the current published version before publishing.'}
        actions={<Button variant="secondary" size="sm" onClick={() => void loadRows()} isLoading={loading} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>{isBn ? 'রিফ্রেশ' : 'Refresh'}</Button>}
      />

      {loading && rows.length === 0 && <LoadingState message={isBn ? 'ব্যানার লোড হচ্ছে…' : 'Loading banners…'} />}
      {error && <Card className="border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20"><CardContent className="flex items-start gap-3 py-4"><AlertTriangle className="mt-0.5 h-4 w-4 text-red-600 dark:text-red-400" /><p className="text-sm text-red-700 dark:text-red-300">{bannerErrorText(error, isBn)}</p></CardContent></Card>}
      {notice && <Card className="border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20"><CardContent className="flex items-center gap-2 py-3"><CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /><p className="text-sm text-emerald-800 dark:text-emerald-300">{notice}</p></CardContent></Card>}

      {rows.length > 0 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.8fr)]">
          <Card className="h-fit">
            <CardHeader><CardTitle>{isBn ? 'ব্যানারসমূহ' : 'Banners'}</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {rows.map((row) => (
                <button
                  key={row.category_key}
                  type="button"
                  aria-pressed={selectedKey === row.category_key}
                  onClick={() => setSelectedKey(row.category_key)}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${selectedKey === row.category_key ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60'}`}
                >
                  <span className="truncate">{contentLabel(row, 'draft_content', language)}</span>
                  <span className="font-mono text-[10px] text-slate-400">v{row.version}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          {selectedRow && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{contentLabel(selectedRow, 'draft_content', language)}</CardTitle>
                  <div className="flex flex-wrap items-center gap-2 pt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <Badge status={publishedMatchesDraft ? 'success' : 'warning'}>{publishedMatchesDraft ? (isBn ? 'প্রকাশিত সংস্করণের সাথে মিল' : 'Matches published') : (isBn ? 'খসড়া পরিবর্তিত' : 'Draft differs')}</Badge>
                    <span>{isBn ? 'খসড়া আপডেট' : 'Draft updated'}: {displayDate(selectedRow.draft_updated_at, language === 'bn' ? 'bn-BD' : 'en-US')}</span>
                    <span>{isBn ? 'প্রকাশিত' : 'Published'}: {displayDate(selectedRow.published_at, language === 'bn' ? 'bn-BD' : 'en-US')}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {TEXT_FIELDS.map((field) => field.multiline ? (
                      <Textarea
                        key={field.key}
                        id={`banner-${field.key}`}
                        label={isBn ? field.bn : field.en}
                        value={textValue(draft[field.key])}
                        onChange={(event) => updateField(field.key, event.target.value)}
                        rows={3}
                        charCount={Array.from(textValue(draft[field.key])).length}
                        maxCharCount={field.key.endsWith('Bn') ? 60 : 62}
                        helperText={isBn
                          ? `প্রকাশের জন্য ঠিক ${field.key.endsWith('Bn') ? 60 : 62} অক্ষর প্রয়োজন।`
                          : `Publishing requires exactly ${field.key.endsWith('Bn') ? 60 : 62} characters.`}
                      />
                    ) : (
                      <Input
                        key={field.key}
                        id={`banner-${field.key}`}
                        label={isBn ? field.bn : field.en}
                        value={textValue(draft[field.key])}
                        onChange={(event) => updateField(field.key, event.target.value)}
                      />
                    ))}
                  </div>

                  <div className="max-w-xs">
                    <Input
                      id="banner-sort-order"
                      type="number"
                      min={1}
                      max={99}
                      step={1}
                      label={isBn ? 'ক্রম (১–৯৯)' : 'Sort order (1–99)'}
                      value={String(draft.sortOrder ?? '')}
                      onChange={(event) => updateField('sortOrder', event.target.value ? Number(event.target.value) : '')}
                      error={draft.sortOrder !== undefined && !sortOrderValid ? (isBn ? '১–৯৯ এর মধ্যে পূর্ণসংখ্যা দিন।' : 'Enter a whole number from 1 to 99.') : undefined}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 dark:border-slate-800 sm:grid-cols-3">
                    {([
                      ['isActive', isBn ? 'ব্যানার সক্রিয়' : 'Active banner'],
                      ['showOnHome', isBn ? 'হোমে দেখান' : 'Show on home'],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex min-h-10 items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={draft[key] === true}
                          onChange={(event) => updateField(key, event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        {label}
                      </label>
                    ))}
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                    <Button variant="secondary" onClick={() => setDraft({ ...selectedRow.draft_content })} disabled={!isDirty || saving || publishing}>{isBn ? 'পরিবর্তন বাতিল' : 'Discard changes'}</Button>
                    <Button variant="primary" onClick={() => void saveDraft()} isLoading={saving} disabled={!isDirty || publishing || !draftValid} leftIcon={<Save className="h-3.5 w-3.5" />}>{isBn ? 'খসড়া সংরক্ষণ' : 'Save draft'}</Button>
                    <Button variant="success" onClick={() => void publishDraft()} isLoading={publishing} disabled={saving || isDirty || !draftValid || !descriptionLengthsValid} leftIcon={<Send className="h-3.5 w-3.5" />}>{isBn ? 'প্রকাশ করুন' : 'Publish'}</Button>
                  </div>
                  {isDirty && <p className="text-right text-xs text-amber-700 dark:text-amber-300">{isBn ? 'প্রকাশের আগে খসড়া সংরক্ষণ করুন।' : 'Save the draft before publishing it.'}</p>}
                  {!descriptionLengthsValid && <p className="text-right text-xs text-amber-700 dark:text-amber-300">{isBn ? 'প্রকাশিত ব্যানারের সব বাংলা বিবরণ ৬০ এবং ইংরেজি বিবরণ ৬২ অক্ষরের হতে হবে।' : 'Published Bengali descriptions must be 60 characters and English descriptions 62 characters.'}</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>{isBn ? 'বর্তমান প্রকাশিত কপি' : 'Published version'}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{textValue(selectedRow.published_content[language === 'bn' ? 'titleBn' : 'titleEn']) || '—'}</p>
                  <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{textValue(selectedRow.published_content[language === 'bn' ? 'desktopDescriptionBn' : 'desktopDescriptionEn']) || '—'}</p>
                  <p className="break-all text-xs text-slate-500 dark:text-slate-400">{textValue(selectedRow.published_content.illustrationSrc) || '—'}</p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {!loading && rows.length === 0 && !error && <Card><CardContent className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">{isBn ? 'কোনো ব্যানার পাওয়া যায়নি।' : 'No banners are available.'}</CardContent></Card>}
    </div>
  );
};

export default BannerCmsPage;
