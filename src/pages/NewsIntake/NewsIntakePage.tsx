import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Badge, BadgeStatus } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { LoadingState } from '@/components/common/LoadingState';
import { useLanguage } from '@/context/LanguageContext';
import { recoveryApi } from '@/services/api/recoveryApi';
import { NormalizedNewsDashboard, RecoveryRecord, summarizeNewsRun } from '@/services/recoveryContracts.mjs';

interface NewsIntakeData {
  dashboard: NormalizedNewsDashboard;
  scanSources: RecoveryRecord[];
  taxonomy: { segments: RecoveryRecord[]; subcategories: RecoveryRecord[] };
}

const display = (value: unknown, fallback = '—') => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

const statusBadge = (value: unknown): BadgeStatus => {
  const normalized = String(value ?? '').toLowerCase();
  if (['completed', 'succeeded', 'success', 'published'].includes(normalized)) return 'success';
  if (['running', 'queued', 'pending', 'review'].includes(normalized)) return 'pending';
  if (['failed', 'error', 'critical'].includes(normalized)) return 'error';
  if (['partial', 'degraded', 'warning'].includes(normalized)) return 'warning';
  return 'default';
};

const MetricCard: React.FC<{ label: string; value: string | number; detail?: string }> = ({ label, value, detail }) => (
  <Card padding="sm">
    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
    <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
    {detail && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{detail}</p>}
  </Card>
);

