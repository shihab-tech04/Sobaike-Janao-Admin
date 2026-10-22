import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, KeyRound, ShieldCheck, AlertCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

type Enrollment = { id: string; qrCode: string; secret: string };

/** Server-backed TOTP step-up: no recovery codes, secrets or test OTPs are persisted client-side. */
export const MfaPage: React.FC = () => {
  const { language } = useLanguage();
  const bn = language === 'bn';
  const navigate = useNavigate();
  const location = useLocation();
  const { assuranceLevel, refreshAssuranceLevel, refreshPermissions, logout } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const returnPath = (() => {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    return from && from.startsWith('/') && !from.startsWith('//') && from !== '/security/mfa'
      ? from
      : '/';
  })();

  const loadFactors = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError(bn ? 'প্রমাণীকরণ সেবা কনফিগার করা নেই।' : 'Authentication is not configured.');
      setLoading(false);
      return;
    }
    try {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const verified = data?.totp?.find((factor) => factor.status === 'verified');
      setFactorId(verified?.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load security factors.');
    } finally {
      setLoading(false);
    }
  }, [bn]);

  useEffect(() => { void loadFactors(); }, [loadFactors]);

  const handleEnroll = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (enrollError || !data?.totp) throw enrollError || new Error('TOTP setup unavailable.');
      setEnrollment({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
      setFactorId(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start authenticator setup.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) {
      setError(bn ? '৬ সংখ্যার কোড দিন।' : 'Enter a six-digit code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (verifyError) throw verifyError;
      const level = await refreshAssuranceLevel();
      if (level !== 'aal2') throw new Error('MFA assurance could not be confirmed.');
      await refreshPermissions();
      setCode('');
      setEnrollment(null);
      navigate(returnPath, { replace: true });
    } catch (err) {
      setCode('');
      setError(err instanceof Error ? err.message : 'Verification failed. Try a new code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-lg space-y-5 py-6 sm:py-10" aria-labelledby="mfa-title">
      <header className="space-y-3">
        <div className="flex items-center gap-3 text-sky-700 dark:text-sky-300">
          <ShieldCheck className="h-8 w-8" aria-hidden="true" />
          <h1 id="mfa-title" className="text-2xl font-bold">
            {bn ? 'দুই ধাপের যাচাইকরণ' : 'Two-step verification'}
          </h1>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {bn
            ? 'প্রশাসনিক পরিবর্তন ও সংবেদনশীল তথ্যের জন্য অথেনটিকেটর অ্যাপ দিয়ে পরিচয় যাচাই করুন।'
            : 'Verify with an authenticator app before changing administration settings or accessing sensitive information.'}
        </p>
      </header>

      {error && (
        <div role="alert" className="flex gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />{error}
        </div>
      )}

      {assuranceLevel === 'aal2' ? (
        <div className="space-y-4 rounded-xl border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950">
          <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5" />{bn ? 'যাচাইকরণ সম্পন্ন' : 'Verification active'}</div>
          <button type="button" onClick={() => navigate(returnPath, { replace: true })} className="min-h-11 rounded-lg bg-sky-700 px-5 py-2 font-semibold text-white hover:bg-sky-800">
            {bn ? 'ফিরে যান' : 'Continue'}
          </button>
        </div>
      ) : loading ? (
        <p role="status">{bn ? 'অ্যাকাউন্ট যাচাই হচ্ছে…' : 'Checking your security factors…'}</p>
      ) : (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
          {!factorId && !enrollment && (
            <div className="space-y-4">
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {bn ? 'একটি অথেনটিকেটর অ্যাপ দিয়ে আপনার অ্যাকাউন্ট সুরক্ষিত করুন।' : 'Set up a time-based authenticator app to protect your admin account.'}
              </p>
              <button type="button" disabled={busy} onClick={handleEnroll} className="min-h-11 rounded-lg bg-sky-700 px-5 py-2 font-semibold text-white disabled:opacity-60 hover:bg-sky-800">
                <KeyRound className="mr-2 inline h-4 w-4" />{bn ? 'অথেনটিকেটর সেটআপ' : 'Set up authenticator'}
              </button>
            </div>
          )}

          {enrollment && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">{bn ? 'অ্যাপ দিয়ে QR কোড স্ক্যান করুন' : 'Scan this QR code with your authenticator app'}</p>
              <img src={enrollment.qrCode} alt={bn ? 'অথেনটিকেটর সেটআপ QR কোড' : 'Authenticator setup QR code'} className="mx-auto h-48 w-48 max-w-full rounded-lg bg-white p-2" />
              <p className="break-all text-xs text-slate-600 dark:text-slate-300">
                {bn ? 'স্ক্যান করতে না পারলে এই কোডটি লিখুন:' : 'If you cannot scan it, enter this setup key:'}
              </p>
              <code className="block select-all break-all rounded-md bg-slate-100 p-3 text-center text-sm dark:bg-slate-800">{enrollment.secret}</code>
              <p className="text-xs text-slate-500 dark:text-slate-400">{bn ? 'এই গোপন কোড অন্য কাউকে দেবেন না।' : 'Keep this setup key private; it will not be saved here.'}</p>
            </div>
          )}

          {factorId && (
            <form onSubmit={handleVerify} className="space-y-3">
              <label htmlFor="mfa-otp" className="block text-sm font-semibold">{bn ? '৬ সংখ্যার যাচাইকরণ কোড' : 'Six-digit verification code'}</label>
              <input id="mfa-otp" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} required className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-center text-lg tracking-[0.3em] text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
              <button type="submit" disabled={busy || code.length !== 6} className="min-h-11 w-full rounded-lg bg-sky-700 px-5 py-2 font-semibold text-white hover:bg-sky-800 disabled:opacity-60">
                {busy ? (bn ? 'যাচাই হচ্ছে…' : 'Verifying…') : (bn ? 'যাচাই করুন' : 'Verify and continue')}
              </button>
            </form>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-sm">
        <button type="button" onClick={() => void logout().then(() => navigate('/login', { replace: true }))} className="min-h-11 text-slate-600 underline dark:text-slate-300">
          {bn ? 'লগআউট' : 'Sign out'}
        </button>
      </div>
    </section>
  );
};

export default MfaPage;
