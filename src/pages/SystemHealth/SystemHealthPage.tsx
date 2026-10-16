import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import { Badge, BadgeStatus } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/common/LoadingState';
import { useLanguage } from '@/context/LanguageContext';
import { recoveryApi } from '@/services/api/recoveryApi';
import { NormalizedSystemHealthPayload, RecoveryRecord } from '@/services/recoveryContracts.mjs';
import { baseTokens } from '@/themes/tokens';

const asRecord = (value: unknown): RecoveryRecord => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecoveryRecord : {};
const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const localizeDigits = (value: unknown, isBn: boolean) => {
  const raw = String(value ?? '');
  if (!isBn) return raw;
  const banglaDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return raw.replace(/[0-9]/g, (digit) => banglaDigits[Number(digit)] || digit);
};
const localizedStatus = (value: unknown, isBn: boolean) => {
  const status = String(value ?? '').toLowerCase();
  if (status === 'healthy') return isBn ? 'স্বাভাবিক' : 'Healthy';
  if (status === 'degraded') return isBn ? 'সীমিত' : 'Degraded';
  if (status === 'critical') return isBn ? 'গুরুতর' : 'Critical';
  return isBn ? 'অজানা' : 'Unknown';
};
const localizedTimestamp = (value: unknown, isBn: boolean) => {
  const raw = text(value, '');
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return localizeDigits(raw, isBn);
  return new Intl.DateTimeFormat(isBn ? 'bn-BD' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dhaka',
  }).format(date);
};
const statusFor = (value: unknown): BadgeStatus => {
  switch (String(value ?? '').toLowerCase()) {
    case 'healthy': return 'success';
    case 'degraded': return 'warning';
    case 'critical': return 'error';
    case 'unknown': return 'default';
    default: return 'default';
  }
};

const ProbeCard: React.FC<{ title: string; probe: RecoveryRecord; language: 'en' | 'bn' }> = ({ title, probe, language }) => (
  <Card>
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        <Badge status={statusFor(probe.status)} dot>{localizedStatus(probe.status, language === 'bn')}</Badge>
      </div>
    </CardHeader>
    <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
      <div><p className="text-slate-500 dark:text-slate-400">HTTP</p><p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">{localizeDigits(text(probe.httpStatus), language === 'bn')}</p></div>
      <div><p className="text-slate-500 dark:text-slate-400">{language === 'bn' ? 'সময়' : 'Latency'}</p><p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">{probe.latencyMs === null || probe.latencyMs === undefined ? '—' : `${localizeDigits(probe.latencyMs, language === 'bn')} ${language === 'bn' ? 'মিলিসেকেন্ড' : 'ms'}`}</p></div>
      <div className="col-span-2"><p className="text-slate-500 dark:text-slate-400">{language === 'bn' ? 'যাচাইয়ের সময়' : 'Checked'}</p><p className="mt-1 break-words text-[11px] text-slate-700 dark:text-slate-300">{localizedTimestamp(probe.checkedAt, language === 'bn')}</p></div>
    </CardContent>
  </Card>
);

export const SystemHealthPage: React.FC = () => {
  const { language } = useLanguage();
  const isBn = language === 'bn';
  const [health, setHealth] = useState<NormalizedSystemHealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setHealth(await recoveryApi.getSystemHealth());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const live = asRecord(health?.live);
  const infrastructure = asRecord(live.infrastructure);
  const database = asRecord(health?.database);
  const serviceCards: Array<[string, RecoveryRecord]> = [
    [isBn ? 'পাবলিক ওয়েবসাইট' : 'Public site', asRecord(live.publicSite)],
    [isBn ? 'অ্যাডমিন ওয়েবসাইট' : 'Admin site', asRecord(live.adminSite)],
    [isBn ? 'ডাটাবেস মেট্রিক্স' : 'Database metrics', asRecord(live.prometheus)],
    [isBn ? 'পাবলিক API' : 'Public API', asRecord(infrastructure.publicApi)],
    [isBn ? 'অথেন্টিকেশন' : 'Authentication', asRecord(infrastructure.auth)],
    [isBn ? 'স্টোরেজ' : 'Storage', asRecord(infrastructure.storage)],
    [isBn ? 'Edge Runtime' : 'Edge runtime', asRecord(infrastructure.edgeRuntime)],
  ];

  return (
    <div
      className="space-y-6 pb-12"
      lang={language}
      style={isBn ? { fontFamily: baseTokens.typography.fontFamily.bengali } : undefined}
    >
      <PageHeader
        title={isBn ? 'সিস্টেম স্বাস্থ্য' : 'System Health'}
        description={isBn
          ? 'লাইভ অবস্থা ও সংযোগ পরীক্ষা। এই পৃষ্ঠা শুধু read mode ব্যবহার করে; কোনো snapshot সংরক্ষণ করে না।'
          : 'Live service and connectivity checks. This page uses read mode and does not persist a snapshot.'}
        actions={<Button variant="secondary" size="sm" onClick={() => void load()} isLoading={loading} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>{isBn ? 'রিফ্রেশ' : 'Refresh'}</Button>}
      />

      {loading && !health && <LoadingState message={isBn ? 'সিস্টেম পরীক্ষা চলছে…' : 'Checking system health…'} />}
      {error && <Card className="border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20"><CardContent className="flex items-start gap-3 py-4"><AlertTriangle className="mt-0.5 h-4 w-4 text-red-600 dark:text-red-400" /><p className="text-sm text-red-800 dark:text-red-300">{isBn ? 'স্বাস্থ্য পরীক্ষা লোড করা যায়নি। আপনার অনুমতি যাচাই করে আবার চেষ্টা করুন।' : 'Health checks could not be loaded. Check your access and try again.'}</p></CardContent></Card>}

      {health && (
        <>
          <Card variant="highlighted">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-1">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300"><Activity className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{isBn ? 'সামগ্রিক অবস্থা' : 'Overall status'}</p>
                <div className="mt-1"><Badge status={statusFor(live.overallStatus)} size="md" dot>{localizedStatus(live.overallStatus, isBn)}</Badge></div>
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
                <p>{isBn ? 'সংগ্রহ করা হয়েছে' : 'Collected'}: {localizedTimestamp(live.collectedAt, isBn)}</p>
                <p className="mt-1">{isBn ? 'Collector সংস্করণ' : 'Collector version'}: {localizeDigits(text(live.collectorVersion), isBn)}</p>
              </div>
            </CardContent>
          </Card>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={isBn ? 'সার্ভিস প্রোব' : 'Service probes'}>
            {serviceCards.map(([title, probe]) => <ProbeCard key={title} title={title} probe={probe} language={language} />)}
          </section>

          <Card>
            <CardHeader><CardTitle>{isBn ? 'ডাটাবেস অবস্থা' : 'Database status'}</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Badge status={statusFor(database.status || infrastructure.databaseStatus)} dot>{localizedStatus(database.status || infrastructure.databaseStatus, isBn)}</Badge>
              <span className="text-xs text-slate-500 dark:text-slate-400">{isBn ? 'পরবর্তী বিস্তারিত ডাটাবেস RPC-এর অনুমতিপ্রাপ্ত আউটপুট থেকে দেখানো হয়।' : 'Database details are limited to the authorized health RPC response.'}</span>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default SystemHealthPage;