export const NewsIntakePage: React.FC = () => {
  const { language } = useLanguage();
  const isBn = language === 'bn';
  const [data, setData] = useState<NewsIntakeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await recoveryApi.getNewsIntake());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'News Intake data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runs = data?.dashboard.runs ?? [];
  const latestRun = runs[0];
  const latestSummary = latestRun ? summarizeNewsRun(latestRun) : null;
  const automation = data?.dashboard.automation ?? {};

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title={isBn ? 'সংবাদ সংগ্রহ' : 'News Intake'}
        description={isBn
          ? 'অনুমোদিত সংবাদ উৎস, স্বয়ংক্রিয় সংগ্রহ ও সাম্প্রতিক পর্যালোচনা রান দেখুন।'
          : 'Review approved news sources, automation state, and recent intake runs.'}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()} isLoading={loading} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
            {isBn ? 'রিফ্রেশ' : 'Refresh'}
          </Button>
        }
      />

      {loading && !data ? <LoadingState message={isBn ? 'সংবাদ সংগ্রহের তথ্য লোড হচ্ছে…' : 'Loading News Intake…'} /> : null}
      {error && (
        <Card className="border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-red-600 dark:text-red-400" />
            <div>
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">{isBn ? 'তথ্য পাওয়া যায়নি' : 'Unable to load News Intake'}</p>
              <p className="mt-1 text-xs text-red-700 dark:text-red-400">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={isBn ? 'সংবাদ সংগ্রহের সারসংক্ষেপ' : 'News Intake overview'}>
            <MetricCard label={isBn ? 'স্বয়ংক্রিয় সংগ্রহ' : 'Automation'} value={display(automation.enabled, 'Unknown')} detail={automation.running ? (isBn ? 'রান চলছে' : 'A run is active') : undefined} />
            <MetricCard label={isBn ? 'পরবর্তী সময়' : 'Interval'} value={display(automation.intervalHours, '—')} detail={isBn ? 'ঘণ্টা' : 'hours'} />
            <MetricCard label={isBn ? 'সক্রিয় উৎস' : 'Enabled sources'} value={data.scanSources.length} detail={`${data.dashboard.sources.length} ${isBn ? 'মোট উৎস' : 'total sources'}`} />
            <MetricCard label={isBn ? 'সাম্প্রতিক রান' : 'Latest run items'} value={latestSummary?.itemCount ?? 0} detail={latestRun ? display(latestRun.status) : (isBn ? 'রান নেই' : 'No runs yet')} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>{isBn ? 'সাম্প্রতিক রান' : 'Recent runs'}</CardTitle>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">{isBn ? 'কোনো সংগ্রহ রান পাওয়া যায়নি।' : 'No intake runs are available.'}</p>
              ) : (
                <div className="space-y-3">
                  {runs.map((run, index) => {
                    const summary = summarizeNewsRun(run);
                    const runId = display(run.runId, `run-${index + 1}`);
                    return (
                      <details key={runId} className="group rounded-md border border-slate-200 dark:border-slate-800">
                        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-3.5">
                          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                            <Badge status={statusBadge(run.status)}>{display(run.status)}</Badge>
                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{runId.slice(0, 8)}</span>
                            <span className="text-xs text-slate-700 dark:text-slate-300">{display(run.triggerType)}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>{display(run.startedAt)}</span>
                            <span>{summary.itemCount} {isBn ? 'আইটেম' : 'items'}</span>
                            <span>{summary.reviewCount} {isBn ? 'পর্যালোচনা' : 'review'}</span>
                            <span>{summary.errorCount} {isBn ? 'ত্রুটি' : 'errors'}</span>
                          </div>
                        </summary>
                        {run.items.length > 0 && (
                          <div className="border-t border-slate-200 dark:border-slate-800">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>{isBn ? 'শিরোনাম' : 'Source title'}</TableHead>
                                  <TableHead>{isBn ? 'প্রকাশক' : 'Publisher'}</TableHead>
                                  <TableHead>{isBn ? 'বিভাগ' : 'Category'}</TableHead>
                                  <TableHead>{isBn ? 'অবস্থা' : 'Action'}</TableHead>
                                  <TableHead>{isBn ? 'কারণ' : 'Reason'}</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {run.items.map((item, itemIndex) => (
                                  <TableRow key={display(item.id, `${runId}-${itemIndex}`)}>
                                    <TableCell className="max-w-[22rem] truncate">{display(item.sourceTitle)}</TableCell>
                                    <TableCell>{display(item.publisherName)}</TableCell>
                                    <TableCell>{display(item.segmentId)}{item.subcategoryId ? ` / ${display(item.subcategoryId)}` : ''}</TableCell>
                                    <TableCell><Badge status={statusBadge(item.action || item.duplicateStatus)}>{display(item.action || item.duplicateStatus)}</Badge></TableCell>
                                    <TableCell className="max-w-[18rem] truncate">{display(item.reason)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </details>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>{isBn ? 'অনুমোদিত উৎস' : 'Approved sources'}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>{isBn ? 'প্রকাশক' : 'Publisher'}</TableHead><TableHead>Hostname</TableHead><TableHead>{isBn ? 'অবস্থা' : 'Status'}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.dashboard.sources.map((source, index) => (
                      <TableRow key={display(source.hostname, String(index))}>
                        <TableCell>{display(source.publisherName)}</TableCell>
                        <TableCell className="font-mono">{display(source.hostname)}</TableCell>
                        <TableCell><Badge status={source.scanEnabled === true ? 'success' : 'default'}>{source.scanEnabled === true ? (isBn ? 'সক্রিয়' : 'Enabled') : (isBn ? 'বন্ধ' : 'Disabled')}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {data.dashboard.sources.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-slate-500">{isBn ? 'কোনো উৎস নেই।' : 'No sources available.'}</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{isBn ? 'প্রকাশিত শ্রেণীবিন্যাস' : 'Published taxonomy'}</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <MetricCard label={isBn ? 'বিভাগ' : 'Categories'} value={data.taxonomy.segments.length} />
                <MetricCard label={isBn ? 'উপবিভাগ' : 'Subcategories'} value={data.taxonomy.subcategories.length} />
                <p className="col-span-2 text-xs text-slate-500 dark:text-slate-400">{isBn ? 'এই স্ক্রিনে সংগ্রহ ও পর্যালোচনা চালু করা হয় না।' : 'This screen is read-only; scan and review actions are not triggered here.'}</p>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
};

export default NewsIntakePage;
