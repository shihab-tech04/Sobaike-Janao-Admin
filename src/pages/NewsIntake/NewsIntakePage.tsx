import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, RefreshCw, ScanSearch, Send } from 'lucide-react';
import { Badge, BadgeStatus } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/common/LoadingState';
import { useLanguage } from '@/context/LanguageContext';
import { recoveryApi } from '@/services/api/recoveryApi';
import { NormalizedNewsDashboard, NormalizedNewsTaxonomy, RecoveryRecord } from '@/services/recoveryContracts.mjs';
import { baseTokens } from '@/themes/tokens';
import {
  getManualNewsCandidates,
  isPublishableSourcedReportPreview,
  NewsSourcePreview,
  publishSelectedNewsCandidates,
} from '@/services/newsIntakeWorkflow.mjs';

interface NewsIntakeData {
  dashboard: NormalizedNewsDashboard;
  scanSources: RecoveryRecord[];
  taxonomy: NormalizedNewsTaxonomy;
}

interface ActivePreview {
  itemId: string;
  source: NewsSourcePreview | null;
  sourceLoading: boolean;
  sourceFailed: boolean;
  report: RecoveryRecord | null;
  reportLoading: boolean;
  reportFailed: boolean;
}

const asRecord = (value: unknown): RecoveryRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecoveryRecord
    : null;

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const localizeDigits = (value: unknown, isBn: boolean): string => {
  const raw = String(value ?? '');
  if (!isBn) return raw;
  const banglaDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return raw.replace(/[0-9]/g, (digit) => banglaDigits[Number(digit)] || digit);
};

const itemStatus = (item: RecoveryRecord, isBn: boolean): { label: string; tone: BadgeStatus } => {
  if (text(item.reportId)) {
    return { label: isBn ? 'প্রতিবেদন যুক্ত' : 'Report linked', tone: 'review' };
  }
  if (item.action === 'created_draft' && item.duplicateStatus === 'clear' && !item.reportId) {
    return { label: isBn ? 'প্রকাশের জন্য প্রস্তুত' : 'Feed ready', tone: 'success' };
  }
  if (item.action === 'skip_duplicate' || item.duplicateStatus === 'exact') {
    return { label: isBn ? 'ডুপ্লিকেট' : 'Duplicate', tone: 'warning' };
  }
  if (item.action === 'needs_review') {
    return { label: isBn ? 'পর্যালোচনা প্রয়োজন' : 'Review required', tone: 'review' };
  }
  if (item.action === 'error') {
    return { label: isBn ? 'ত্রুটি' : 'Error', tone: 'error' };
  }
  return { label: isBn ? 'বাদ দেওয়া হয়েছে' : 'Excluded', tone: 'default' };
};

const itemReason = (item: RecoveryRecord, isBn: boolean): string => {
  if (item.action === 'needs_review') return isBn
    ? 'প্রকাশের আগে ফর্ম বা গোপনীয়তার শর্তে আরও পর্যালোচনা প্রয়োজন।'
    : 'Form or privacy requirements need review before publication.';
  if (item.action === 'error') return isBn
    ? 'উৎসটি নিরাপদে পরীক্ষা করা যায়নি।'
    : 'The source could not be checked safely.';
  if (item.action === 'skip_duplicate') return isBn
    ? 'এই উৎসের লিংক আগে থেকেই রয়েছে।'
    : 'This source URL is already on a report.';
  return isBn
    ? 'এই সংবাদটি ফিডে প্রকাশের শর্ত পূরণ করেনি।'
    : 'This article did not meet the feed publication checks.';
};

const taxonomyName = (
  rows: RecoveryRecord[],
  id: unknown,
  language: 'en' | 'bn'
): string => {
  const key = text(id);
  const match = rows.find((row) => row.id === key);
  if (!match) return key || '—';
  return text(language === 'bn' ? match.nameBn : match.nameEn, text(match.nameEn, key));
};

const safeHttpsUrl = (value: unknown): string => {
  const candidate = text(value);
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port
      ? parsed.toString()
      : '';
  } catch {
    return '';
  }
};

export const NewsIntakePage: React.FC = () => {
  const { language } = useLanguage();
  const isBn = language === 'bn';
  const [data, setData] = useState<NewsIntakeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [actionState, setActionState] = useState<'scan' | 'published' | 'partial' | 'blocked' | 'unknown' | null>(null);
  const [actionCounts, setActionCounts] = useState<{ published: number; blocked: number; uncertain: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [activeItemId, setActiveItemId] = useState('');
  const [activePreview, setActivePreview] = useState<ActivePreview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      setData(await recoveryApi.getNewsIntake());
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const manualRun = useMemo(
    () => data?.dashboard.runs.find((run) => run.triggerType === 'manual') ?? null,
    [data]
  );
  const manualArticles = useMemo(
    () => (manualRun?.items ?? []).filter((item) => item.itemKind === 'article'),
    [manualRun]
  );
  const candidates = useMemo(
    () => getManualNewsCandidates(manualRun) as RecoveryRecord[],
    [manualRun]
  );
  const candidateIds = useMemo(() => candidates.map((item) => text(item.id)).filter(Boolean), [candidates]);
  const candidateIdKey = candidateIds.join('|');
  const activeItem = useMemo(
    () => manualArticles.find((item) => text(item.id) === activeItemId) ?? null,
    [manualArticles, activeItemId]
  );
  const selectedCandidates = useMemo(
    () => candidates.filter((item) => selectedIds.has(text(item.id))),
    [candidates, selectedIds]
  );

  useEffect(() => {
    const allowed = new Set(candidateIds);
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => allowed.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [candidateIdKey]);

  useEffect(() => {
    let cancelled = false;
    if (!activeItem) {
      setActivePreview(null);
      return () => { cancelled = true; };
    }

    const itemId = text(activeItem.id);
    const payload = asRecord(activeItem.reviewPayload);
    const payloadSource = asRecord(payload?.source);
    const sourceUrl = safeHttpsUrl(payloadSource?.canonicalUrl || activeItem.canonicalUrl);
    const canPreviewReport = Boolean(payload && asRecord(payload.report));
    setActivePreview({
      itemId,
      source: null,
      sourceLoading: Boolean(sourceUrl),
      sourceFailed: false,
      report: null,
      reportLoading: canPreviewReport,
      reportFailed: false,
    });

    if (sourceUrl) {
      void recoveryApi.getNewsSourcePreview(sourceUrl).then((source) => {
        if (!cancelled) setActivePreview((current) => current?.itemId === itemId
          ? { ...current, source, sourceLoading: false }
          : current);
      }).catch(() => {
        if (!cancelled) setActivePreview((current) => current?.itemId === itemId
          ? { ...current, sourceLoading: false, sourceFailed: true }
          : current);
      });
    }

    if (canPreviewReport && payload) {
      void recoveryApi.previewSourcedReport(payload).then((report) => {
        if (!cancelled) setActivePreview((current) => current?.itemId === itemId
          ? { ...current, report, reportLoading: false }
          : current);
      }).catch(() => {
        if (!cancelled) setActivePreview((current) => current?.itemId === itemId
          ? { ...current, reportLoading: false, reportFailed: true }
          : current);
      });
    }

    return () => { cancelled = true; };
  }, [activeItem]);

  const checkSources = async () => {
    setScanLoading(true);
    setActionState(null);
    setActionCounts(null);
    setSelectedIds(new Set());
    setActiveItemId('');
    try {
      const result = await recoveryApi.scanNewsIntake();
      setActionState(result.alreadyRunning === true ? 'blocked' : 'scan');
      await load();
    } catch {
      setActionState('blocked');
    } finally {
      setScanLoading(false);
    }
  };

  const selectAll = () => {
    setSelectedIds(new Set(candidateIds));
    if (candidateIds[0]) setActiveItemId(candidateIds[0]);
  };

  const clearSelection = () => setSelectedIds(new Set());

  const toggleSelection = (itemId: string) => {
    setActiveItemId(itemId);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else if (candidateIds.includes(itemId)) next.add(itemId);
      return next;
    });
  };

  const publishSelected = async () => {
    if (selectedCandidates.length === 0) return;
    setPublishLoading(true);
    setActionState(null);
    setActionCounts(null);
    try {
      const result = await publishSelectedNewsCandidates(selectedCandidates, {
        previewSourcedReport: (payload) => recoveryApi.previewSourcedReport(payload as Record<string, unknown>),
        createSourcedReport: (payload) => recoveryApi.createSourcedReport(payload as Record<string, unknown>),
        completeItemReview: (itemId, reportId) => recoveryApi.completeNewsItemReview(itemId, reportId),
        publishComplaint: async (reportId) => { await recoveryApi.publishSourcedReport(reportId); },
      });

      const uncertain = result.blocked.filter((item) => item.outcomeUnknown === true).length;
      const blocked = result.blocked.length - uncertain;
      if (result.writesStarted) {
        setSelectedIds(new Set());
        await load();
      }

      if (uncertain > 0) {
        setActionCounts({ published: result.published.length, blocked, uncertain });
        setActionState('unknown');
      } else if (result.published.length > 0) {
        setActionCounts({ published: result.published.length, blocked, uncertain: 0 });
        setActionState(blocked > 0 ? 'partial' : 'published');
      } else if (result.blocked.length > 0) {
        setActionCounts({ published: 0, blocked: result.blocked.length, uncertain: 0 });
        setActionState('blocked');
      } else {
        setActionState('blocked');
      }
    } catch {
      setActionState('blocked');
    } finally {
      setPublishLoading(false);
    }
  };

  const preview = activePreview?.itemId === text(activeItem?.id) ? activePreview : null;
  const reviewPayload = asRecord(activeItem?.reviewPayload);
  const report = asRecord(reviewPayload?.report);
  const payloadSource = asRecord(reviewPayload?.source);
  const reportPreview = preview?.report;
  const reportPreviewReady = isPublishableSourcedReportPreview(reportPreview);
  const sourceTitle = text(activeItem?.sourceTitle, text(payloadSource?.sourceTitle, isBn ? 'শিরোনাম পাওয়া যায়নি' : 'Untitled source'));
  const sourceLink = preview?.source?.canonicalUrl || safeHttpsUrl(payloadSource?.canonicalUrl || activeItem?.canonicalUrl);
  const itemState = activeItem ? itemStatus(activeItem, isBn) : null;

  const statusText = (state: typeof actionState) => {
    if (state === 'scan') return isBn ? 'উৎস পরীক্ষা সম্পন্ন হয়েছে।' : 'Source check completed.';
    if (state === 'published') return isBn
      ? `${localizeDigits(actionCounts?.published ?? 0, true)}টি নির্বাচিত প্রতিবেদন প্রকাশিত হয়েছে।`
      : `${actionCounts?.published ?? 0} selected reports were published.`;
    if (state === 'partial') return isBn
      ? `${localizeDigits(actionCounts?.published ?? 0, true)}টি প্রকাশিত হয়েছে; ${localizeDigits(actionCounts?.blocked ?? 0, true)}টি আটকে আছে। আটকে থাকা প্রতিবেদন প্রকাশিত হয়নি।`
      : `${actionCounts?.published ?? 0} published; ${actionCounts?.blocked ?? 0} held. Held reports remain unpublished.`;
    if (state === 'unknown') return isBn
      ? `${localizeDigits(actionCounts?.uncertain ?? 0, true)}টি নির্বাচিত আইটেমের ফল নিশ্চিত করা যায়নি। আবার চেষ্টা করার আগে সংবাদ সংগ্রহ ও প্রতিবেদন তালিকা রিফ্রেশ করুন; একই কাজ পুনরাবৃত্তি করবেন না।`
      : `${actionCounts?.uncertain ?? 0} selected item action(s) could not be confirmed. Refresh News Intake and the reports list before retrying; do not repeat the action until its status is visible.`;
    if (state === 'blocked') return actionCounts
      ? isBn
        ? `কোনো প্রতিবেদন প্রকাশিত হয়নি। ${localizeDigits(actionCounts.blocked, true)}টি নির্বাচিত আইটেম পর্যালোচনা বা প্রকাশের শর্ত পূরণ করেনি।`
        : `No reports were published. ${actionCounts.blocked} selected items did not pass review or publication checks.`
      : isBn
        ? 'নির্বাচিত আইটেম যাচাই বা প্রকাশ করা যায়নি। কোনো অসমর্থিত আইটেম প্রকাশ করা হয়নি।'
        : 'Selected items could not pass review or publication checks. Ineligible items were not published.';
    return '';
  };

  return (
    <div
      className="space-y-5 pb-12"
      lang={language}
      style={isBn ? { fontFamily: baseTokens.typography.fontFamily.bengali } : undefined}
    >
      <PageHeader
        title={isBn ? 'সংবাদ সংগ্রহ' : 'News Intake'}
        description={isBn
          ? 'অনুমোদিত উৎস পরীক্ষা করুন, পুনরাবৃত্তি যাচাই করুন এবং ফিডে প্রকাশের আগে প্রতিটি প্রতিবেদন পর্যালোচনা করুন।'
          : 'Check approved sources, review duplicates, and inspect each report before publishing it to the feed.'}
        actions={(
          <>
            <Button variant="primary" size="sm" onClick={() => void checkSources()} isLoading={scanLoading} className="w-full sm:w-auto">
              <ScanSearch className="h-3.5 w-3.5" />
              {isBn ? 'উৎস ও ডুপ্লিকেট পরীক্ষা' : 'Check sources and duplicates'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void load()} isLoading={loading} leftIcon={<RefreshCw className="h-3.5 w-3.5" />} className="w-full sm:w-auto">
              {isBn ? 'রিফ্রেশ' : 'Refresh'}
            </Button>
          </>
        )}
      />

      {loading && !data ? <LoadingState message={isBn ? 'সংবাদ সংগ্রহের তথ্য লোড হচ্ছে…' : 'Loading News Intake…'} /> : null}

      {loadFailed && (
        <Card className="border-red-200 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/20">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-800 dark:text-red-300">
              {isBn ? 'সংবাদ সংগ্রহের তথ্য লোড করা যায়নি। আপনার অনুমতি যাচাই করে আবার চেষ্টা করুন।' : 'News Intake could not be loaded. Check your access and try again.'}
            </p>
          </CardContent>
        </Card>
      )}

      {actionState && (
        <div role="status" aria-live="polite" className={`rounded-md border px-3.5 py-2.5 text-sm ${actionState === 'blocked' || actionState === 'unknown' ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200' : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'}`}>
          {statusText(actionState)}
        </div>
      )}

      {data && (
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>{isBn ? 'মূল উৎস' : 'Raw source'}</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll} disabled={candidateIds.length === 0}>
                    {isBn ? 'সব নির্বাচন' : 'Select All'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearSelection} disabled={selectedIds.size === 0}>
                    {isBn ? 'নির্বাচন বাতিল' : 'Clear'}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {manualRun
                  ? `${localizeDigits(manualArticles.length, isBn)} ${isBn ? 'টি সংবাদ •' : 'articles •'} ${localizeDigits(text(manualRun.startedAt, isBn ? 'সময় অজানা' : 'time unavailable'), isBn)}`
                  : (isBn ? 'ম্যানুয়াল উৎস পরীক্ষা এখনো চালানো হয়নি।' : 'No manual source check has been run yet.')}
              </p>
            </CardHeader>
            <CardContent>
              {!manualRun ? (
                <p className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {isBn ? 'অনুমোদিত সংবাদ উৎস থেকে প্রার্থী আনতে “উৎস ও ডুপ্লিকেট পরীক্ষা” চালান।' : 'Run “Check sources and duplicates” to load candidates from approved news sources.'}
                </p>
              ) : manualArticles.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {isBn ? 'এই পরীক্ষায় কোনো নিবন্ধ পাওয়া যায়নি।' : 'This source check did not return any article items.'}
                </p>
              ) : (
                <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1" aria-label={isBn ? 'পর্যালোচনার জন্য সংবাদ' : 'News items for review'}>
                  {manualArticles.map((item, index) => {
                    const itemId = text(item.id, `news-item-${index}`);
                    const state = itemStatus(item, isBn);
                    const selectable = candidateIds.includes(itemId);
                    const active = text(activeItem?.id) === itemId;
                    return (
                      <div
                        key={itemId}
                        className={`flex min-w-0 items-start gap-3 rounded-md border p-3 transition-colors ${active ? 'border-sky-400 bg-sky-50/60 dark:border-sky-700 dark:bg-sky-950/30' : 'border-slate-200 dark:border-slate-800'}`}
                      >
                        <input
                          aria-label={isBn ? `${text(item.sourceTitle, 'সংবাদ')} নির্বাচন` : `Select ${text(item.sourceTitle, 'source item')}`}
                          type="checkbox"
                          checked={selectedIds.has(itemId)}
                          disabled={!selectable || scanLoading || publishLoading}
                          onChange={() => toggleSelection(itemId)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:cursor-not-allowed"
                        />
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => setActiveItemId(itemId)}
                          className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                        >
                          <span className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {text(item.sourceTitle, isBn ? 'শিরোনাম পাওয়া যায়নি' : 'Untitled source')}
                            </span>
                            <Badge status={state.tone}>{state.label}</Badge>
                          </span>
                          <span className="mt-1 block break-words text-xs text-slate-500 dark:text-slate-400">
                            {text(item.publisherName, text(item.sourceHostname, isBn ? 'প্রকাশক অজানা' : 'Unknown publisher'))}
                            {item.sourcePublishedDate ? ` · ${localizeDigits(text(item.sourcePublishedDate), isBn)}` : ''}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeItem && (
                <section className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800/60" aria-labelledby="raw-source-heading">
                  <h3 id="raw-source-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {isBn ? 'উৎসের বিবরণ' : 'Source details'}
                  </h3>
                  <p className="mt-2 break-words text-sm font-medium text-slate-800 dark:text-slate-200">{preview?.source?.sourceTitle || sourceTitle}</p>
                  <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">
                    {preview?.source?.publisherName || text(activeItem.publisherName, text(activeItem.sourceHostname, isBn ? 'প্রকাশক অজানা' : 'Unknown publisher'))}
                    {preview?.source?.sourcePublishedDate ? ` · ${localizeDigits(preview.source.sourcePublishedDate, isBn)}` : ''}
                  </p>
                  {preview?.sourceLoading && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{isBn ? 'উৎসের বিবরণ লোড হচ্ছে…' : 'Loading approved source details…'}</p>}
                  {preview?.source?.descriptionPreview && (
                    <p lang={text(activeItem.contentLanguage) === 'bn' ? 'bn' : 'en'} className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {preview.source.descriptionPreview}
                    </p>
                  )}
                  {preview?.sourceFailed && (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      {isBn ? 'অনুমোদিত উৎসের বিবরণ পাওয়া যায়নি। মূল লিংকটি সরাসরি খুলুন।' : 'The approved source details are unavailable. Open the original link to review it.'}
                    </p>
                  )}
                  {sourceLink && (
                    <a href={sourceLink} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex max-w-full items-center gap-1.5 break-all text-xs font-medium text-sky-700 underline underline-offset-2 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200">
                      <span>{isBn ? 'মূল সংবাদ খুলুন' : 'Open original article'}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </a>
                  )}
                </section>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>{isBn ? 'ফিডে প্রকাশের পূর্বরূপ' : 'Feed-ready preview'}</CardTitle>
                {itemState && <Badge status={reportPreviewReady ? 'success' : itemState.tone}>{reportPreviewReady ? (isBn ? 'প্রকাশ-যোগ্য' : 'Ready to publish') : itemState.label}</Badge>}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isBn ? 'শিরোনাম, সারাংশ, শ্রেণীবিন্যাস ও ডুপ্লিকেট অবস্থা পরীক্ষা করুন।' : 'Review the title, summary, taxonomy, and duplicate state.'}
              </p>
            </CardHeader>
            <CardContent>
              {!activeItem ? (
                <p className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {isBn ? 'পূর্বরূপ দেখতে একটি সংবাদ নির্বাচন করুন।' : 'Select a news item to see its feed preview.'}
                </p>
              ) : preview?.reportLoading ? (
                <LoadingState size="sm" message={isBn ? 'প্রকাশের শর্ত যাচাই হচ্ছে…' : 'Checking publication requirements…'} />
              ) : reportPreview?.schemaValidation && report ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge status={text(asRecord(reportPreview.duplicate)?.status) === 'clear' ? 'success' : 'warning'}>
                      {text(asRecord(reportPreview.duplicate)?.status) === 'clear' ? (isBn ? 'ডুপ্লিকেট পাওয়া যায়নি' : 'No duplicate found') : (isBn ? 'ডুপ্লিকেট পর্যালোচনা প্রয়োজন' : 'Duplicate review needed')}
                    </Badge>
                    <Badge status={asRecord(reportPreview.schemaValidation)?.ready === true ? 'success' : 'warning'}>
                      {asRecord(reportPreview.schemaValidation)?.ready === true ? (isBn ? 'ফর্ম যাচাই সম্পন্ন' : 'Form checks passed') : (isBn ? 'ফর্ম পর্যালোচনা প্রয়োজন' : 'Form review needed')}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{isBn ? 'বিভাগ ও উপবিভাগ' : 'Category and subcategory'}</p>
                    <p className="break-words text-sm font-medium text-slate-800 dark:text-slate-200">
                      {taxonomyName(data.taxonomy.segments, report.segmentId, language)}
                      {' / '}
                      {taxonomyName(data.taxonomy.subcategories, report.subcategoryId, language)}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{isBn ? 'বাংলা শিরোনাম' : 'Bangla title'}</p>
                    <p lang="bn" className="break-words text-base font-semibold leading-relaxed text-slate-900 dark:text-slate-100">{text(report.titleBn, '—')}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{isBn ? 'ইংরেজি শিরোনাম' : 'English title'}</p>
                    <p lang="en" className="break-words text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-200">{text(report.titleEn, '—')}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{isBn ? 'বাংলা সারাংশ' : 'Bangla summary'}</p>
                    <p lang="bn" className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 dark:text-slate-300">{text(report.descriptionBn, '—')}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{isBn ? 'ইংরেজি সারাংশ' : 'English summary'}</p>
                    <p lang="en" className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 dark:text-slate-300">{text(report.descriptionEn, '—')}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{isBn ? 'ঘটনার স্থান ও তারিখ' : 'Incident location and date'}</p>
                    <p className="break-words text-sm text-slate-700 dark:text-slate-300">
                      {[report.district, report.upazilaOrThana, report.area, report.road, report.landmark]
                        .map((value) => text(value))
                        .filter(Boolean)
                        .join(', ') || (isBn ? 'স্থান যাচাই প্রয়োজন' : 'Location needs review')}
                      {report.incidentDate ? ` · ${localizeDigits(text(report.incidentDate), isBn)}` : ''}
                    </p>
                  </div>

                  {preview?.reportFailed && (
                    <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
                      {isBn ? 'প্রকাশের শর্ত যাচাই করা যায়নি; এই আইটেম প্রকাশ করা যাবে না।' : 'Publication checks could not be verified; this item cannot be published.'}
                    </p>
                  )}
                </div>
              ) : preview?.reportFailed ? (
                <p role="status" className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  {isBn ? 'প্রকাশের শর্ত যাচাই করা যায়নি; এই আইটেম প্রকাশ করা যাবে না।' : 'Publication checks could not be verified; this item cannot be published.'}
                </p>
              ) : text(activeItem.reportId) ? (
                <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                  <p>{isBn ? 'এই উৎসের সঙ্গে একটি প্রতিবেদন যুক্ত হয়েছে। প্রকাশের অবস্থা যাচাই করতে প্রতিবেদন তালিকা রিফ্রেশ করুন।' : 'A report is linked to this source. Refresh the reports list to verify its publication status.'}</p>
                  <p className="break-all text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span>{isBn ? 'প্রতিবেদন আইডি' : 'Report ID'}: </span>
                    <span className="font-mono">{text(activeItem.reportId)}</span>
                  </p>
                </div>
              ) : report ? (
                <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                  <p>{itemReason(activeItem, isBn)}</p>
                  <p className="break-words"><span className="font-medium">{isBn ? 'শ্রেণীবিন্যাস' : 'Category'}:</span> {taxonomyName(data.taxonomy.segments, report.segmentId, language)} / {taxonomyName(data.taxonomy.subcategories, report.subcategoryId, language)}</p>
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {isBn ? 'এই আইটেমের জন্য ফিডে প্রকাশের পূর্বরূপ নেই।' : 'This item has no feed-ready preview.'}
                </p>
              )}

              <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800/60">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isBn ? `${localizeDigits(selectedIds.size, isBn)}টি নির্বাচিত` : `${selectedIds.size} selected`}
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void publishSelected()}
                    disabled={selectedCandidates.length === 0 || scanLoading}
                    isLoading={publishLoading}
                    leftIcon={<Send className="h-3.5 w-3.5" />}
                    className="w-full sm:w-auto"
                  >
                    {isBn ? 'নির্বাচিত সংবাদ প্রকাশ' : 'Publish selected'}
                  </Button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {isBn
                    ? 'প্রকাশের আগে নির্বাচিত সব আইটেমে উৎস, ডুপ্লিকেট, ফর্ম ও গোপনীয়তার শর্ত আবার যাচাই হবে। প্রাথমিক যাচাই ব্যর্থ হলে ব্যাচে কোনো প্রতিবেদন তৈরি হবে না; পরের সার্ভার যাচাইয়ে কোনো আইটেম আটকে গেলে সেটি প্রকাশিত হবে না।'
                    : 'Every selected item is rechecked for approved source, duplicates, form requirements, and privacy before any report is created. A failed preflight blocks the batch; if a later server review holds an item, that report remains unpublished.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default NewsIntakePage;
